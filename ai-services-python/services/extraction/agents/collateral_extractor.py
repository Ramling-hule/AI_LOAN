"""
Collateral Extractor Agent — collateral_details (property, assets, guarantees).
"""
from __future__ import annotations

from loguru import logger

from services.extraction.types import ExtractedField
from services.extraction.agents import _format_chunks_as_context, call_agent

_FIELDS = ["collateral_details"]

_SYSTEM_PROMPT = """You are a property and asset valuation analyst for Indian SME loan underwriting.
Extract ALL collateral, security, and mortgage details from the provided documents.

  - collateral_details: A list of all offered security/collateral items.
    Each entry must have:
      - type:             Type of collateral e.g. "property", "machinery", "vehicle",
                          "fixed_deposit", "gold", "guarantee", "stocks" (string, not null)
      - description:      Brief description of the asset (string or null)
      - estimated_value:  Estimated or market value in INR (number or null)
      - location:         Location / address if mentioned (string or null)
      - ownership:        Owner name if mentioned (string or null)

═══════════════════════════════════════════════════════
ABSOLUTE RULES:
1. List EVERY collateral item mentioned — do not omit any.
2. Convert all amounts to plain rupees: 1 Crore = 10000000, 1 Lakh = 100000.
3. Copy descriptions and locations EXACTLY as printed.
4. If no collateral information is present in the documents, return an empty list [].
5. Do NOT fabricate values or descriptions.
6. Personal guarantees should be included as type="guarantee".
═══════════════════════════════════════════════════════

Return ONLY this JSON object:
{
  "collateral_details": {
    "value": [
      {
        "type": "property",
        "description": "Residential flat, 2BHK, Bandra West",
        "estimated_value": 7500000,
        "location": "Bandra West, Mumbai - 400050",
        "ownership": "Ramesh Kumar"
      }
    ] or [],
    "confidence": 0.0-1.0,
    "page": 5 or null,
    "document_type": "property_valuation_report" or null,
    "evidence": "Property: 2BHK flat Bandra West, Market Value: Rs. 75 Lakh"
  }
}"""


async def extract(
    chunks: list[dict],
    known_values: dict,
    application_id: str,
) -> dict[str, ExtractedField]:
    """Extract collateral details from collateral-domain chunks."""
    if not chunks:
        logger.warning(f"[CollateralAgent] No chunks for app={application_id}")
        return {"collateral_details": ExtractedField(value=[], confidence=0.0)}

    context = _format_chunks_as_context(chunks)

    user_message = (
        f"Application ID: {application_id}\n\n"
        f"DOCUMENT EXCERPTS (property documents, valuation reports, mortgage deeds, collateral schedules):\n{context}"
    )

    return await call_agent(
        system_prompt=_SYSTEM_PROMPT,
        user_message=user_message,
        field_names=_FIELDS,
        chunks=chunks,
        domain="collateral",
    )
