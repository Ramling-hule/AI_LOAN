"""
Verification Agent — post-merge validation pass using Gemini Pro.

After all 6 domain agents produce results and they are merged, the verifier
reads every extracted field and confirms it can be found verbatim in the
supporting evidence chunks.

Rules:
  - Fields with solid evidence: keep.
  - Fields with suspicious values (e.g. GSTIN fails format check): nullify.
  - Fields the verifier cannot corroborate in the provided text: nullify.
  - The verifier NEVER invents or corrects values — only accepts or rejects.
"""
from __future__ import annotations

import json

from loguru import logger

from config.settings import get_settings
from services.llm.llm_facade import chat
from services.extraction.types import ExtractedField

settings = get_settings()

_VERIFICATION_SYSTEM_PROMPT = """You are a verification auditor for Indian SME loan document extraction.
You will receive:
  1. A JSON object of extracted fields, each with a "value" and "evidence" string.
  2. The raw document excerpts used to extract these values.

Your task:
  For EACH field, check whether the "value" actually appears (or can be directly inferred from) the "evidence" and the document excerpts.

  RULES:
  1. If the value is present verbatim or can be clearly read from the evidence text → ACCEPT it (keep the value).
  2. If the value is null → keep it null.
  3. If the value appears fabricated, does not match the evidence, or the evidence is empty → set value to null.
  4. NEVER invent, correct, or improve a value — only accept or nullify.
  5. For list fields (loan_balances, promoter_details, collateral_details):
       - Remove individual entries that cannot be verified.
       - Keep the list (possibly shorter or empty) — do NOT nullify the entire list field.
  6. For GSTIN: verify it is exactly 15 alphanumeric characters. If not, nullify.
  7. For PAN: verify it is exactly 10 characters (AAAAA9999A). If not, nullify.
  8. Return EXACTLY the same JSON structure — only change "value" for fields you reject.

Return ONLY the verified JSON object with the same structure as the input.
Do NOT add any explanation, commentary, or extra fields."""


async def verify(
    merged: dict[str, ExtractedField],
    all_chunks: list[dict],
    application_id: str,
) -> dict[str, ExtractedField]:
    """
    Run the verification agent over the merged extraction result.

    Args:
        merged:         The merged dict of field → ExtractedField from all agents.
        all_chunks:     All retrieved chunks (across all domains) for context.
        application_id: For logging.

    Returns:
        Verified dict of field → ExtractedField (some values may be nullified).
    """
    if not settings.ENABLE_VERIFICATION_AGENT:
        logger.info("[Verifier] Verification agent is disabled (ENABLE_VERIFICATION_AGENT=False)")
        return merged

    
    fields_for_verification: dict = {}
    for field, ef in merged.items():
        if isinstance(ef.value, list):
            fields_for_verification[field] = {
                "value": ef.value,
                "evidence": ef.evidence or "",
            }
        else:
            fields_for_verification[field] = {
                "value": ef.value,
                "evidence": ef.evidence or "",
            }

    
    context_parts = []
    char_budget = 8000
    ranked_chunks = sorted(
        all_chunks,
        key=lambda c: (c.get("rerank_score", 0.0), c.get("score", 0.0)),
        reverse=True,
    )
    for chunk in ranked_chunks:
        text = chunk.get("text", "")
        if not text:
            continue
        doc_type = chunk.get("document_type", "unknown")
        page = chunk.get("page_number")
        header = f"[{doc_type}" + (f" p.{page}" if page else "") + "]"
        snippet = f"{header}\n{text[:600]}"
        if char_budget - len(snippet) < 0:
            break
        context_parts.append(snippet)
        char_budget -= len(snippet)

    context_text = "\n\n---\n\n".join(context_parts)

    user_message = (
        f"Application ID: {application_id}\n\n"
        f"EXTRACTED FIELDS TO VERIFY:\n{json.dumps(fields_for_verification, indent=2)}\n\n"
        f"SUPPORTING DOCUMENT EXCERPTS:\n{context_text}"
    )

    messages = [
        {"role": "system", "content": _VERIFICATION_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    try:
        raw_response = await chat(
            messages,
            temperature=0.0,   
            max_tokens=3000,
            response_format="json_object",
            model=settings.GEMINI_MODEL,  
            is_background=True,
        )
        verified_raw = json.loads(raw_response)
    except json.JSONDecodeError as e:
        logger.error(f"[Verifier] JSON parse failed: {e} — skipping verification")
        return merged
    except Exception as e:
        logger.error(f"[Verifier] LLM call failed: {e} — skipping verification")
        return merged

    
    result: dict[str, ExtractedField] = {}
    nullified: list[str] = []

    for field, original_ef in merged.items():
        verified_entry = verified_raw.get(field)

        if not isinstance(verified_entry, dict):
            
            result[field] = original_ef
            continue

        verified_value = verified_entry.get("value")
        if verified_value is None and original_ef.value is not None:
            
            nullified.append(field)
            result[field] = ExtractedField(
                value=None,
                confidence=0.0,
                page=original_ef.page,
                document_type=original_ef.document_type,
                evidence=original_ef.evidence,
                source="verified",
                retrieval_score=original_ef.retrieval_score,
                rerank_score=original_ef.rerank_score,
            )
        else:
            
            result[field] = ExtractedField(
                value=verified_value if verified_value is not None else original_ef.value,
                confidence=min(1.0, original_ef.confidence * 1.05) if verified_value is not None else 0.0,
                page=original_ef.page,
                document_type=original_ef.document_type,
                evidence=original_ef.evidence,
                source="verified",
                retrieval_score=original_ef.retrieval_score,
                rerank_score=original_ef.rerank_score,
            )

    if nullified:
        logger.warning(f"[Verifier] Nullified fields (unverifiable): {nullified}")
    else:
        logger.info(f"[Verifier] All fields verified for app={application_id}")

    return result
