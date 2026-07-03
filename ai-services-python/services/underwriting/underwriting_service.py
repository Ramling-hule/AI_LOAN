import json
import time
from loguru import logger
from config.database import execute, fetchrow, fetch
from services.llm.llm_facade import chat
from services.underwriting.cache_service import cache_service
from services.underwriting.engines.hard_rules import hard_rule_engine
from services.underwriting.engines.derived_rules import derived_rule_engine
from services.underwriting.engines.exceptions import exception_engine
from services.extraction.extraction_service import extraction_service

AUDIT_PROMPT_VERSION = "v4_merged_extraction_semantic"
AUDIT_MODEL_VERSION = "gemini-orchestrator"
FINAL_DECISION_MAX_RETRIES = 3

# Rule types that are actually eligibility-blocking. A rule of one of these
# types that no engine evaluated, or that came back NOT_AVAILABLE / needing
# a human, must never look like harmless documentation to the aggregator.
BLOCKING_RULE_TYPES = {"Hard", "Derived", "Semantic"}
UNSAFE_FOR_APPROVE_STATUSES = {"SKIPPED_NEEDS_REVIEW", "MANUAL_REVIEW", "NOT_AVAILABLE", "NOT AVAILABLE"}


class UnderwritingService:
    async def assess(self, application_id: str, loan_id: str, requested_amount: float, bank_name: str, policies: list) -> dict:
        log = logger.bind(application_id=application_id, loan_id=loan_id, bank_id=bank_name)
        log.info("[Underwriting] Orchestrating policy-driven assessment")

        # 1. Load Rule Inventory (active version only — see _load_active_rules)
        rules, needs_review_count = await self._load_active_rules(bank_name)

        if not rules:
            log.warning("[Underwriting] No active policy rules found for this bank. Forcing MANUAL_REVIEW "
                        "rather than letting the LLM decide from an empty rule set.")
            return await self._manual_review_result(
                application_id, "No active policy rules found for this bank — cannot safely assess."
            )

        # 2. Extract applicant parameters AND evaluate Semantic rules in one
        # pass. Previously this service read a raw `extracted_parameters`
        # row (assuming extraction had already run elsewhere) and then made
        # a SEPARATE call to semantic_rule_engine that re-embedded and
        # re-retrieved chunks per rule, on top of re-evaluating Hard/Derived
        # rules it had no business touching (see note below). Routing
        # through extraction_service.run(rules=...) does parameter
        # extraction and Semantic-rule verdicts together, per category, off
        # the same retrieved chunks — and only ever sends Semantic-type
        # rules to the LLM, so a Hard/Derived rule can no longer end up with
        # two contradictory verdicts under the same rule_id.
        try:
            extraction_result = await extraction_service.run(
                application_id=application_id,
                loan_id=loan_id,
                rules=rules,
                force=False,
            )
        except ValueError as e:
            log.error(f"[Underwriting] Extraction failed: {e}")
            return await self._manual_review_result(
                application_id, f"Could not extract applicant parameters — {e}"
            )

        applicant_data = extraction_result["parameters"]
        semantic_results = extraction_result.get("semantic_rule_results", [])

        # Fetch base loan data to supply UI form data (documents, business info) to Hard Rules
        try:
            loan_record = await fetchrow("SELECT business_info, financial_info, documents FROM loans WHERE application_id = $1", application_id)
            if loan_record:
                docs = json.loads(loan_record.get("documents", "{}")) if isinstance(loan_record.get("documents"), str) else loan_record.get("documents", {})
                b_info = json.loads(loan_record.get("business_info", "{}")) if isinstance(loan_record.get("business_info"), str) else loan_record.get("business_info", {})
                
                # KYC Docs
                if "pan" in docs and "aadhaar" in docs:
                    applicant_data["kyc documents (proprietors/partners/directors)"] = "Available"
                
                # Business Proof
                if "gst_certificate" in docs or "udyam" in docs or "incorporation_certificate" in docs:
                    applicant_data["business proof documents"] = "Available"
                
                # Financial Statements
                if "itr" in docs and "bank_statements" in docs:
                    applicant_data["financial statements"] = "Available"
                
                # Other / Debt
                if "business_plan" in docs or "loan_documents" in docs:
                    applicant_data["other required documents"] = "Available"
                
                # Business Registration
                if b_info.get("registration_type") or b_info.get("incorporation_date"):
                    applicant_data["business registration"] = b_info.get("registration_type", "Available")
                
                # Age
                if b_info.get("age"):
                    applicant_data["age of borrower"] = b_info.get("age")
                
        except Exception as e:
            log.warning(f"[Underwriting] Failed to merge loan data for hard rules: {e}")

        # Map extracted parameters to the rule parameters expected by hard_rule_engine
        try:
            # age of borrower fallback
            if not applicant_data.get("age of borrower"):
                promoters = applicant_data.get("promoter_details") or []
                if isinstance(promoters, str):
                    try: promoters = json.loads(promoters)
                    except: promoters = []
                
                age = None
                if promoters and isinstance(promoters, list):
                    age = promoters[0].get("age")
                applicant_data["age of borrower"] = age or applicant_data.get("age_of_promoter")

            # business registration fallback
            if not applicant_data.get("business registration"):
                applicant_data["business registration"] = applicant_data.get("gstin") or applicant_data.get("pan") or applicant_data.get("cin") or applicant_data.get("llpin")

            # kyc documents fallback
            if not applicant_data.get("kyc documents (proprietors/partners/directors)"):
                promoters = applicant_data.get("promoter_details") or []
                if isinstance(promoters, str):
                    try: promoters = json.loads(promoters)
                    except: promoters = []
                
                has_kyc = False
                if promoters and isinstance(promoters, list):
                    has_kyc = any(p.get("pan") or p.get("aadhaar") for p in promoters)
                if has_kyc or applicant_data.get("pan"):
                    applicant_data["kyc documents (proprietors/partners/directors)"] = "Available"

            # business proof documents fallback
            if not applicant_data.get("business proof documents"):
                if applicant_data.get("gstin") or applicant_data.get("pan") or applicant_data.get("cin"):
                    applicant_data["business proof documents"] = "Available"

            # financial statements fallback
            if not applicant_data.get("financial statements"):
                if applicant_data.get("annual_turnover") is not None or applicant_data.get("net_profit") is not None:
                    applicant_data["financial statements"] = "Available"

            # other required documents fallback
            if not applicant_data.get("other required documents"):
                loans = applicant_data.get("loan_balances") or []
                if isinstance(loans, str):
                    try: loans = json.loads(loans)
                    except: loans = []
                if loans:
                    applicant_data["other required documents"] = "Available"
        except Exception as e:
            log.warning(f"[Underwriting] Failed to map extracted parameters to hard rules: {e}")

        # 3. Execute deterministic engines
        derived_results = derived_rule_engine.evaluate(rules, applicant_data)
        hard_results = hard_rule_engine.evaluate(rules, applicant_data)

        failed_hard_rules = [r for r in hard_results if r["status"] == "FAIL"]
        passed_hard_rules = [r for r in hard_results if r["status"] == "PASS"]
        not_available_hard_rules = [r for r in hard_results if r["status"] == "NOT AVAILABLE"]

        # Exception engine still runs separately — it only looks at rules
        # that already failed, which is a small, targeted set unrelated to
        # the bulk category-scoped retrieval above.
        exception_results = await exception_engine.evaluate(failed_hard_rules, applicant_data, application_id)

        # A FAILed hard rule must never silently disappear from the final
        # evaluation set. It may only be replaced by an EXPLICIT verdict from
        # the exception engine (e.g. "exception granted"); if the exception
        # engine has no opinion on it, the original FAIL stands.
        exception_by_id = {r.get("rule_id"): r for r in exception_results if r.get("rule_id")}
        resolved_failed_hard_rules = [
            exception_by_id.get(r.get("rule_id"), r) for r in failed_hard_rules
        ]

        evaluated_results = (
            derived_results
            + passed_hard_rules
            + resolved_failed_hard_rules
            + semantic_results
            + not_available_hard_rules
        )
        evaluated_rule_ids = {r.get("rule_id") for r in evaluated_results if r.get("rule_id")}

        # Fallback for rules no engine touched at all.
        other_results = []
        for r in rules:
            if r.get("rule_id") in evaluated_rule_ids:
                continue
            rule_type = r.get("rule_type", "Unknown")
            # Semantic rules are eligibility-blocking too (qualitative, not
            # deterministic, but still a criterion) — previously only
            # Hard/Derived were treated this way, so a Semantic rule that
            # fell through every engine untouched would have silently shown
            # up as harmless "INFO" instead of flagging a coverage gap.
            is_blocking_type = rule_type in BLOCKING_RULE_TYPES
            other_results.append({
                "rule_id": r.get("rule_id"),
                "rule_name": r.get("description"),
                "rule_type": rule_type,
                "engine": "FallbackReader",
                "status": "SKIPPED_NEEDS_REVIEW" if is_blocking_type else "INFO",
                "applicant_value": "N/A",
                "reason": (
                    f"{rule_type} rule was not evaluated by any engine — requires manual check."
                    if is_blocking_type else
                    "Policy reference documentation/unevaluated exception policy."
                ),
                "confidence": 0.0 if is_blocking_type else 1.0,
            })

        all_evaluations = evaluated_results + other_results

        try:
            safe_evaluations = json.loads(json.dumps(all_evaluations, default=str))
        except Exception as e:
            log.error(f"[Underwriting] Failed to serialize rule evaluations: {e}")
            return await self._manual_review_result(
                application_id, "Internal error serializing rule evaluations — cannot safely assess."
            )

        # 4. Aggregator - Final Decision
        decision_data = await self._get_final_decision(application_id, requested_amount, safe_evaluations, log)

        decision = decision_data.get("underwriting_decision") or "MANUAL_REVIEW"
        try:
            risk_score = int(decision_data.get("risk_score") or 0)
        except (TypeError, ValueError):
            risk_score = 0
        try:
            confidence = float(decision_data.get("confidence") or 0.0)
        except (TypeError, ValueError):
            confidence = 0.0

        # Safety net: an APPROVE must never rest on rules that were flagged
        # needs_review at extraction time (ambiguous LLM classification,
        # never human-verified), on a Hard/Derived/Semantic rule no engine
        # actually evaluated, or on a Semantic rule the LLM itself marked
        # NOT_AVAILABLE / MANUAL_REVIEW. This overrides the aggregator LLM's
        # own judgment — deliberately, since the LLM only sees these as one
        # more status string and may not weight them as disqualifying.
        unresolved_flags = [
            e for e in safe_evaluations
            if e.get("status") in UNSAFE_FOR_APPROVE_STATUSES and e.get("rule_type") in BLOCKING_RULE_TYPES
        ]
        if decision == "APPROVE" and (needs_review_count or unresolved_flags):
            log.warning(
                f"[Underwriting] Overriding APPROVE -> MANUAL_REVIEW: "
                f"{needs_review_count} unvetted rule(s) in policy, "
                f"{len(unresolved_flags)} unresolved blocking rule(s)."
            )
            decision = "MANUAL_REVIEW"

        # 5. Audit Log
        await execute(
            """INSERT INTO underwriting_audit_logs
            (application_id, decision, risk_score, confidence, rule_evaluations, prompt_version, model_version)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)""",
            application_id,
            decision,
            risk_score,
            confidence,
            json.dumps(safe_evaluations),
            AUDIT_PROMPT_VERSION,
            AUDIT_MODEL_VERSION,
        )

        return {
            "underwriting_decision": decision,
            "risk_score": risk_score,
            "confidence": confidence,
            "summary": decision_data.get("summary", ""),
            "policies_evaluation": safe_evaluations,
            "execution_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }

    # ------------------------------------------------------------------
    async def _load_active_rules(self, bank_id: str) -> tuple[list[dict], int]:
        """Load only the currently-active rule set for a bank.

        Previously this read the cache under the literal key "latest" while
        the writer (policy_service) stores bundles under the real version
        string — so the cache never hit, and the DB fallback selected ALL
        rows for bank_id with no is_active filter, mixing superseded policy
        versions into evaluation. Both are fixed here: look up the actual
        active version first, then use IT as the cache key, and filter the
        DB fallback on is_active = TRUE.
        """
        version_row = await fetchrow(
            """
            SELECT policy_version FROM policy_rules
            WHERE bank_id = $1 AND is_active = TRUE
            ORDER BY policy_version DESC
            LIMIT 1
            """,
            bank_id,
        )
        if not version_row:
            return [], 0

        version = version_row["policy_version"]

        cached_bundle = cache_service.get_policy_bundle(bank_id, version, "rules_inventory")
        if cached_bundle:
            rules = cached_bundle.get("rules", [])
        else:
            db_rules = await fetch(
                "SELECT * FROM policy_rules WHERE bank_id = $1 AND is_active = TRUE",
                bank_id,
            )
            rules = [dict(r) for r in db_rules]
            cache_service.set_policy_bundle(bank_id, version, {"rules": rules}, "rules_inventory")

        needs_review_count = sum(1 for r in rules if r.get("needs_review"))
        return rules, needs_review_count

    async def _manual_review_result(self, application_id: str, reason: str) -> dict:
        await execute(
            """INSERT INTO underwriting_audit_logs
            (application_id, decision, risk_score, confidence, rule_evaluations, prompt_version, model_version)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)""",
            application_id, "MANUAL_REVIEW", 0, 0.0, json.dumps([]),
            AUDIT_PROMPT_VERSION, AUDIT_MODEL_VERSION,
        )
        return {
            "underwriting_decision": "MANUAL_REVIEW",
            "risk_score": 0,
            "confidence": 0.0,
            "summary": reason,
            "policies_evaluation": [],
            "execution_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    async def _get_final_decision(
        self, application_id: str, requested_amount: float, safe_evaluations: list[dict], log
    ) -> dict:
        summary_prompt = f"""Aggregate these rule evaluations into a final underwriting decision.
Applicant ID: {application_id}
Requested Amount: {requested_amount}
Rule Evaluations:
{json.dumps(safe_evaluations, indent=2)}

Return ONLY valid JSON:
{{
  "underwriting_decision": "APPROVE|REJECT|MANUAL_REVIEW",
  "risk_score": <integer 300-850>,
  "confidence": <float 0.0-1.0>,
  "summary": "Brief summary",
  "recommendations": "Any additional docs needed"
}}"""

        for attempt in range(1, FINAL_DECISION_MAX_RETRIES + 1):
            try:
                raw = await chat(
                    [{"role": "system", "content": summary_prompt}],
                    response_format="json_object",
                    max_tokens=1024,
                )
                clean_raw = raw.strip()
                # Strip a markdown code fence robustly — slicing off exactly
                # the last 3 characters (the old approach) breaks if there's
                # any trailing whitespace/newline after the closing fence,
                # silently corrupting the JSON instead of cleaning it.
                if clean_raw.startswith("```json"):
                    clean_raw = clean_raw[7:].rsplit("```", 1)[0].strip()
                elif clean_raw.startswith("```"):
                    clean_raw = clean_raw[3:].rsplit("```", 1)[0].strip()
                return json.loads(clean_raw)
            except Exception as e:
                log.warning(f"[Underwriting] Final decision attempt {attempt}/{FINAL_DECISION_MAX_RETRIES} failed: {e}")

        log.error("[Underwriting] All attempts to obtain a final decision failed; forcing MANUAL_REVIEW.")
        return {
            "underwriting_decision": "MANUAL_REVIEW",
            "risk_score": 0,
            "confidence": 0.0,
            "summary": "LLM decision aggregation failed after retries.",
        }


underwriting_service = UnderwritingService()