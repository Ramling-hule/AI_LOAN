"""
Orchestrator — top-level coordinator for the multi-agent extraction pipeline.

Full pipeline sequence:
  1. Domain-partitioned RAG retrieval (6 domains, top-40 each)
  2. OCR / monetary normalization on all retrieved chunks
  3. Regex pre-extraction (GSTIN, PAN, CIN, LLPIN)
  4. Cross-encoder re-ranking per domain (top-40 → top-10)
  5. 6 domain agents run concurrently via asyncio.gather()
  6. Merge results (regex > LLM for identity fields)
  7. Second-pass targeted retrieval for null required fields
  8. Verification agent (Gemini Pro pass)
  9. Composite confidence scoring per field

Returns a pipeline_result dict that matches the shape expected by
extraction_service.py (backward-compatible).
"""
from __future__ import annotations

import asyncio
from loguru import logger

from config.settings import get_settings
from services.extraction.types import ExtractedField, ALL_FIELDS, REQUIRED_FIELDS
from services.extraction.retriever import retrieve_all_domains, retrieve_targeted
from services.extraction.reranker import rerank_all_domains
from services.extraction.normalizer import normalize_chunks
from services.extraction.regex_extractor import extract_from_chunks
from services.extraction.confidence import compute_confidence, get_doc_priority
from services.extraction import agents  # noqa — ensures subpackage loads
from services.extraction.agents import identity_extractor
from services.extraction.agents import financial_extractor
from services.extraction.agents import bank_extractor
from services.extraction.agents import loan_extractor
from services.extraction.agents import promoter_extractor
from services.extraction.agents import collateral_extractor
from services.extraction import verification_agent

settings = get_settings()


# ── Merge helpers ─────────────────────────────────────────────────────────────

def _merge_agent_results(
    *agent_dicts: dict[str, ExtractedField],
) -> dict[str, ExtractedField]:
    """
    Merge multiple agent result dicts into a single dict.
    Last non-null value wins (agents are domain-exclusive, so collisions are rare).
    """
    merged: dict[str, ExtractedField] = {}
    for d in agent_dicts:
        for field, ef in d.items():
            existing = merged.get(field)
            if existing is None or (ef.value is not None and ef.confidence > existing.confidence):
                merged[field] = ef
    return merged


def _flat_chunks(domain_chunks: dict[str, list[dict]]) -> list[dict]:
    """Return a flat deduplicated list of all chunks across all domains."""
    seen: set[str] = set()
    result = []
    for chunks in domain_chunks.values():
        for c in chunks:
            text = c.get("text", "")
            if text and text not in seen:
                seen.add(text)
                result.append(c)
    return result


# ── Confidence finalisation ───────────────────────────────────────────────────

def _finalise_confidence(
    merged: dict[str, ExtractedField],
    regex_results: dict,
) -> dict[str, ExtractedField]:
    """
    Recompute composite confidence for every field using the 5-factor scorer.
    Updates each ExtractedField.confidence in-place and returns the dict.
    """
    for field, ef in merged.items():
        regex_match = regex_results.get(field)
        regex_validated = bool(regex_match and regex_match.value and ef.value == regex_match.value)

        final_conf = compute_confidence(
            retrieval_score=ef.retrieval_score,
            rerank_score=ef.rerank_score,
            regex_validated=regex_validated,
            document_type=ef.document_type,
            llm_confidence=ef.confidence,
        )
        ef.confidence = final_conf

    return merged


# ── Main pipeline entry ───────────────────────────────────────────────────────

async def run_pipeline(application_id: str) -> dict:
    """
    Execute the full multi-agent extraction pipeline.

    Args:
        application_id: The loan application UUID.

    Returns:
        {
            "extracted_fields": dict[str, ExtractedField],  ← per-field objects
            "raw": dict[str, Any],                           ← plain values (for DB)
            "chunks": list[dict],                            ← all retrieved chunks
            "avg_chunk_score": float,
        }
    """
    logger.info(f"[Orchestrator] ═══ Starting pipeline for app={application_id} ═══")

    # ── Step 1: Domain-partitioned retrieval ──────────────────────────────────
    domain_chunks = await retrieve_all_domains(
        application_id,
        candidate_k=settings.EXTRACTION_TOP_K_CANDIDATE,
    )

    all_chunks_raw = _flat_chunks(domain_chunks)
    if not all_chunks_raw:
        logger.warning(f"[Orchestrator] No chunks found for app={application_id} — aborting")
        empty = {f: ExtractedField(value=None, confidence=0.0) for f in ALL_FIELDS}
        return {"extracted_fields": empty, "raw": {f: None for f in ALL_FIELDS},
                "chunks": [], "avg_chunk_score": 0.0}

    # ── Step 2: Normalize OCR text ────────────────────────────────────────────
    for domain in domain_chunks:
        normalize_chunks(domain_chunks[domain])
    logger.info(f"[Orchestrator] Normalized {len(all_chunks_raw)} chunks")

    # ── Step 3: Regex pre-extraction (across all chunks) ─────────────────────
    all_chunks_normalized = _flat_chunks(domain_chunks)
    regex_results = extract_from_chunks(all_chunks_normalized)
    found_by_regex = [f for f, m in regex_results.items() if m and m.value]
    if found_by_regex:
        logger.info(f"[Orchestrator] Regex pre-extracted: {found_by_regex}")

    # ── Step 4: Cross-encoder re-ranking ─────────────────────────────────────
    domain_chunks_reranked = await rerank_all_domains(
        domain_chunks,
        top_k=settings.EXTRACTION_TOP_K_FINAL,
    )

    # ── Step 5: Sequential domain agent execution ─────────────────────────────
    logger.info("[Orchestrator] Launching 6 domain agents sequentially (to respect free-tier rate limits)...")

    agent_results = []
    
    # 1. Identity
    try:
        res = await identity_extractor.extract(domain_chunks_reranked.get("identity", []), regex_results, application_id)
        agent_results.append(res)
    except Exception as e:
        logger.error(f"[Orchestrator] Agent 'identity' failed: {e}")
        agent_results.append(e)
        
    # 2. Financial
    try:
        res = await financial_extractor.extract(domain_chunks_reranked.get("financial", []), regex_results, application_id)
        agent_results.append(res)
    except Exception as e:
        logger.error(f"[Orchestrator] Agent 'financial' failed: {e}")
        agent_results.append(e)

    # 3. Bank
    try:
        res = await bank_extractor.extract(domain_chunks_reranked.get("bank", []), regex_results, application_id)
        agent_results.append(res)
    except Exception as e:
        logger.error(f"[Orchestrator] Agent 'bank' failed: {e}")
        agent_results.append(e)

    # 4. Loan
    try:
        res = await loan_extractor.extract(domain_chunks_reranked.get("loan", []), regex_results, application_id)
        agent_results.append(res)
    except Exception as e:
        logger.error(f"[Orchestrator] Agent 'loan' failed: {e}")
        agent_results.append(e)

    # 5. Promoter
    try:
        res = await promoter_extractor.extract(domain_chunks_reranked.get("promoter", []), regex_results, application_id)
        agent_results.append(res)
    except Exception as e:
        logger.error(f"[Orchestrator] Agent 'promoter' failed: {e}")
        agent_results.append(e)

    # 6. Collateral
    try:
        res = await collateral_extractor.extract(domain_chunks_reranked.get("collateral", []), regex_results, application_id)
        agent_results.append(res)
    except Exception as e:
        logger.error(f"[Orchestrator] Agent 'collateral' failed: {e}")
        agent_results.append(e)

    # Handle any agent failures gracefully
    safe_results: list[dict[str, ExtractedField]] = []
    agent_names = ["identity", "financial", "bank", "loan", "promoter", "collateral"]
    for name, result in zip(agent_names, agent_results):
        if isinstance(result, Exception):
            safe_results.append({})
        else:
            safe_results.append(result)

    # ── Step 6: Merge all agent results ──────────────────────────────────────
    merged = _merge_agent_results(*safe_results)

    # Ensure all expected fields exist in the merged dict
    for field in ALL_FIELDS:
        if field not in merged:
            default_val: list | None = [] if field in ("loan_balances", "promoter_details", "collateral_details") else None
            merged[field] = ExtractedField(value=default_val, confidence=0.0)

    logger.info(f"[Orchestrator] Merge complete. Non-null fields: "
                f"{[f for f, ef in merged.items() if ef.value is not None]}")

    # ── Step 7: Second-pass retrieval for null required fields ────────────────
    null_required = [f for f in REQUIRED_FIELDS if merged.get(f) and merged[f].value is None]

    if null_required and settings.ENABLE_SECOND_PASS:
        logger.info(f"[Orchestrator] Second-pass for null fields: {null_required}")
        second_chunks = await retrieve_targeted(null_required, application_id, candidate_k=25)
        normalize_chunks(second_chunks)

        if second_chunks:
            # Re-run only the agents that own the missing fields
            from services.extraction.retriever import DOMAIN_QUERIES
            field_domain = {
                "gstin": "identity", "pan": "identity", "cin": "identity", "llpin": "identity",
                "annual_turnover": "financial", "net_profit": "financial", "total_liabilities": "financial",
                "avg_monthly_balance": "bank", "cheque_bounce_count": "bank",
            }
            domains_needed = {field_domain[f] for f in null_required if f in field_domain}

            second_pass_tasks = {}
            if "identity" in domains_needed:
                second_pass_tasks["identity"] = identity_extractor.extract(
                    second_chunks, regex_results, application_id
                )
            if "financial" in domains_needed:
                second_pass_tasks["financial"] = financial_extractor.extract(
                    second_chunks, regex_results, application_id
                )
            if "bank" in domains_needed:
                second_pass_tasks["bank"] = bank_extractor.extract(
                    second_chunks, regex_results, application_id
                )

            if second_pass_tasks:
                for name, coroutine in second_pass_tasks.items():
                    try:
                        result = await coroutine
                        for field, ef in result.items():
                            if ef.value is not None and merged.get(field) and merged[field].value is None:
                                merged[field] = ef
                                logger.info(f"[Orchestrator] Second-pass filled: {field}")
                    except Exception as e:
                        logger.error(f"[Orchestrator] Second-pass agent '{name}' failed: {e}")

            all_chunks_normalized.extend(second_chunks)

    # ── Step 8: Verification agent ────────────────────────────────────────────
    # Flatten all domain chunks again (now includes second-pass chunks)
    all_chunks_final = _flat_chunks({
        **domain_chunks_reranked,
        "_second": all_chunks_normalized,
    })

    merged = await verification_agent.verify(merged, all_chunks_final, application_id)

    # ── Step 9: Composite confidence scoring ──────────────────────────────────
    merged = _finalise_confidence(merged, regex_results)

    # ── Build return dict ─────────────────────────────────────────────────────
    raw_values: dict = {}
    for field, ef in merged.items():
        raw_values[field] = ef.value

    scores = [ef.retrieval_score for ef in merged.values() if ef.retrieval_score > 0]
    avg_score = sum(scores) / len(scores) if scores else 0.0

    non_null = [f for f, ef in merged.items() if ef.value is not None]
    logger.info(
        f"[Orchestrator] ═══ Pipeline complete for app={application_id}. "
        f"Extracted {len(non_null)}/{len(ALL_FIELDS)} fields. "
        f"Avg retrieval score: {avg_score:.3f} ═══"
    )

    return {
        "extracted_fields": merged,
        "raw": raw_values,
        "chunks": all_chunks_final,
        "avg_chunk_score": round(avg_score, 4),
    }
