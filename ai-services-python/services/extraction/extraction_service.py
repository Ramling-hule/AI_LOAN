import hashlib
import uuid
import json
from collections import defaultdict
from loguru import logger
from config.database import execute, fetchrow
from config.settings import get_settings
from services.llm.llm_facade import chat, embed_batch
from services.vectordb.pgvector_service import query_similar_chunks, retrieve_and_rerank
from services.metrics.retrieval_logger import log_retrieval_metric

settings = get_settings()

CATEGORIES = {
    "Financial": "Revenue, annual turnover, net profit, expenses, cash flow, average monthly balance.",
    "Compliance": "GSTIN, PAN, CIN, LLPIN, taxes, filings, statutory compliance.",
    "Business Profile": "Promoters, directors, business age, registration details.",
    "Collateral": "Properties, assets, security, mortgage, pledge.",
    "Existing Loans": "Outstanding loan balance, EMIs, liabilities, cheque bounce."
}

CATEGORIES_KEYS = {
    "Financial": {
        "annual_turnover": "Annual turnover / total revenue / gross sales / gross receipts",
        "net_profit": "Net profit after taxes / net profit / profit after tax",
        "avg_monthly_balance": "Average monthly bank balance"
    },
    "Compliance": {
        "gstin": "GST Identification Number (GSTIN) / GST registration number",
        "pan": "PAN (Permanent Account Number)",
        "cin": "Company Identification Number (CIN)",
        "llpin": "LLP Identification Number (LLPIN)"
    },
    "Business Profile": {
        "promoter_details": "A list of promoter/director details. Format: [{'name': 'string', 'shareholding': number, 'din': 'string'}]. If none, use empty list []."
    },
    "Collateral": {
        "collateral_details": "A list of collateral/security details. Format: [{'type': 'string', 'estimated_value': number, 'location': 'string'}]. If none, use empty list []."
    },
    "Existing Loans": {
        "total_liabilities": "Total outstanding loan balance / total liabilities / long term secured loans",
        "cheque_bounce_count": "Cheque bounce / ECS return count / cheque bounce count",
        "loan_balances": "A list of existing loans. Format: [{'bank': 'string', 'amount': number}]. If none, use empty list []."
    }
}

# Only Semantic-type rules go through this LLM-based check. Hard/Derived
# rules are evaluated deterministically elsewhere (hard_rule_engine /
# derived_rule_engine) against the clean parameters this module produces —
# sending them here too would be redundant work AND risks a contradictory
# LLM verdict landing on the same rule_id as the deterministic one.
# Exception and Documentation rules are handled by exception_engine and the
# underwriting_service fallback pass respectively, not here.
SEMANTIC_RULE_TYPE = "Semantic"

RULE_CHECK_INSTRUCTIONS = """--- PART 2: BANK POLICY RULE CHECK ---
Check whether the evidence above satisfies each of these bank policy rules.
Do not use outside knowledge or assume anything not stated in the evidence.
{rules_desc}

For EACH rule return:
- status: "PASS" (evidence clearly satisfies the rule), "FAIL" (evidence clearly violates it),
  "NOT_AVAILABLE" (the evidence does not address this rule at all — do not guess),
  or "MANUAL_REVIEW" (evidence exists but is ambiguous or conflicting and needs a human)
- applicant_value: the specific fact/number from the evidence that was checked, or "N/A" if NOT_AVAILABLE
- reason: must explicitly reference the applicant_value or the evidence text that drove the verdict.
  Never write a generic reason like "meets policy" without pointing at the fact that justifies it.
- citation: which evidence source (document name / page) the verdict is based on, or "N/A" if NOT_AVAILABLE
- confidence: 0.0-1.0, reflecting how directly the evidence supports the verdict
"""

RULE_EVAL_JSON_FIELD = """  "rule_evaluations": [
    {{
      "rule_id": "string",
      "status": "PASS|FAIL|NOT_AVAILABLE|MANUAL_REVIEW",
      "applicant_value": "string",
      "reason": "string",
      "citation": "string",
      "confidence": 0.0
    }}
  ]"""


class ExtractionService:

    async def run(
        self,
        application_id: str,
        loan_id: str,
        rules: list[dict] | None = None,
        enable_second_pass: bool = True,
        force: bool = False,
    ) -> dict:
        """
        Extracts structured underwriting parameters AND evaluates Semantic
        policy rules in the same pass, category by category — both were
        separately re-retrieving the same document chunks before, so this
        cuts LLM calls roughly in half and ties every rule verdict's
        `reason` directly to the evidence pulled for that same call.

        `rules` is optional so existing callers that only want parameters
        (no policy context yet) keep working unchanged — semantic_rule_results
        will just be empty in that case.
        """
        logger.info(f"[Extraction] Starting categorical pipeline for app={application_id}, loan={loan_id}")

        semantic_rules = [r for r in (rules or []) if r.get("rule_type") == SEMANTIC_RULE_TYPE]
        rules_hash = self._hash_semantic_rules(semantic_rules)

        if not force:
            cached = await self._get_cached_result(application_id)
            if cached and cached.get("is_complete") and cached.get("semantic_rules_hash") == rules_hash:
                logger.info(f"[Extraction] Returning cached result (params + semantic rules unchanged) for app={application_id}")
                return self._format_result(cached)

        extracted_data = {}
        confidence_scores = {}
        semantic_rule_results: list[dict] = []

        rules_by_category, leftover_semantic_rules = self._group_semantic_rules(semantic_rules)

        # Embed category prompts
        cat_embeddings = await embed_batch(list(CATEGORIES.values()))

        for cat_name, emb in zip(CATEGORIES.keys(), cat_embeddings):
            cat_rules = rules_by_category.get(cat_name, [])

            # Use rerank-quality retrieval when this category also needs to
            # answer rule questions — a plain top-k vector match is fine for
            # bulk parameter extraction, but rule verdicts should be backed
            # by the best-matching evidence, not just "close enough".
            if cat_rules:
                chunks = await retrieve_and_rerank(
                    query_text=CATEGORIES[cat_name],
                    query_embedding=emb,
                    application_id=application_id,
                    fetch_limit=15,
                    final_limit=10,
                )
            else:
                chunks = await query_similar_chunks(emb, application_id, limit=10)

            if not chunks:
                logger.warning(f"No chunks found for category {cat_name}")
                continue

            context = "\n---\n".join([c["text"] for c in chunks])
            expected_keys_desc = "\n".join([f"- '{k}': {v}" for k, v in CATEGORIES_KEYS[cat_name].items()])

            prompt = self._build_prompt(cat_name, context, expected_keys_desc, cat_rules)

            messages = [{"role": "system", "content": prompt}]
            raw = await chat(messages, response_format="json_object", max_tokens=3072)

            try:
                parsed = self._parse_json(raw)
                extracted_data.update(parsed.get("parameters", {}))
                confidence_scores.update(parsed.get("confidence", parsed.get("parameter_confidence", {})))
                normalized_evals = self._normalize_rule_evaluations(parsed.get("rule_evaluations", []), cat_rules)
                semantic_rule_results.extend(normalized_evals)
                for eval_result in normalized_evals:
                    if eval_result["status"] != "MANUAL_REVIEW":
                        log_retrieval_metric(
                            "semantic_evaluations",
                            session_id=application_id,
                            query=CATEGORIES[cat_name],
                            k_value=len(chunks),
                            retrieved_chunks=chunks,
                            prompt=prompt,
                            llm_raw_response=raw,
                            parsed_result=eval_result,
                            extra={"rule_id": eval_result["rule_id"], "rule_type": "Semantic"}
                        )
            except Exception as e:
                logger.error(f"Failed to parse category extraction for {cat_name}: {e}")
                # A category whose rule verdicts failed to parse must not
                # silently vanish — that Semantic rule would otherwise look
                # unevaluated with no trace of why. Mark them MANUAL_REVIEW.
                semantic_rule_results.extend(self._parse_failure_results(cat_rules, reason=str(e)))

        if leftover_semantic_rules:
            semantic_rule_results.extend(
                await self._evaluate_leftover_rules(application_id, leftover_semantic_rules)
            )

        # Map to database schema with comprehensive fallbacks
        if not extracted_data:
            logger.error(f"[Extraction] No chunks found for ANY category for app={application_id}. Aborting extraction.")
            raise ValueError(f"No usable document text found for loan application {application_id}. Please ensure documents are uploaded and processed successfully before triggering extraction.")

        def get_field(keys):
            for k in keys:
                if k in extracted_data:
                    return extracted_data[k]
                for ext_k, ext_v in extracted_data.items():
                    if ext_k.lower().replace(" ", "_") == k.lower().replace(" ", "_"):
                        return ext_v
            return None

        db_data = {
            "gstin": get_field(["gstin", "GSTIN", "gst_number", "GST Identification Number", "GST Registration Number"]),
            "pan": get_field(["pan", "PAN", "Permanent Account Number", "pan_number"]),
            "cin": get_field(["cin", "CIN", "corporate_identity_number", "Corporate Identification Number"]),
            "llpin": get_field(["llpin", "LLPIN", "llp_identification_number"]),
            "annual_turnover": get_field(["annual_turnover", "Revenue", "total_revenue_turnover", "gross_sales_revenue_from_operations", "turnover"]),
            "net_profit": get_field(["net_profit", "Profit", "net_profit_after_taxes", "profit_after_tax", "net_income"]),
            "total_liabilities": get_field(["total_liabilities", "Existing Debt", "liabilities", "total_debt", "long_term_secured_loans"]),
            "avg_monthly_balance": get_field(["avg_monthly_balance", "Average Balance", "average_monthly_balance"]),
            "cheque_bounce_count": get_field(["cheque_bounce_count", "cheque_bounces", "cheque_bounce"]),
            "loan_balances": extracted_data.get("loan_balances", []),
            "promoter_details": extracted_data.get("promoter_details", []),
            "collateral_details": extracted_data.get("collateral_details", [])
        }

        missing = [k for k, v in db_data.items() if v is None or v == ""]
        overall_confidence = sum(confidence_scores.values()) / max(len(confidence_scores), 1)

        extraction_id = await self._upsert_extraction(
            application_id, loan_id, db_data, confidence_scores, missing, len(missing) == 0,
            semantic_rule_results, rules_hash,
        )

        return {
            "extraction_id": str(extraction_id),
            "application_id": application_id,
            "is_complete": len(missing) == 0,
            "overall_confidence": overall_confidence,
            "missing_fields": missing,
            "parameters": db_data,
            "semantic_rule_results": semantic_rule_results,
        }

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------
    def _build_prompt(self, cat_name: str, context: str, expected_keys_desc: str, cat_rules: list[dict]) -> str:
        if cat_rules:
            rules_desc = "\n".join(f"- [{r['rule_id']}] {r.get('description', '')}" for r in cat_rules)
            rule_section = RULE_CHECK_INSTRUCTIONS.format(rules_desc=rules_desc)
            rule_json_field = ",\n" + RULE_EVAL_JSON_FIELD
        else:
            rule_section = ""
            rule_json_field = ""

        return f"""Extract structured underwriting parameters{" AND check bank policy rules" if cat_rules else ""} for category: {cat_name}.

Document Evidence:
{context}

--- PART 1: PARAMETER EXTRACTION ---
You MUST return the following keys under "parameters" (use null if missing or empty list [] for list types):
{expected_keys_desc}

{rule_section}
Return ONLY valid JSON, no markdown fences, no preamble:
{{
  "parameters": {{ "key1": "value1" }},
  "confidence": {{ "key1": 0.9 }}{rule_json_field}
}}
"""

    # ------------------------------------------------------------------
    # Rule grouping / caching helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _group_semantic_rules(semantic_rules: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]:
        """Buckets Semantic rules by the extraction category they belong to.
        Rules whose `category` doesn't match one of the five known
        categories (free-text field, LLM-extracted at policy time) are
        returned separately rather than silently dropped."""
        known = {c.lower(): c for c in CATEGORIES}
        by_category: dict[str, list[dict]] = defaultdict(list)
        leftover: list[dict] = []
        for r in semantic_rules:
            cat = (r.get("category") or "").strip().lower()
            matched = known.get(cat)
            if matched:
                by_category[matched].append(r)
            else:
                leftover.append(r)
        return dict(by_category), leftover

    @staticmethod
    def _hash_semantic_rules(semantic_rules: list[dict]) -> str:
        """Fingerprint of the active Semantic rule set. Used to invalidate
        the cached extraction result when the bank's policy version
        changes the semantic rules — without this, a cache hit on
        `is_complete` alone would keep serving stale rule verdicts even
        after a policy update, exactly the kind of silent staleness bug
        that bit `_load_active_rules` in underwriting_service before."""
        fingerprint = sorted(
            (r.get("rule_id", ""), (r.get("description") or "").strip())
            for r in semantic_rules
        )
        return hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest()

    # ------------------------------------------------------------------
    # Leftover (uncategorized) semantic rules
    # ------------------------------------------------------------------
    async def _evaluate_leftover_rules(self, application_id: str, leftover_rules: list[dict]) -> list[dict]:
        """One extra bounded LLM call for Semantic rules whose category
        didn't match a known bucket — keeps total LLM calls at
        O(known categories) + O(1) regardless of how many stray-category
        rules a policy has, instead of O(rules)."""
        valid_rules = [r for r in leftover_rules if r.get("description")]
        if not valid_rules:
            return []

        combined_query = " ".join(r["description"] for r in valid_rules)[:2000]
        embeddings = await embed_batch([combined_query])
        chunks = await retrieve_and_rerank(
            query_text=combined_query,
            query_embedding=embeddings[0],
            application_id=application_id,
            fetch_limit=15,
            final_limit=10,
        )
        if not chunks:
            return self._parse_failure_results(valid_rules, reason="No document evidence found for these rules.")

        context = "\n---\n".join(c["text"] for c in chunks)
        rules_desc = "\n".join(f"- [{r['rule_id']}] {r.get('description', '')}" for r in valid_rules)

        prompt = f"""Check whether the evidence below satisfies each bank policy rule.
Do not use outside knowledge or assume anything not stated in the evidence.

Document Evidence:
{context}

Rules:
{rules_desc}

For EACH rule return status (PASS|FAIL|NOT_AVAILABLE|MANUAL_REVIEW), applicant_value, reason
(must cite the specific fact used), citation, and confidence (0.0-1.0).

Return ONLY valid JSON, no markdown fences:
{{
{RULE_EVAL_JSON_FIELD}
}}"""

        try:
            raw = await chat([{"role": "system", "content": prompt}], response_format="json_object", max_tokens=2048)
            parsed = self._parse_json(raw)
            normalized_evals = self._normalize_rule_evaluations(parsed.get("rule_evaluations", []), valid_rules)
            for eval_result in normalized_evals:
                if eval_result["status"] != "MANUAL_REVIEW":
                    log_retrieval_metric(
                        "semantic_evaluations",
                        session_id=application_id,
                        query=combined_query,
                        k_value=len(chunks),
                        retrieved_chunks=chunks,
                        prompt=prompt,
                        llm_raw_response=raw,
                        parsed_result=eval_result,
                        extra={"rule_id": eval_result["rule_id"], "rule_type": "Semantic"}
                    )
            return normalized_evals
        except Exception as e:
            logger.error(f"Failed to evaluate leftover semantic rules: {e}")
            return self._parse_failure_results(valid_rules, reason=str(e))

    # ------------------------------------------------------------------
    # Rule-evaluation normalization
    # ------------------------------------------------------------------
    @staticmethod
    def _normalize_rule_evaluations(raw_evals: list[dict], expected_rules: list[dict]) -> list[dict]:
        """Fills in rule_name/rule_type from the source rule (the LLM only
        echoes rule_id) and ensures every rule this call was asked about
        gets an entry — even if the LLM's response silently dropped one,
        which must surface as MANUAL_REVIEW, not disappear."""
        by_id = {r["rule_id"]: r for r in expected_rules}
        seen_ids = set()
        results = []

        for ev in raw_evals:
            rule_id = ev.get("rule_id")
            source_rule = by_id.get(rule_id, {})
            seen_ids.add(rule_id)
            results.append({
                "rule_id": rule_id,
                "rule_name": source_rule.get("description", ev.get("reason", "")),
                "rule_type": SEMANTIC_RULE_TYPE,
                "engine": "ExtractionService.SemanticCheck",
                "status": ev.get("status") or "MANUAL_REVIEW",
                "applicant_value": ev.get("applicant_value", "N/A"),
                "reason": ev.get("reason", ""),
                "citation": ev.get("citation", ""),
                "confidence": ev.get("confidence", 0.5),
            })

        for rule_id, rule in by_id.items():
            if rule_id not in seen_ids:
                results.append({
                    "rule_id": rule_id,
                    "rule_name": rule.get("description", ""),
                    "rule_type": SEMANTIC_RULE_TYPE,
                    "engine": "ExtractionService.SemanticCheck",
                    "status": "MANUAL_REVIEW",
                    "applicant_value": "N/A",
                    "reason": "Model response did not include a verdict for this rule.",
                    "citation": "",
                    "confidence": 0.0,
                })

        return results

    @staticmethod
    def _parse_failure_results(cat_rules: list[dict], reason: str) -> list[dict]:
        return [
            {
                "rule_id": r.get("rule_id"),
                "rule_name": r.get("description", ""),
                "rule_type": SEMANTIC_RULE_TYPE,
                "engine": "ExtractionService.SemanticCheck",
                "status": "MANUAL_REVIEW",
                "applicant_value": "N/A",
                "reason": f"Evaluation failed and requires manual check: {reason}",
                "citation": "",
                "confidence": 0.0,
            }
            for r in cat_rules
        ]

    @staticmethod
    def _parse_json(raw: str) -> dict:
        clean_raw = raw.strip()
        if clean_raw.startswith("```json"):
            clean_raw = clean_raw[7:].rsplit("```", 1)[0].strip()
        elif clean_raw.startswith("```"):
            clean_raw = clean_raw[3:].rsplit("```", 1)[0].strip()
        return json.loads(clean_raw)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    async def _upsert_extraction(
        self, application_id, loan_id, raw, conf, missing, is_complete,
        semantic_rule_results, rules_hash,
    ):
        # NOTE ON SCHEMA: requires two new columns on extracted_parameters —
        #   semantic_rule_evaluations JSONB
        #   semantic_rules_hash TEXT
        # Migration:
        #   ALTER TABLE extracted_parameters
        #     ADD COLUMN semantic_rule_evaluations JSONB,
        #     ADD COLUMN semantic_rules_hash TEXT;
        existing = await fetchrow("SELECT id FROM extracted_parameters WHERE application_id = $1", application_id)

        import re
        def clean_str(v): return None if v in (None, "") else str(v)
        def clean_numeric(v):
            if v in (None, ""): return None
            if isinstance(v, (int, float)): return float(v)
            cleaned = re.sub(r'[^\d.-]', '', str(v))
            try: return float(cleaned) if cleaned else None
            except ValueError: return None
        def clean_int(v):
            if v in (None, ""): return None
            if isinstance(v, int): return v
            if isinstance(v, float): return int(v)
            cleaned = re.sub(r'[^\d-]', '', str(v).split('.')[0])
            try: return int(cleaned) if cleaned else None
            except ValueError: return None

        if existing:
            await execute(
                """UPDATE extracted_parameters SET
                   gstin=$2, pan=$3, cin=$4, llpin=$5, annual_turnover=$6, net_profit=$7,
                   total_liabilities=$8, avg_monthly_balance=$9, cheque_bounce_count=$10,
                   loan_balances=$11::jsonb, promoter_details=$12::jsonb, collateral_details=$13::jsonb,
                   confidence_scores=$14::jsonb, missing_fields=$15::text[], is_complete=$16,
                   semantic_rule_evaluations=$17::jsonb, semantic_rules_hash=$18, updated_at=NOW()
                   WHERE application_id=$1""",
                application_id, clean_str(raw.get("gstin")), clean_str(raw.get("pan")), clean_str(raw.get("cin")), clean_str(raw.get("llpin")),
                clean_numeric(raw.get("annual_turnover")), clean_numeric(raw.get("net_profit")), clean_numeric(raw.get("total_liabilities")),
                clean_numeric(raw.get("avg_monthly_balance")), clean_int(raw.get("cheque_bounce_count")),
                json.dumps(raw.get("loan_balances", [])), json.dumps(raw.get("promoter_details", [])), json.dumps(raw.get("collateral_details", [])),
                json.dumps(conf), missing, is_complete,
                json.dumps(semantic_rule_results), rules_hash,
            )
            return existing["id"]
        else:
            new_id = str(uuid.uuid4())
            await execute(
                """INSERT INTO extracted_parameters (
                   id, application_id, loan_id, gstin, pan, cin, llpin, annual_turnover, net_profit,
                   total_liabilities, avg_monthly_balance, cheque_bounce_count, loan_balances, promoter_details,
                   collateral_details, confidence_scores, missing_fields, is_complete,
                   semantic_rule_evaluations, semantic_rules_hash
                   ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::text[], $18, $19::jsonb, $20)""",
                new_id, application_id, loan_id, clean_str(raw.get("gstin")), clean_str(raw.get("pan")), clean_str(raw.get("cin")), clean_str(raw.get("llpin")),
                clean_numeric(raw.get("annual_turnover")), clean_numeric(raw.get("net_profit")), clean_numeric(raw.get("total_liabilities")),
                clean_numeric(raw.get("avg_monthly_balance")), clean_int(raw.get("cheque_bounce_count")),
                json.dumps(raw.get("loan_balances", [])), json.dumps(raw.get("promoter_details", [])), json.dumps(raw.get("collateral_details", [])),
                json.dumps(conf), missing, is_complete,
                json.dumps(semantic_rule_results), rules_hash,
            )
            return new_id

    async def _get_cached_result(self, application_id: str) -> dict | None:
        row = await fetchrow("SELECT * FROM extracted_parameters WHERE application_id = $1", application_id)
        return dict(row) if row else None

    def _format_result(self, row: dict) -> dict:
        conf_scores = row.get("confidence_scores") or {}
        if isinstance(conf_scores, str):
            try:
                conf_scores = json.loads(conf_scores)
            except Exception:
                conf_scores = {}

        overall_confidence = 1.0
        if conf_scores:
            overall_confidence = sum(conf_scores.values()) / max(len(conf_scores), 1)

        semantic_rule_results = row.get("semantic_rule_evaluations") or []
        if isinstance(semantic_rule_results, str):
            try:
                semantic_rule_results = json.loads(semantic_rule_results)
            except Exception:
                semantic_rule_results = []

        params = dict(row)
        for k, v in params.items():
            if hasattr(v, "hex") or str(type(v)) == "<class 'uuid.UUID'>":
                params[k] = str(v)
            elif k in ("loan_balances", "promoter_details", "collateral_details") and isinstance(v, str):
                try:
                    params[k] = json.loads(v)
                except Exception:
                    pass

        return {
            "extraction_id": str(row["id"]),
            "application_id": row["application_id"],
            "is_complete": row["is_complete"],
            "overall_confidence": overall_confidence,
            "missing_fields": row.get("missing_fields") or [],
            "parameters": params,
            "semantic_rule_results": semantic_rule_results,
        }


extraction_service = ExtractionService()