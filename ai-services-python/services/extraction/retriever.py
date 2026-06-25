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
from services.llm.azure_openai import embed_batch
from services.vectordb.pgvector_service import query_similar_chunks

settings = get_settings()

# ── Domain query definitions ──────────────────────────────────────────────────
# Multiple queries per domain maximise recall across different phrasings.

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


# ── Domain-aware chunk dict ───────────────────────────────────────────────────

def _tag_domain(chunks: list[dict], domain: str) -> list[dict]:
    """Add a 'domain' key to each chunk for downstream traceability."""
    for c in chunks:
        c["domain"] = domain
    return chunks


# ── Per-domain retrieval ──────────────────────────────────────────────────────

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
    # Embed all queries in a single batch call
    try:
        embeddings = await embed_batch(queries)
    except Exception as e:
        logger.error(f"[Retriever] embed_batch failed for domain={domain}: {e}")
        return []

    # Run all pgvector searches in parallel; retrieve more than candidate_k
    # per individual query so dedup doesn't starve the pool.
    per_query_limit = max(20, candidate_k // len(queries) + 10)

    async def _search(vec: list[float]) -> list[dict]:
        try:
            return await query_similar_chunks(vec, application_id, limit=per_query_limit)
        except Exception as exc:
            logger.warning(f"[Retriever] pgvector query failed for domain={domain}: {exc}")
            return []

    results_nested = await asyncio.gather(*[_search(vec) for vec in embeddings])

    # Deduplicate by text; keep the chunk with the best cosine score
    seen: dict[str, dict] = {}
    for result in results_nested:
        for chunk in result:
            text = chunk.get("text", "").strip()
            if not text or len(text) < 20:
                continue
            existing = seen.get(text)
            if not existing or existing["score"] < chunk["score"]:
                seen[text] = chunk

    ranked = sorted(seen.values(), key=lambda c: c["score"], reverse=True)[:candidate_k]
    _tag_domain(ranked, domain)

    logger.info(
        f"[Retriever] domain={domain:12s} → {len(ranked):3d} unique chunks "
        f"(score {ranked[-1]['score']:.3f}–{ranked[0]['score']:.3f})"
        if ranked else
        f"[Retriever] domain={domain:12s} → 0 chunks found"
    )
    return ranked


# ── Main entrypoint ───────────────────────────────────────────────────────────

async def retrieve_all_domains(
    application_id: str,
    candidate_k: int | None = None,
) -> dict[str, list[dict]]:
    """
    Run retrieval for all 6 domains concurrently.

    Returns:
        dict mapping domain_name → list[chunk_dict]
        Each chunk has keys: text, score, document_type, document_name,
                              page_number, metadata, domain
    """
    candidate_k = candidate_k or settings.EXTRACTION_TOP_K_CANDIDATE

    tasks = {
        domain: retrieve_domain(domain, queries, application_id, candidate_k)
        for domain, queries in DOMAIN_QUERIES.items()
    }

    # Run all 6 domains in parallel
    domain_results = await asyncio.gather(*tasks.values(), return_exceptions=True)
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
    # Map field names to domains
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

    # Collect unique domains for the missing fields
    domains_needed: set[str] = set()
    for f in fields:
        d = field_domain_map.get(f)
        if d:
            domains_needed.add(d)

    if not domains_needed:
        return []

    logger.info(f"[Retriever] Second-pass domains: {domains_needed} for fields: {fields}")

    tasks = [
        retrieve_domain(d, DOMAIN_QUERIES[d], application_id, candidate_k)
        for d in domains_needed
    ]
    results_nested = await asyncio.gather(*tasks, return_exceptions=True)

    # Merge and deduplicate
    seen: dict[str, dict] = {}
    for result in results_nested:
        if isinstance(result, Exception):
            continue
        for chunk in result:
            text = chunk.get("text", "").strip()
            if text and text not in seen:
                seen[text] = chunk

    return list(seen.values())
