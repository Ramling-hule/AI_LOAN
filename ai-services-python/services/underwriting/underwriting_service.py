"""
Underwriting Service — AI-powered credit risk assessment.
Uses Gemini's json_object response mode for deterministic,
structured policy compliance output.
"""
import json
from loguru import logger
from config.database import fetchrow
from config.settings import get_settings
from services.llm.llm_facade import chat
from services.rag.retrieval_service import retrieval_service

settings = get_settings()

UNDERWRITING_SYSTEM_PROMPT = """You are a senior credit risk analyst at an Indian commercial bank.
You have been provided with:
1. Extracted financial parameters from the loan applicant's documents
2. Document Evidence (RAG-retrieved compressed chunks from financial & policy documents)

Your task is to produce a structured credit risk assessment.
Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):

{
  "risk_score": <integer 300-850>,
  "annual_revenue": "<extracted/calculated revenue with reasoning>",
  "gst_turnover": "<extracted/calculated turnover with reasoning>",
  "business_age": "<extracted/calculated age with reasoning>",
  "cash_flow": "<summary of cash flow based on bank statements>",
  "existing_loans": "<summary of existing liabilities and EMIs>",
  "policy_compliance": "<overall summary of adherence to bank policies>",
  "policies_evaluation": [
    {
      "policy_name": "<name of the policy>",
      "status": "<PASSED|FAILED>",
      "reason": "<reason why it passed or failed acting as a bank officer>"
    }
  ],
  "underwriting_decision": "<APPROVE|REJECT|MANUAL_REVIEW>",
  "confidence": <float 0.0-1.0>,
  "citations": [
    "<Citation text referencing specific Evidence Source and Document Type>"
  ]
}

CRITICAL RULES:
- Base ALL findings on the provided document evidence — do NOT make assumptions.
- Ensure the citations array includes specific document names and types that support your decision.
- If key data is missing (e.g., no GSTIN found), flag it as a risk factor and reduce confidence.
- For each policy, act as a bank officer and explicitly state if it PASSED or FAILED and the exact reasoning in `policies_evaluation`.
- The risk_score should be heavily influenced by how many policies PASSED vs FAILED.
"""


class UnderwritingService:
    async def assess(
        self,
        application_id: str,
        loan_id: str,
        requested_amount: float,
        bank_name: str,
        policies: list,
    ) -> dict:
        """
        Run AI underwriting assessment for a loan application.
        Returns the structured assessment dict.
        """
        logger.info(f"[Underwriting] Starting assessment for app={application_id}")

        
        params_row = await fetchrow(
            "SELECT * FROM extracted_parameters WHERE application_id = $1",
            application_id,
        )
        if not params_row:
            raise ValueError(f"No extracted parameters found for application_id={application_id}. Run extraction first.")

        params = dict(params_row)

        
        context_text = await retrieval_service.batch_retrieve(application_id, bank_name)

        
        params_text = json.dumps({
            "gstin": params.get("gstin"),
            "pan": params.get("pan"),
            "annual_turnover": float(params.get("annual_turnover") or 0),
            "net_profit": float(params.get("net_profit") or 0),
            "total_liabilities": float(params.get("total_liabilities") or 0),
            "avg_monthly_balance": float(params.get("avg_monthly_balance") or 0),
            "cheque_bounce_count": params.get("cheque_bounce_count"),
            "loan_balances": params.get("loan_balances", []),
            "promoter_details": params.get("promoter_details", []),
            "collateral_details": params.get("collateral_details", []),
            "missing_fields": params.get("missing_fields", []),
        }, indent=2)

        policies_text = ""
        if policies:
            for p in policies:
                policies_text += f"- {p.get('title')}: {p.get('content')}\n"
        else:
            policies_text = "No explicit policies provided.\n"

        user_message = (
            f"LOAN APPLICATION DETAILS:\n"
            f"Application ID: {application_id}\n"
            f"Bank: {bank_name}\n"
            f"Requested Amount: ₹{requested_amount:,.0f}\n\n"
            f"BANK POLICIES TO EVALUATE:\n{policies_text}\n"
            f"EXTRACTED FINANCIAL PARAMETERS:\n{params_text}\n\n"
            f"DOCUMENT EVIDENCE (RAG-retrieved):\n{context_text}"
        )

        messages = [
            {"role": "system", "content": UNDERWRITING_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ]

        
        raw_response = await chat(
            messages,
            temperature=settings.UNDERWRITING_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format="json_object",
        )

        
        try:
            
            clean_response = raw_response.strip()
            if clean_response.startswith("```json"):
                clean_response = clean_response[7:-3].strip()
            elif clean_response.startswith("```"):
                clean_response = clean_response[3:-3].strip()
                
            assessment = json.loads(clean_response)
        except json.JSONDecodeError as e:
            logger.error(f"JSONDecodeError: {e}\nRaw LLM Response:\n{raw_response}")
            raise Exception(f"AI returned invalid JSON: {str(e)}")

        import time
        assessment["execution_timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        assessment["prompt_version"] = "v2_single_call_batch_rag"

        logger.info(
            f"[Underwriting] Assessment complete. "
            f"Decision: {assessment.get('underwriting_decision')}, "
            f"Confidence: {assessment.get('confidence')}"
        )

        return assessment

underwriting_service = UnderwritingService()
