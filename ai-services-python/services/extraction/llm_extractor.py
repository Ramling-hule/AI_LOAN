"""
LLM Extractor — backward-compatible shim wrapping the new orchestrator.

This module preserves the public API used by:
  - extraction_service.py  (extract_parameters, extract_missing_fields)
  - underwriting_service.py (retrieve_chunks_for_extraction)

Internally, extract_parameters() now delegates to orchestrator.run_pipeline()
which executes the full 9-step multi-agent pipeline.
"""
from __future__ import annotations

import asyncio
import json
from loguru import logger

from config.settings import get_settings
from services.llm.llm_facade import embed_batch
from services.vectordb.pgvector_service import query_similar_chunks
from services.extraction.orchestrator import run_pipeline

settings = get_settings()


EXTRACTION_QUERIES = [
    "GSTIN GST identification number PAN permanent account number CIN company registration",
    "annual turnover revenue net profit loss financial statements",
    "bank balance average monthly balance cheque bounce ECS NACH return",
    "outstanding loan balance EMI liabilities debt obligations",
    "promoter director shareholder DIN designation ownership stake",
    "collateral property asset security mortgage pledge",
    "LLPIN LLP identification number partnership deed",
]


async def retrieve_chunks_for_extraction(
    application_id: str,
    top_k: int | None = None,
) -> list[dict]:
    """
    Retrieve relevant document chunks using 7 parallel RAG queries.
    Preserved for use by underwriting_service.py.

    Returns a flat, deduplicated list sorted by cosine similarity score.
    """
    top_k = top_k or settings.EXTRACTION_TOP_K
    seen: dict[str, dict] = {}

    query_embeddings = await embed_batch(EXTRACTION_QUERIES)

    async def search(vec):
        return await query_similar_chunks(vec, application_id, limit=max(8, top_k // 2))

    results = await asyncio.gather(
        *[search(vec) for vec in query_embeddings],
        return_exceptions=True,
    )

    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.warning(f"[LLM Extractor] RAG query {i+1} failed: {result}")
            continue
        for chunk in result:
            text = chunk.get("text", "")
            if not text or len(text.strip()) < 20:
                continue
            existing = seen.get(text)
            if not existing or existing["score"] < chunk["score"]:
                seen[text] = chunk

    ranked = sorted(seen.values(), key=lambda c: c["score"], reverse=True)[:top_k]

    if ranked:
        logger.info(
            f"[LLM Extractor] Retrieved {len(ranked)} unique chunks for app={application_id} "
            f"(score range: {ranked[-1]['score']:.3f}–{ranked[0]['score']:.3f})"
        )
    else:
        logger.warning(f"[LLM Extractor] ⚠️ No chunks found for application_id={application_id}!")

    return ranked


async def extract_parameters(application_id: str) -> dict:
    """
    Full extraction pipeline for a given application.

    Delegates to orchestrator.run_pipeline() — the new 9-step multi-agent system.
    Returns a dict compatible with extraction_service.py:
        {
            "raw": dict[str, Any],         ← plain field values
            "extracted_fields": dict,       ← ExtractedField objects for confidence
            "chunks": list[dict],
            "avg_chunk_score": float,
        }
    """
    logger.info(f"[LLM Extractor] Starting extraction for application_id={application_id}")

    result = await run_pipeline(application_id)

    logger.info(
        f"[LLM Extractor] Pipeline complete for app={application_id}. "
        f"Non-null fields: {[k for k, v in result['raw'].items() if v is not None]}"
    )

    return result


async def extract_missing_fields(
    application_id: str,
    existing_raw: dict,
    missing_fields: list[str],
) -> dict:
    """
    Second-pass extraction targeting specific missing fields.
    Preserved for backward compatibility with extraction_service.py.

    The orchestrator already handles second-pass internally, but this method
    is kept for cases where extraction_service calls it manually.
    """
    if not missing_fields:
        return existing_raw

    logger.info(f"[LLM Extractor] Manual second-pass for fields: {missing_fields}")

    from services.extraction.retriever import retrieve_targeted
    from services.extraction.normalizer import normalize_chunks
    from services.extraction.regex_extractor import extract_from_chunks
    from services.extraction.agents import (
        identity_extractor, financial_extractor, bank_extractor
    )

    chunks = await retrieve_targeted(missing_fields, application_id, candidate_k=20)
    if not chunks:
        return existing_raw

    normalize_chunks(chunks)
    regex_results = extract_from_chunks(chunks)

    field_domain = {
        "gstin": "identity", "pan": "identity", "cin": "identity", "llpin": "identity",
        "annual_turnover": "financial", "net_profit": "financial", "total_liabilities": "financial",
        "avg_monthly_balance": "bank", "cheque_bounce_count": "bank",
    }

    domains_needed = {field_domain.get(f) for f in missing_fields if field_domain.get(f)}
    agent_results: list[dict] = []

    if "identity" in domains_needed:
        agent_results.append(await identity_extractor.extract(chunks, regex_results, application_id))
    if "financial" in domains_needed:
        agent_results.append(await financial_extractor.extract(chunks, regex_results, application_id))
    if "bank" in domains_needed:
        agent_results.append(await bank_extractor.extract(chunks, regex_results, application_id))

    merged = dict(existing_raw)
    for result_dict in agent_results:
        for field, ef in result_dict.items():
            if ef.value is not None and merged.get(field) is None:
                merged[field] = ef.value
                logger.info(f"[LLM Extractor] Manual second-pass filled: {field}")

    return merged
