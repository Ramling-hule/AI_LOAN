import os
import json
from datetime import datetime
from loguru import logger
from services.llm.llm_facade import chat, embed_batch
from services.vectordb.pgvector_service import retrieve_and_rerank
from services.metrics.retrieval_logger import log_retrieval_metric


class SemanticRuleEngine:
    async def evaluate(self, rules: list, applicant_data: dict, application_id: str) -> list:
        results = []
        # Evaluate ALL types of rules semantically
        semantic_rules = rules
        if not semantic_rules:
            return results

        # Filter out rules with no usable description before embedding
        valid_rules = [r for r in semantic_rules if r.get("description")]
        if not valid_rules:
            logger.warning("[SemanticRuleEngine] No semantic rules with descriptions to evaluate.")
            return results

        queries = [r["description"] for r in valid_rules]
        embeddings = await embed_batch(queries)

        for rule, emb in zip(valid_rules, embeddings):
            k_value = 3
            chunks = await retrieve_and_rerank(
                query_text=rule["description"],
                query_embedding=emb, 
                application_id=application_id, 
                final_limit=k_value
            )
            context_parts = []
            for idx, c in enumerate(chunks, 1):
                doc_name = c.get('document_name', 'Unknown')
                doc_type = c.get('document_type', 'Unknown')
                page_num = c.get('page_number', 'N/A')
                context_parts.append(f"[Source {idx} - {doc_type}] {doc_name} (Page {page_num}):\n{c['text']}")
            
            context = "\n---\n".join(context_parts)
            
            prompt = f"""Evaluate this qualitative rule based on the applicant context.
Rule: {rule.get('description')}

Applicant Context & Evidence:
{context}
Extracted Financials: {json.dumps(applicant_data, default=str)}

Evaluate if the loan application satisfies the rule. Provide a confidence score between 0.0 and 1.0.
If you rely on evidence, provide a direct citation to the Source number and Document Name.

Return ONLY valid JSON:
{{
  "status": "PASS" or "FAIL",
  "reason": "Explain reasoning",
  "citation": "E.g., Source 1 - bank_statement.pdf (Page 2)",
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
                
                # Log the metric via the shared retrieval logger
                log_retrieval_metric(
                    "semantic_evaluations",
                    session_id=application_id,
                    query=rule.get("description", ""),
                    k_value=k_value,
                    retrieved_chunks=chunks,
                    prompt=prompt,
                    llm_raw_response=raw,
                    parsed_result=parsed,
                    extra={"rule_id": rule.get("rule_id"), "rule_type": "Semantic"},
                )
                
                results.append({
                    "rule_id": rule.get("rule_id"),
                    "rule_name": rule.get("description"),
                    "rule_type": rule.get("rule_type", "Semantic"),
                    "engine": "SemanticRuleEngine",
                    "status": parsed.get("status", "FAIL"),
                    "applicant_value": "Semantic Evaluation",
                    "reason": parsed.get("reason", ""),
                    "citation": parsed.get("citation", ""),
                    "confidence": parsed.get("confidence", 0.5)
                })
            except Exception as e:
                logger.error(f"Semantic evaluation failed: {e}")
        return results

semantic_rule_engine = SemanticRuleEngine()
