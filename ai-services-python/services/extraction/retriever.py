"""
Domain-partitioned RAG retrieval for the multi-agent extraction pipeline.

Instead of merging everything into one pool, each domain (identity, financial,
bank, loan, promoter, collateral) retrieves independently from pgvector.
This prevents high-scoring financial chunks from crowding out identity chunks
(and vice versa) in the final context window.

Each domain uses multiple targeted queries to maximize recall before
the cross-encoder re-ranker prunes to top-K.
"""
from __future__ import annotations

import asyncio
from loguru import logger

from config.settings import get_settings
from services.llm.llm_facade import embed_batch
from services.vectordb.pgvector_service import (
    query_keyword_chunks,
    query_similar_chunks,
    query_structured_fact_chunks,
)

settings = get_settings()




DOMAIN_QUERIES: dict[str, list[str]] = {
    "identity": [
        "GSTIN GST identification number tax registration certificate",
        "PAN permanent account number income tax",
        "CIN company identification number MCA ROC registration",
        "LLPIN LLP limited liability partnership identification deed",
    ],
    "financial": [
        "annual turnover total revenue sales financial year profit loss statement",
        "net profit loss after tax PAT PBT audited accounts",
        "total liabilities current non-current debt obligations balance sheet",
        "gross revenue operating income EBITDA FY audited financial",
    ],
    "bank": [
        "average monthly balance ABM bank statement account",
        "cheque bounce dishonour return ECS NACH mandate",
        "bank account transaction debit credit inward outward",
    ],
    "loan": [
        "outstanding loan balance EMI installment lender bank NBFC",
        "existing liabilities debt loan repayment schedule",
        "term loan working capital OD overdraft limit sanctions",
    ],
    "promoter": [
        "promoter director shareholder DIN designation ownership percentage stake",
        "partners proprietor authorized signatory beneficial owner",
        "board of directors management profile equity holding",
    ],
    "collateral": [
        "collateral security mortgage pledge property land building",
        "hypothecation fixed asset vehicle machinery guarantee",
        "estimated value market value primary security collateral documents",
    ],
}

DOMAIN_DOCUMENT_TYPES: dict[str, list[str]] = {
    "identity": ["id_document", "itr", "gst_certificate", "pan", "aadhaar", "general"],
    "financial": ["balance_sheets", "itr", "profit_loss", "general"],
    "bank": ["bank_statements", "general"],
    "loan": ["general", "loan_documents", "balance_sheets", "bank_statements"],
    "promoter": ["id_document", "general"],
    "collateral": ["general"],
}

DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "identity": ["GSTIN", "PAN", "CIN", "LLPIN", "registration", "permanent account"],
    "financial": ["turnover", "revenue", "net profit", "liabilities", "balance sheet", "profit and loss"],
    "bank": ["average monthly balance", "opening balance", "closing balance", "debit", "credit", "cheque bounce"],
    "loan": ["loan amount", "outstanding", "EMI", "installment", "sanction", "overdraft"],
    "promoter": ["promoter", "director", "shareholder", "partner", "DIN", "ownership"],
    "collateral": ["collateral", "security", "mortgage", "market value", "appraised value", "valuation"],
}

DOMAIN_FACT_KEYS: dict[str, list[str]] = {
    "identity": ["pan", "gstin", "aadhaar_hint", "document_number_hint", "name"],
    "financial": ["revenue", "net_profit", "total_liabilities", "total_assets", "gross_income"],
    "bank": ["account_holder", "statement_period", "opening_balance", "closing_balance", "account_number_hint"],
    "loan": ["loan_amount", "emi", "tenure", "interest_rate"],
    "promoter": ["name", "pan"],
    "collateral": ["property_address", "appraised_value", "valuation_date"],
}




def _tag_domain(chunks: list[dict], domain: str) -> list[dict]:
    """Add a 'domain' key to each chunk for downstream traceability."""
    for c in chunks:
        c["domain"] = domain
    return chunks


def _dedupe_key(chunk: dict) -> str:
    metadata = chunk.get("metadata") or {}
    source = metadata.get("job_id") or chunk.get("document_name", "")
    chunk_index = metadata.get("chunk_index")
    if chunk_index is not None:
        return f"{source}:{chunk_index}"
    return chunk.get("text", "").strip()


def _merge_candidate_results(results_nested: list[list[dict]]) -> list[dict]:
    """Merge vector, keyword, and structured-fact candidates."""
    seen: dict[str, dict] = {}
    for result in results_nested:
        for chunk in result:
            text = chunk.get("text", "").strip()
            if not text or len(text) < 20:
                continue

            key = _dedupe_key(chunk)
            source = chunk.get("retrieval_source", "unknown")
            existing = seen.get(key)

            if not existing:
                chunk["retrieval_sources"] = [source]
                seen[key] = chunk
                continue

            sources = set(existing.get("retrieval_sources", []))
            sources.add(source)
            existing["retrieval_sources"] = sorted(sources)
            existing["score"] = max(existing.get("score", 0.0), chunk.get("score", 0.0))

            if len(chunk.get("text", "")) > len(existing.get("text", "")):
                existing["text"] = chunk["text"]

    return list(seen.values())




async def retrieve_domain(
    domain: str,
    queries: list[str],
    application_id: str,
    candidate_k: int,
) -> list[dict]:
    """
    Retrieve and deduplicate chunks for a single domain.

    Args:
        domain:         Domain name (e.g. "identity").
        queries:        List of retrieval queries for this domain.
        application_id: Filter to this application's embeddings.
        candidate_k:    Maximum chunks to return (before re-ranking).

    Returns:
        List of unique chunk dicts, sorted by descending cosine score.
    """
    
    try:
        embeddings = await embed_batch(queries, use_last_key=True)
    except Exception as e:
        logger.error(f"[Retriever] Failed to embed queries for domain={domain}: {e}")
        embeddings = []

    document_types = DOMAIN_DOCUMENT_TYPES.get(domain)

    
    
    per_query_limit = max(20, candidate_k // len(queries) + 10)

    async def _search(vec: list[float]) -> list[dict]:
        try:
            return await query_similar_chunks(
                vec,
                application_id,
                limit=per_query_limit,
                document_types=document_types,
            )
        except Exception as exc:
            logger.warning(f"[Retriever] pgvector query failed for domain={domain}: {exc}")
            return []

    async def _keyword_search() -> list[dict]:
        try:
            return await query_keyword_chunks(
                application_id=application_id,
                keywords=DOMAIN_KEYWORDS.get(domain, []),
                limit=candidate_k,
                document_types=document_types,
            )
        except Exception as exc:
            logger.warning(f"[Retriever] keyword query failed for domain={domain}: {exc}")
            return []

    async def _fact_search() -> list[dict]:
        try:
            return await query_structured_fact_chunks(
                application_id=application_id,
                fact_keys=DOMAIN_FACT_KEYS.get(domain, []),
                limit=candidate_k,
                document_types=document_types,
            )
        except Exception as exc:
            logger.warning(f"[Retriever] structured-fact query failed for domain={domain}: {exc}")
            return []

    results_nested = await asyncio.gather(
        *[_search(vec) for vec in embeddings],
        _keyword_search(),
        _fact_search(),
    )

    ranked = sorted(
        _merge_candidate_results(results_nested),
        key=lambda c: c["score"],
        reverse=True,
    )[:candidate_k]
    _tag_domain(ranked, domain)

    logger.info(
        f"[Retriever] domain={domain:12s} -> {len(ranked):3d} unique chunks "
        f"(score {ranked[-1]['score']:.3f}–{ranked[0]['score']:.3f})"
        if ranked else
        f"[Retriever] domain={domain:12s} -> 0 chunks found"
    )
    return ranked




async def retrieve_all_domains(
    application_id: str,
    candidate_k: int | None = None,
) -> dict[str, list[dict]]:
    """
    Run retrieval for all 6 domains concurrently or sequentially.

    Returns:
        dict mapping domain_name -> list[chunk_dict]
    """
    candidate_k = candidate_k or settings.EXTRACTION_TOP_K_CANDIDATE

    tasks = {
        domain: retrieve_domain(domain, queries, application_id, candidate_k)
        for domain, queries in DOMAIN_QUERIES.items()
    }

    if settings.ENABLE_PARALLEL_EXECUTION:
        domain_results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    else:
        domain_results = []
        for task in tasks.values():
            try:
                res = await task
                domain_results.append(res)
            except Exception as e:
                domain_results.append(e)

    domain_chunks: dict[str, list[dict]] = {}

    for domain, result in zip(tasks.keys(), domain_results):
        if isinstance(result, Exception):
            logger.error(f"[Retriever] Domain '{domain}' retrieval failed: {result}")
            domain_chunks[domain] = []
        else:
            domain_chunks[domain] = result

    total = sum(len(v) for v in domain_chunks.values())
    logger.info(f"[Retriever] Total chunks across all domains: {total}")
    return domain_chunks


async def retrieve_targeted(
    fields: list[str],
    application_id: str,
    candidate_k: int = 20,
) -> list[dict]:
    """
    Second-pass targeted retrieval for a specific list of missing fields.
    Maps each field back to its domain and retrieves only for that domain.

    Returns a flat, deduplicated list of chunks.
    """
    
    field_domain_map = {
        "gstin": "identity", "pan": "identity",
        "cin": "identity", "llpin": "identity",
        "annual_turnover": "financial", "net_profit": "financial",
        "total_liabilities": "financial",
        "avg_monthly_balance": "bank", "cheque_bounce_count": "bank",
        "loan_balances": "loan",
        "promoter_details": "promoter",
        "collateral_details": "collateral",
    }

    
    domains_needed: set[str] = set()
    for f in fields:
        d = field_domain_map.get(f)
        if d:
            domains_needed.add(d)

    if not domains_needed:
        return []

    logger.info(f"[Retriever] Second-pass domains: {domains_needed} for fields: {fields}")

    tasks = {
        d: retrieve_domain(d, DOMAIN_QUERIES[d], application_id, candidate_k)
        for d in domains_needed
    }
    
    if settings.ENABLE_PARALLEL_EXECUTION:
        results_nested = await asyncio.gather(*tasks.values(), return_exceptions=True)
    else:
        results_nested = []
        for task in tasks.values():
            try:
                res = await task
                results_nested.append(res)
            except Exception as e:
                results_nested.append(e)

    
    seen: dict[str, dict] = {}
    for result in results_nested:
        if isinstance(result, Exception):
            continue
        for chunk in result:
            text = chunk.get("text", "").strip()
            if text and text not in seen:
                seen[text] = chunk

    return list(seen.values())
