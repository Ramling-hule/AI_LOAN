"""
Identity Extractor Agent — GSTIN, PAN, CIN, LLPIN.

Handles Indian business identity numbers. Regex pre-extraction results
are injected as "known_values" so the LLM confirms rather than guesses.
"""
from __future__ import annotations

from loguru import logger

from services.extraction.types import ExtractedField
from services.extraction.agents import _format_chunks_as_context, call_agent

_FIELDS = ["gstin", "pan", "cin", "llpin"]

_SYSTEM_PROMPT = """You are an Indian business document identity analyst.
Your ONLY task is to extract exactly these four identity fields from the provided document excerpts:
  - gstin:  GST Identification Number (exactly 15 characters: 2 digits + 5 uppercase letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric)
  - pan:    Permanent Account Number (exactly 10 characters: 5 uppercase letters + 4 digits + 1 uppercase letter)
  - cin:    Company Identification Number (format: L or U + 5 digits + 2 uppercase letters + 4 digits + 3 uppercase letters + 6 digits, total 21 chars)
  - llpin:  LLP Identification Number (format: 3 uppercase letters + hyphen + 4 digits, e.g. AAA-1234)

═══════════════════════════════════════════════════════
ABSOLUTE RULES — NEVER VIOLATE:
1. NEVER guess, infer, estimate, or construct values.
2. Copy values EXACTLY as they appear in the source text.
3. Return null for any field you cannot find verbatim in the documents.
4. Validate format STRICTLY — if a match does not fit the pattern above, return null.
5. Prefer values from official certificates (GST Certificate, PAN card, MCA certificate) over OCR text.
6. If a value appears in both a GSTIN and as a standalone PAN, use the standalone PAN for the "pan" field.
7. Do NOT include any explanation, markdown, or extra keys.
═══════════════════════════════════════════════════════

Return ONLY this JSON object (use null for missing fields):
{
  "gstin":  {"value": "27AABCU9603R1ZX" or null, "confidence": 0.0-1.0, "page": 1 or null, "document_type": "gst_certificate" or null, "evidence": "exact excerpt containing the value"},
  "pan":    {"value": "AABCU9603R" or null, "confidence": 0.0-1.0, "page": null, "document_type": null, "evidence": null},
  "cin":    {"value": null, "confidence": 0.0, "page": null, "document_type": null, "evidence": null},
  "llpin":  {"value": null, "confidence": 0.0, "page": null, "document_type": null, "evidence": null}
}"""


async def extract(
    chunks: list[dict],
    known_values: dict,
    application_id: str,
) -> dict[str, ExtractedField]:
    """
    Extract identity fields (GSTIN, PAN, CIN, LLPIN) from domain chunks.

    Args:
        chunks:       Re-ranked identity-domain chunks.
        known_values: Dict of {field: RegexMatch} from regex pre-extraction.
        application_id: For logging.

    Returns:
        Dict mapping field name → ExtractedField.
    """
    if not chunks:
        logger.warning(f"[IdentityAgent] No chunks for app={application_id}")
        return {f: ExtractedField(value=None, confidence=0.0) for f in _FIELDS}

    context = _format_chunks_as_context(chunks)

    
    known_lines = []
    for field in _FIELDS:
        match = known_values.get(field)
        if match and match.value:
            known_lines.append(
                f"  {field}: {match.value}  "
                f"(pre-extracted by regex, confidence={match.confidence:.2f} — "
                f"confirm this value if you see it in the documents)"
            )
    known_hint = "\n".join(known_lines) if known_lines else "  None detected by regex pre-scan."

    user_message = (
        f"Application ID: {application_id}\n\n"
        f"PRE-EXTRACTED VALUES (validate these against the documents below):\n"
        f"{known_hint}\n\n"
        f"DOCUMENT EXCERPTS:\n{context}"
    )

    result = await call_agent(
        system_prompt=_SYSTEM_PROMPT,
        user_message=user_message,
        field_names=_FIELDS,
        chunks=chunks,
        domain="identity",
    )

    
    for field in ["gstin", "pan", "cin", "llpin"]:
        regex_match = known_values.get(field)
        if regex_match and regex_match.value:
            llm_field = result.get(field)
            
            if llm_field is None or llm_field.value is None or regex_match.confidence > (llm_field.confidence or 0):
                result[field] = ExtractedField(
                    value=regex_match.value,
                    confidence=regex_match.confidence,
                    page=None,
                    document_type=None,
                    evidence=f"Regex pattern match: {regex_match.pattern_name}",
                    source="regex",
                    retrieval_score=chunks[0].get("score", 0.0) if chunks else 0.0,
                    rerank_score=chunks[0].get("rerank_score", 0.0) if chunks else 0.0,
                )

    return result
