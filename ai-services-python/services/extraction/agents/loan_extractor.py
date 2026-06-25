"""
Loan Extractor Agent — loan_balances (list of existing loan obligations).

Extracts all existing loan facilities: outstanding amounts, EMIs, lenders.
"""
from __future__ import annotations

from loguru import logger

from services.extraction.types import ExtractedField
from services.extraction.agents import _format_chunks_as_context, call_agent

_FIELDS = ["loan_balances"]

_SYSTEM_PROMPT = """You are a credit analyst reviewing existing loan obligations for Indian SME loan underwriting.
Extract ALL existing loan/credit facilities found in the document excerpts.

  - loan_balances: A list of ALL existing loans, overdrafts, and credit facilities.
    Each entry must have:
      - lender:             Bank or NBFC name (string)
      - outstanding_amount: Current outstanding principal in INR (number, not null)
      - emi:                Monthly EMI / installment in INR (number, or null if not mentioned)
      - loan_type:          Type of loan e.g. "term_loan", "working_capital", "overdraft", "cc" (string or null)
      - account_number:     Loan/account number if visible (string or null)

═══════════════════════════════════════════════════════
ABSOLUTE RULES:
1. List EVERY loan facility mentioned — do not omit any.
2. Convert all amounts to plain rupees: 1 Crore = 10000000, 1 Lakh = 100000.
3. Do NOT include the CURRENT loan application being assessed — only EXISTING loans.
4. If a loan is fully repaid (outstanding = 0), still include it with outstanding_amount = 0.
5. If no loan obligations are mentioned anywhere in the documents, return an empty list [].
6. Return null for EMI if not explicitly mentioned — do NOT calculate it.
7. Do NOT fabricate lender names or amounts.
═══════════════════════════════════════════════════════

Return ONLY this JSON object:
{
  "loan_balances": {
    "value": [
      {
        "lender": "State Bank of India",
        "outstanding_amount": 5000000,
        "emi": 55000,
        "loan_type": "term_loan",
        "account_number": "123456789"
      }
    ] or [],
    "confidence": 0.0-1.0,
    "page": 3 or null,
    "document_type": "loan_statement" or null,
    "evidence": "SBI Term Loan Outstanding: Rs. 50 Lakh, EMI: Rs. 55,000"
  }
}"""


async def extract(
    chunks: list[dict],
    known_values: dict,
    application_id: str,
) -> dict[str, ExtractedField]:
    """
    Extract existing loan balances from loan-domain chunks.
    """
    if not chunks:
        logger.warning(f"[LoanAgent] No chunks for app={application_id}")
        return {"loan_balances": ExtractedField(value=[], confidence=0.0)}

    context = _format_chunks_as_context(chunks)

    user_message = (
        f"Application ID: {application_id}\n\n"
        f"DOCUMENT EXCERPTS (loan statements, sanction letters, liability schedules):\n{context}"
    )

    return await call_agent(
        system_prompt=_SYSTEM_PROMPT,
        user_message=user_message,
        field_names=_FIELDS,
        chunks=chunks,
        domain="loan",
    )
