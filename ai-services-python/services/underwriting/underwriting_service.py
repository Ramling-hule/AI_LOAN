"""
Underwriting Service — AI-powered credit risk assessment.
Replaces underwritingService.js using Azure OpenAI GPT-4o.

Uses GPT-4o's json_object response mode for deterministic,
structured policy compliance output.
"""
import json
from loguru import logger
from config.database import fetchrow
from config.settings import get_settings
from services.llm.azure_openai import chat
from services.vectordb.pgvector_service import query_similar_chunks
from services.llm.providers.gemini import GeminiLLMProvider

settings = get_settings()

UNDERWRITING_SYSTEM_PROMPT = """You are a senior credit risk analyst at an Indian commercial bank.
You have been provided with:
1. Extracted financial parameters from the loan applicant's documents
2. Raw document excerpts for evidence
3. Bank lending policies to audit against

Your task is to produce a structured credit risk assessment.
Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):

{
  "risk_score": <integer 300-850, higher is better>,
  "risk_level": "<LOW|MEDIUM|HIGH|CRITICAL>",
  "eligibility_summary": "<2-3 sentence summary of the applicant's credit position>",
  "approval_recommendation": "<APPROVE|REJECT|MANUAL_REVIEW>",
  "rejection_explanation": "<reason if REJECT, otherwise null>",
  "checks": {
    "turnover_eligibility": {
      "status": "<PASS|FAIL|WARNING>",
      "details": "<specific finding with numbers>"
    },
    "gst_consistency": {
      "status": "<PASS|FAIL|WARNING>",
      "details": "<specific finding>"
    },
    "existing_liabilities": {
      "status": "<PASS|FAIL|WARNING>",
      "details": "<specific finding>"
    },
    "cheque_bounce_patterns": {
      "status": "<PASS|FAIL|WARNING>",
      "details": "<specific finding>"
    },
    "suspicious_behaviour": {
      "status": "<PASS|FAIL|WARNING>",
      "details": "<specific finding>"
    }
  },
  "policy_audits": [
    {
      "policy_id": "<policy ID, matching the provided Policy ID exactly>",
      "policy_title": "<policy title>",
      "status": "<PASS|FAIL|WARNING>",
      "details": "<specific compliance audit finding citing actual numbers from documents>"
    }
  ],
  "reasoning": "<detailed paragraph explaining your scoring rationale>"
}

CRITICAL RULES:
- Base ALL findings on the provided document evidence — do NOT make assumptions.
- Audit every policy provided in the context. Cite specific numbers.
- For every policy provided in context, you MUST create an entry in the "policy_audits" array. Use the provided Policy ID as the "policy_id".
- risk_score must reflect the policy compliance level (300=worst, 850=best).
- If key data is missing (e.g., no GSTIN found), flag it as a risk factor.
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

        # Step 1: Get extracted parameters from PostgreSQL
        params_row = await fetchrow(
            "SELECT * FROM extracted_parameters WHERE application_id = $1",
            application_id,
        )
        if not params_row:
            raise ValueError(f"No extracted parameters found for application_id={application_id}. Run extraction first.")

        params = dict(params_row)

        # Step 2 & 3: Iterate policies, embed each, and retrieve top chunks per policy
        llm = GeminiLLMProvider()
        formatted_policies = []
        all_hits = []
        seen_texts = set()

        if not policies:
            # Fallback to general semantic search if no policies provided
            fallback_query = "financial statements, profit and loss, balance sheet, loans, liabilities"
            query_vector = await llm.embed(fallback_query)
            hits = await query_similar_chunks(query_vector, application_id, limit=12)
            all_hits.extend(hits)
            policy_text = "No specific bank policies provided — apply general RBI SME lending guidelines."
        else:
            for i, p in enumerate(policies):
                if isinstance(p, dict):
                    p_id = p.get("id") or p.get("_id") or f"policy_{i+1}"
                    title = p.get("title") or "Unnamed Policy"
                    content = p.get("content") or ""
                    pol_str = f"[Policy {i+1}]\nPolicy ID: {p_id}\nTitle: {title}\nContent: {content}"
                    formatted_policies.append(pol_str)
                    search_query = f"{title} {content}"
                else:
                    pol_str = f"[Policy {i+1}]\n{p}"
                    formatted_policies.append(pol_str)
                    search_query = str(p)
                
                # Fetch top 4 chunks for this specific policy
                query_vector = await llm.embed(search_query)
                hits = await query_similar_chunks(query_vector, application_id, limit=4)
                
                # Deduplicate chunks
                for h in hits:
                    if h['text'] not in seen_texts:
                        seen_texts.add(h['text'])
                        all_hits.append(h)

            policy_text = "\n\n".join(formatted_policies)

        # Cap total chunks to avoid blowing up context window (e.g., max 20)
        all_hits = all_hits[:20]

        context_text = "\n\n---\n\n".join(
            f"[Evidence Chunk {i+1}]\n{h['text']}"
            for i, h in enumerate(all_hits)
        )

        # Step 4: Build the assessment prompt
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

        user_message = (
            f"LOAN APPLICATION DETAILS:\n"
            f"Application ID: {application_id}\n"
            f"Bank: {bank_name}\n"
            f"Requested Amount: ₹{requested_amount:,.0f}\n\n"
            f"EXTRACTED FINANCIAL PARAMETERS:\n{params_text}\n\n"
            f"BANK LENDING POLICIES:\n{policy_text}\n\n"
            f"DOCUMENT EVIDENCE (RAG-retrieved):\n{context_text}"
        )

        messages = [
            {"role": "system", "content": UNDERWRITING_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ]

        # Step 5: Call GPT-4o
        raw_response = await chat(
            messages,
            temperature=settings.UNDERWRITING_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format="json_object",
        )

        # Step 6: Parse JSON (GPT-4o json_object mode always returns valid JSON)
        try:
            # Strip potential markdown blocks if Gemini ignored the mime_type
            clean_response = raw_response.strip()
            if clean_response.startswith("```json"):
                clean_response = clean_response[7:-3].strip()
            elif clean_response.startswith("```"):
                clean_response = clean_response[3:-3].strip()
                
            assessment = json.loads(clean_response)
        except json.JSONDecodeError as e:
            logger.error(f"JSONDecodeError: {e}\nRaw LLM Response:\n{raw_response}")
            # Instead of failing the whole thing with 400 Bad Request (which happens because JSONDecodeError is a ValueError),
            # we should raise an Exception so it returns 500 and the user knows it's an LLM parsing issue.
            raise Exception(f"AI returned invalid JSON: {str(e)}")

        logger.info(
            f"[Underwriting] Assessment complete. "
            f"Score: {assessment.get('risk_score')}, "
            f"Level: {assessment.get('risk_level')}, "
            f"Recommendation: {assessment.get('approval_recommendation')}"
        )

        return assessment


underwriting_service = UnderwritingService()
