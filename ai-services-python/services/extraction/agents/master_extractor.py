from __future__ import annotations

from loguru import logger

from services.extraction.types import ExtractedField, ALL_FIELDS
from services.extraction.agents import _format_chunks_as_context, call_agent

MASTER_SYSTEM_PROMPT = """You are the Master Extraction Agent for an Indian SME loan origination system.
You must extract all required fields from the provided document chunks in a single pass.

EXTRACT THE FOLLOWING EXACT FIELDS (respond with ONLY this JSON structure):
{
  "gstin": {"value": "string or null", "evidence": "exact text from doc"},
  "pan": {"value": "string or null", "evidence": "exact text from doc"},
  "cin": {"value": "string or null", "evidence": "exact text from doc"},
  "llpin": {"value": "string or null", "evidence": "exact text from doc"},
  "annual_turnover": {"value": 0.0 or null, "evidence": "..." },
  "net_profit": {"value": 0.0 or null, "evidence": "..." },
  "total_liabilities": {"value": 0.0 or null, "evidence": "..." },
  "avg_monthly_balance": {"value": 0.0 or null, "evidence": "..." },
  "cheque_bounce_count": {"value": 0 or null, "evidence": "..." },
  "loan_balances": [
    {
      "lender": "Bank Name",
      "loan_type": "Term Loan, Working Capital, etc.",
      "outstanding_amount": 100000.0,
      "emi_amount": 5000.0
    }
  ],
  "promoter_details": [
    {
      "name": "Promoter Name",
      "designation": "Director/Partner/Proprietor",
      "pan": "PAN string or null",
      "ownership_percentage": 50.0
    }
  ],
  "collateral_details": [
    {
      "type": "Property/Fixed Deposit/Machinery",
      "description": "Short description",
      "estimated_value": 5000000.0,
      "owner": "Owner name"
    }
  ]
}

RULES:
1. "evidence" must be a verbatim substring from the provided text that proves the value.
2. If a field cannot be found, set its "value" to null. For lists, return an empty array [].
3. Convert all monetary values to floats. Convert counts to integers.
4. "value" and "evidence" keys are mandatory for every scalar field.
"""

class MasterExtractor:
    async def extract(
        self,
        chunks: list[dict],
        known_values: dict[str, ExtractedField],
        application_id: str,
    ) -> dict[str, ExtractedField]:
        
        if not chunks:
            logger.warning(f"[MasterAgent] No chunks for app={application_id}")
            return {f: ExtractedField(value=None, confidence=0.0) for f in ALL_FIELDS}

        context = _format_chunks_as_context(chunks)

        known_lines = []
        for field in ALL_FIELDS:
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
            system_prompt=MASTER_SYSTEM_PROMPT,
            user_message=user_message,
            field_names=ALL_FIELDS,
            chunks=chunks,
            domain="master",
        )

        
        for field in ["gstin", "pan", "cin", "llpin", "annual_turnover", "net_profit", "total_liabilities", "avg_monthly_balance", "cheque_bounce_count"]:
            regex_match = known_values.get(field)
            if regex_match and regex_match.value:
                llm_field = result.get(field)
                if llm_field is None or llm_field.value is None or regex_match.confidence > (llm_field.confidence or 0):
                    result[field] = ExtractedField(
                        value=regex_match.value,
                        confidence=regex_match.confidence,
                        source="regex",
                        evidence="Regex Pre-Extraction",
                        document_type=regex_match.document_type,
                        page=regex_match.page,
                    )
                    
        return result

master_extractor = MasterExtractor()
