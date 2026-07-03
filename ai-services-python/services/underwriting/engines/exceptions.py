import json
from loguru import logger
from services.llm.llm_facade import chat, embed_batch
from services.vectordb.pgvector_service import query_similar_chunks

class ExceptionEngine:
    async def evaluate(self, failed_rules: list, applicant_data: dict, application_id: str) -> list:
        results = []
        if not failed_rules:
            return results

        # Embed exception queries
        # Build meaningful exception query labels — fall back to description if parameter is missing
        exception_queries = [
            f"Exception policy for {r.get('parameter') or r.get('description', 'unknown rule')}"
            for r in failed_rules
        ]
        embeddings = await embed_batch(exception_queries)

        for rule, emb in zip(failed_rules, embeddings):
            chunks = await query_similar_chunks(emb, application_id, limit=3)
            context = "\n---\n".join([c["text"] for c in chunks])
            
            prompt = f"""A hard rule failed. Evaluate if an exception can be granted based on the Exception Policy.
Rule: {rule.get('description')}
Applicant Value: {rule.get('applicant_value')}

Exception Policy Context:
{context}

Return ONLY valid JSON:
{{
  "status": "PASS THROUGH EXCEPTION" or "FAIL",
  "reason": "Explain why",
  "confidence": 0.9
}}"""
            try:
                raw = await chat([{"role": "system", "content": prompt}], response_format="json_object", max_tokens=500)
                clean_raw = raw.strip()
                if clean_raw.startswith("```json"):
                    clean_raw = clean_raw[7:-3].strip()
                elif clean_raw.startswith("```"):
                    clean_raw = clean_raw[3:-3].strip()
                parsed = json.loads(clean_raw)
                rule["status"] = parsed.get("status", "FAIL")
                existing_reason = rule.get("reason") or ""
                rule["reason"] = existing_reason + " | " + parsed.get("reason", "")
                rule["confidence"] = parsed.get("confidence", 0.5)
                rule["engine"] = "ExceptionEngine"
                rule["rule_type"] = "Exception"
                results.append(rule)
            except Exception as e:
                logger.error(f"Exception evaluation failed: {e}")
                results.append(rule) # keep original failed status

        return results

exception_engine = ExceptionEngine()
