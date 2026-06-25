"""
Promoter Extractor Agent — promoter_details (directors, partners, shareholders).
"""
from __future__ import annotations

from loguru import logger

from services.extraction.types import ExtractedField
from services.extraction.agents import _format_chunks_as_context, call_agent

_FIELDS = ["promoter_details"]

_SYSTEM_PROMPT = """You are a KYC analyst reviewing promoter and director information for Indian SME loan underwriting.
Extract ALL promoters, directors, partners, or principal shareholders from the documents.

  - promoter_details: A list of all identified promoters/directors/partners.
    Each entry must have:
      - name:          Full name (string, not null)
      - din:           Director Identification Number if available (string or null)
      - designation:   Role e.g. "Managing Director", "Director", "Partner", "Proprietor" (string or null)
      - stake_percent: Ownership / equity stake percentage (number 0-100, or null if not mentioned)
      - pan:           Individual PAN if mentioned (string or null)

═══════════════════════════════════════════════════════
ABSOLUTE RULES:
1. List EVERY promoter / director / partner mentioned — do not omit any.
2. Copy names and DINs EXACTLY as printed.
3. DIN is an 8-digit number — include it only if explicitly shown.
4. stake_percent should be a plain number (e.g. 60, not "60%").
5. If no promoter information is available in the documents, return an empty list [].
6. Do NOT fabricate names, DINs, or ownership percentages.
═══════════════════════════════════════════════════════

Return ONLY this JSON object:
{
  "promoter_details": {
    "value": [
      {
        "name": "Ramesh Kumar",
        "din": "01234567",
        "designation": "Managing Director",
        "stake_percent": 60,
        "pan": "AABPR1234C"
      }
    ] or [],
    "confidence": 0.0-1.0,
    "page": 1 or null,
    "document_type": "cin_certificate" or null,
    "evidence": "Director: Ramesh Kumar, DIN: 01234567, Holding: 60%"
  }
}"""


async def extract(
    chunks: list[dict],
    known_values: dict,
    application_id: str,
) -> dict[str, ExtractedField]:
    """Extract promoter/director details from promoter-domain chunks."""
    if not chunks:
        logger.warning(f"[PromoterAgent] No chunks for app={application_id}")
        return {"promoter_details": ExtractedField(value=[], confidence=0.0)}

    context = _format_chunks_as_context(chunks)

    user_message = (
        f"Application ID: {application_id}\n\n"
        f"DOCUMENT EXCERPTS (CIN certificate, MOA, AOA, partnership deed, KYC documents):\n{context}"
    )

    return await call_agent(
        system_prompt=_SYSTEM_PROMPT,
        user_message=user_message,
        field_names=_FIELDS,
        chunks=chunks,
        domain="promoter",
    )
