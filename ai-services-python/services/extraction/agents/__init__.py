"""
Base agent class and shared utilities for all domain extraction agents.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from loguru import logger

from config.settings import get_settings
from services.llm.azure_openai import chat
from services.extraction.types import ExtractedField

settings = get_settings()


def _format_chunks_as_context(chunks: list[dict]) -> str:
    """
    Format re-ranked chunks into a structured context string, grouped by document type.
    """
    # Group by document type
    by_doc: dict[str, list[dict]] = {}
    for chunk in chunks:
        doc_type = chunk.get("document_type") or "General"
        by_doc.setdefault(doc_type, []).append(chunk)

    sections = []
    for doc_type, doc_chunks in by_doc.items():
        header = f"=== {doc_type.replace('_', ' ').title()} ==="
        chunk_texts = []
        for i, c in enumerate(doc_chunks, 1):
            page_info = f" [Page {c['page_number']}]" if c.get("page_number") else ""
            chunk_texts.append(f"[Chunk {i}{page_info}]\n{c['text']}")
        sections.append(header + "\n" + "\n\n".join(chunk_texts))

    return "\n\n" + ("\n\n" + "-" * 60 + "\n\n").join(sections) if sections else ""


def _parse_llm_field(
    raw: Any,
    chunk_pool: list[dict],
) -> ExtractedField:
    """
    Parse a single field from the LLM's JSON response.

    The LLM is instructed to return:
        {"value": ..., "confidence": float, "page": int|null,
         "document_type": str|null, "evidence": str|null}

    Falls back gracefully if the LLM returns a plain scalar.
    """
    if raw is None:
        return ExtractedField(value=None, confidence=0.0, source="llm")

    if not isinstance(raw, dict):
        # LLM returned a plain scalar — wrap it
        return ExtractedField(value=raw, confidence=0.5, source="llm")

    value = raw.get("value")
    llm_conf = float(raw.get("confidence", 0.7))
    page = raw.get("page")
    doc_type = raw.get("document_type")
    evidence = raw.get("evidence")

    # Find the best matching chunk scores for this value
    best_retrieval = 0.0
    best_rerank = 0.0
    if chunk_pool and evidence:
        ev_lower = (evidence or "").lower()
        for c in chunk_pool:
            if ev_lower[:80] in c.get("text", "").lower():
                if c.get("score", 0) > best_retrieval:
                    best_retrieval = c.get("score", 0.0)
                    best_rerank = c.get("rerank_score", 0.0)
                break

    return ExtractedField(
        value=value,
        confidence=llm_conf,
        page=page,
        document_type=doc_type,
        evidence=evidence,
        source="llm",
        retrieval_score=best_retrieval,
        rerank_score=best_rerank,
    )


async def call_agent(
    system_prompt: str,
    user_message: str,
    field_names: list[str],
    chunks: list[dict],
    domain: str,
) -> dict[str, ExtractedField]:
    """
    Call the Gemini Flash model with a domain-specific prompt and parse the result.
    Returns a dict mapping field_name → ExtractedField.
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    try:
        raw_response = await chat(
            messages,
            temperature=settings.EXTRACTION_TEMPERATURE,
            max_tokens=2048,
            response_format="json_object",
            model=settings.GEMINI_FLASH_MODEL,
        )
        raw = json.loads(raw_response)
    except json.JSONDecodeError as e:
        logger.error(f"[Agent:{domain}] JSON parse failed: {e}")
        raw = {}
    except Exception as e:
        logger.error(f"[Agent:{domain}] LLM call failed: {e}")
        raw = {}

    result: dict[str, ExtractedField] = {}
    for field in field_names:
        result[field] = _parse_llm_field(raw.get(field), chunks)

    extracted = [f for f, ef in result.items() if ef.value is not None]
    logger.info(f"[Agent:{domain}] Extracted: {extracted or 'none'}")
    return result
