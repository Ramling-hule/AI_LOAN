"""
Financial Extractor Agent — annual_turnover, net_profit, total_liabilities.

Focuses on P&L statements, balance sheets, and ITR filings.
Enforces strict hierarchy: audited > ITR > provisional > OCR.
"""
from __future__ import annotations

from loguru import logger

from services.extraction.types import ExtractedField
from services.extraction.agents import _format_chunks_as_context, call_agent

_FIELDS = ["annual_turnover", "net_profit", "total_liabilities"]

_SYSTEM_PROMPT = """You are a senior Indian CA (Chartered Accountant) specialising in SME financial analysis.
Extract EXACTLY these three financial parameters from the provided document excerpts:

  - annual_turnover:    Total annual revenue / gross turnover in Indian Rupees (INR) for the LATEST financial year.
                        Do NOT include advances received, GST collected, or other tax components.
  - net_profit:         Net profit (or net loss) AFTER all taxes for the LATEST financial year.
                        Use a NEGATIVE number for a loss. E.g. a loss of ₹5 lakh = -500000.
  - total_liabilities:  Total liabilities from the LATEST balance sheet (current + non-current + capital).

═══════════════════════════════════════════════════════
ABSOLUTE RULES:
1. NEVER calculate, derive, estimate, or infer any value.
2. Copy the EXACT numeric value printed in the document.
3. All amounts MUST be returned as plain integers or decimals in RUPEES.
   Convert if needed: 1 Crore = 10000000 | 1 Lakh = 100000
4. Prefer AUDITED financial statements over ITR over provisional statements over OCR scans.
5. If multiple financial years are present, always use the MOST RECENT year.
6. If a field is absent from the documents, return null — do NOT guess.
7. Do NOT include commas, currency symbols, or units in the value field.
8. "Net profit" and "PAT" (Profit After Tax) are the same thing.
9. If the document shows a loss, the net_profit value MUST be negative.
═══════════════════════════════════════════════════════

Return ONLY this JSON object:
{
  "annual_turnover": {
    "value": 23000000 or null,
    "confidence": 0.0-1.0,
    "page": 4 or null,
    "document_type": "audited_balance_sheet" or null,
    "evidence": "Total Revenue: Rs. 2.3 Crore for FY 2023-24"
  },
  "net_profit": {
    "value": -500000 or null,
    "confidence": 0.0-1.0,
    "page": null,
    "document_type": null,
    "evidence": null
  },
  "total_liabilities": {
    "value": null,
    "confidence": 0.0,
    "page": null,
    "document_type": null,
    "evidence": null
  }
}"""


async def extract(
    chunks: list[dict],
    known_values: dict,
    application_id: str,
) -> dict[str, ExtractedField]:
    """
    Extract financial parameters from financial-domain chunks.

    Args:
        chunks:        Re-ranked financial-domain chunks.
        known_values:  Regex pre-extraction results (not used here — no regex for monetary fields).
        application_id: For logging.

    Returns:
        Dict mapping field name → ExtractedField.
    """
    if not chunks:
        logger.warning(f"[FinancialAgent] No chunks for app={application_id}")
        return {f: ExtractedField(value=None, confidence=0.0) for f in _FIELDS}

    context = _format_chunks_as_context(chunks)

    user_message = (
        f"Application ID: {application_id}\n\n"
        f"DOCUMENT EXCERPTS (financial statements, P&L, balance sheets, ITR):\n{context}"
    )

    return await call_agent(
        system_prompt=_SYSTEM_PROMPT,
        user_message=user_message,
        field_names=_FIELDS,
        chunks=chunks,
        domain="financial",
    )
