"""
Bank Statement Extractor Agent — avg_monthly_balance, cheque_bounce_count.

Analyses bank statements for average balance and return/bounce events.
"""
from __future__ import annotations

from loguru import logger

from services.extraction.types import ExtractedField
from services.extraction.agents import _format_chunks_as_context, call_agent

_FIELDS = ["avg_monthly_balance", "cheque_bounce_count"]

_SYSTEM_PROMPT = """You are a bank statement analyst for an Indian SME loan underwriting team.
Extract EXACTLY these two parameters from the provided bank statement excerpts:

  - avg_monthly_balance:  The average monthly balance (AMB / ABM) maintained in the account,
                          in Indian Rupees. This may be labelled "Average Monthly Balance",
                          "ABM", "AMB", "Average Balance", or similar.
  - cheque_bounce_count:  The TOTAL number of cheque returns, ECS returns, NACH returns,
                          dishonoured cheques, or mandate bounces in the statement period.
                          This is an INTEGER (whole number). Count ALL return/bounce events.

═══════════════════════════════════════════════════════
ABSOLUTE RULES:
1. NEVER estimate, calculate, or infer any value.
2. For avg_monthly_balance: copy the printed average balance figure EXACTLY.
   Convert to rupees if needed: 1 Crore = 10000000, 1 Lakh = 100000.
3. For cheque_bounce_count: count only EXPLICIT return/dishonour/bounce entries.
   If the statement shows "3 returns" or lists individual bounce entries, use that count.
   If no bounces are mentioned, return 0 (not null).
4. Return null for avg_monthly_balance if it is not explicitly stated.
5. Return 0 for cheque_bounce_count if statement is present but shows no bounces.
6. Do NOT include commas, currency symbols, or units in numeric value fields.
═══════════════════════════════════════════════════════

Return ONLY this JSON object:
{
  "avg_monthly_balance": {
    "value": 150000 or null,
    "confidence": 0.0-1.0,
    "page": 2 or null,
    "document_type": "bank_statement" or null,
    "evidence": "Average Monthly Balance: Rs. 1,50,000"
  },
  "cheque_bounce_count": {
    "value": 2 or null,
    "confidence": 0.0-1.0,
    "page": null,
    "document_type": null,
    "evidence": "2 ECS return entries found in statement period"
  }
}"""


async def extract(
    chunks: list[dict],
    known_values: dict,
    application_id: str,
) -> dict[str, ExtractedField]:
    """
    Extract bank statement parameters from bank-domain chunks.

    Args:
        chunks:        Re-ranked bank-domain chunks.
        known_values:  Not used (no regex patterns for these fields).
        application_id: For logging.

    Returns:
        Dict mapping field name → ExtractedField.
    """
    if not chunks:
        logger.warning(f"[BankAgent] No chunks for app={application_id}")
        return {f: ExtractedField(value=None, confidence=0.0) for f in _FIELDS}

    context = _format_chunks_as_context(chunks)

    user_message = (
        f"Application ID: {application_id}\n\n"
        f"DOCUMENT EXCERPTS (bank statements, account summaries):\n{context}"
    )

    return await call_agent(
        system_prompt=_SYSTEM_PROMPT,
        user_message=user_message,
        field_names=_FIELDS,
        chunks=chunks,
        domain="bank",
    )
