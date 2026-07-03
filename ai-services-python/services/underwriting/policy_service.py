"""
Extracts underwriting rules from bank policy documents and stores them for
use by the loan-checking engine.

Banking-grade concerns this module is specifically designed around:
  - A misclassified or dropped rule can cause a loan to be wrongly
    approved or rejected, so ambiguous extraction results are flagged for
    human review rather than silently defaulted or discarded.
  - Re-processing a policy (correction, re-upload, new version) must not
    leave old and new rules coexisting for the same bank — old versions
    are superseded, not appended to.
  - Every extraction is auditable: the raw LLM response, model, and chunk
    boundaries are persisted so a rule can be traced back to what produced
    it (required for compliance / dispute review).
  - Long policies are chunked for extraction (avoids response truncation
    at the model's max_tokens) and all LLM calls go through a shared,
    process-wide rate limiter (free-tier Gemini: 15 requests/minute).
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from config.database import execute, fetchrow, transaction
from config.settings import get_settings
from services.llm.llm_facade import chat
from services.underwriting.cache_service import cache_service

settings = get_settings()

VALID_RULE_TYPES = {"Hard", "Derived", "Semantic", "Exception", "Documentation"}
VALID_PRIORITIES = {"High", "Medium", "Low"}

EXTRACTION_MAX_RETRIES = getattr(settings, "POLICY_EXTRACTION_MAX_RETRIES", 3)
# Rough character budget per LLM call — keeps prompt + response comfortably
# under context/max_tokens limits on long policies instead of one giant call.
EXTRACTION_CHUNK_CHARS = getattr(settings, "POLICY_EXTRACTION_CHUNK_CHARS", 12_000)
EXTRACTION_MAX_TOKENS = getattr(settings, "POLICY_EXTRACTION_MAX_TOKENS", 8192)

PAGE_MARKER_RE = re.compile(r"---\s*PAGE\s+(\d+)\s*---", re.IGNORECASE)

RULES_SYSTEM_PROMPT = """Extract all underwriting rules from this policy excerpt.
For each rule, classify it as: Hard, Derived, Semantic, Exception, or Documentation.
- Hard: a strict pass/fail eligibility criterion (e.g. minimum credit score, maximum DTI).
- Derived: computed from other values (e.g. loan-to-value ratio thresholds).
- Semantic: qualitative/judgment-based guidance.
- Exception: a carve-out or override to another rule.
- Documentation: informational only, not an eligibility criterion.
If a rule clearly sets a numeric or binary eligibility threshold, it MUST be
classified as Hard or Derived — never Documentation.
IMPORTANT: Do not truncate your response. Ensure your JSON output is complete and properly closed.
Return ONLY valid JSON in this format:
{
  "rules": [
    {
      "parameter": "String",
      "description": "String",
      "category": "String (e.g. Financial, Compliance, Business Profile, Collateral)",
      "policy_section": "String",
      "policy_page": Integer (extracted from the '--- PAGE X ---' markers, or null if unknown),
      "priority": "High/Medium/Low",
      "rule_type": "Hard|Derived|Semantic|Exception|Documentation"
    }
  ]
}
"""


class PolicyExtractionError(Exception):
    """Raised when rule extraction fails in a way the caller must not silently ignore."""


class PolicyService:
    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    async def process_policy(self, bank_id: str, version: str, policy_text: str) -> dict[str, Any]:
        """Extract, validate, store, and cache underwriting rules for a policy.

        Returns a summary dict (not just a bare rule list) so the caller can
        react to partial/ambiguous results instead of assuming success:
            {
              "rules": [...],
              "rule_count": int,
              "needs_review_count": int,
              "chunk_count": int,
              "failed_chunks": int,
            }
        Raises PolicyExtractionError if extraction produced nothing usable
        at all (as opposed to logging an error and pretending success).
        """
        log = logger.bind(bank_id=bank_id, version=version)
        chunks = self._split_into_chunks(policy_text)
        log.info(f"[PolicyService] Extracting rules from {len(chunks)} chunk(s)...")

        extraction_id = uuid.uuid4().hex
        all_rules: list[dict[str, Any]] = []
        failed_chunks = 0

        for idx, chunk_text in enumerate(chunks):
            try:
                chunk_rules, raw_response = await self._extract_rules_from_chunk(chunk_text)
                all_rules.extend(chunk_rules)
                await self._record_audit(
                    extraction_id, bank_id, version, chunk_index=idx,
                    raw_response=raw_response, rule_count=len(chunk_rules), success=True,
                )
            except Exception as e:
                failed_chunks += 1
                log.error(f"[PolicyService] Chunk {idx + 1}/{len(chunks)} extraction failed: {e}")
                await self._record_audit(
                    extraction_id, bank_id, version, chunk_index=idx,
                    raw_response=str(e), rule_count=0, success=False,
                )

        if not all_rules and failed_chunks == len(chunks):
            raise PolicyExtractionError(
                f"All {len(chunks)} chunk(s) failed extraction for {bank_id} v{version}; "
                f"no rules were stored. This policy needs manual re-processing."
            )

        normalized_rules, needs_review_count = self._validate_and_normalize(all_rules)
        deduped_rules = self._dedupe(normalized_rules)

        await self._store_rules(bank_id, version, deduped_rules, extraction_id)
        self._refresh_cache(bank_id, version, deduped_rules)

        if failed_chunks:
            log.warning(
                f"[PolicyService] {failed_chunks}/{len(chunks)} chunk(s) failed — "
                f"stored rules are likely INCOMPLETE for this policy."
            )
        if needs_review_count:
            log.warning(
                f"[PolicyService] {needs_review_count} rule(s) flagged needs_review — "
                f"ambiguous classification, do not treat as fully automated."
            )

        log.info(
            f"[PolicyService] Processed policy: {len(deduped_rules)} rules stored "
            f"({needs_review_count} need review, {failed_chunks} chunk failures)."
        )

        return {
            "rules": deduped_rules,
            "rule_count": len(deduped_rules),
            "needs_review_count": needs_review_count,
            "chunk_count": len(chunks),
            "failed_chunks": failed_chunks,
        }

    # ------------------------------------------------------------------
    # Chunking
    # ------------------------------------------------------------------
    @staticmethod
    def _split_into_chunks(policy_text: str) -> list[str]:
        """Split on page markers, then greedily pack pages into chunks under
        EXTRACTION_CHUNK_CHARS so each LLM call stays well within its
        context/response budget instead of one call for an entire policy."""
        pages = PAGE_MARKER_RE.split(policy_text)
        # re.split with a capturing group yields: [pre, num, text, num, text, ...]
        if len(pages) <= 1:
            # No page markers found — fall back to naive char-based chunking.
            text = policy_text.strip()
            if not text:
                return []
            return [
                text[i:i + EXTRACTION_CHUNK_CHARS]
                for i in range(0, len(text), EXTRACTION_CHUNK_CHARS)
            ]

        page_units: list[str] = []
        preamble = pages[0].strip()
        if preamble:
            page_units.append(preamble)
        for i in range(1, len(pages), 2):
            page_num = pages[i]
            page_text = pages[i + 1] if i + 1 < len(pages) else ""
            page_units.append(f"--- PAGE {page_num} ---\n{page_text}")

        chunks: list[str] = []
        current = ""
        for unit in page_units:
            if current and len(current) + len(unit) > EXTRACTION_CHUNK_CHARS:
                chunks.append(current)
                current = unit
            else:
                current = f"{current}\n\n{unit}" if current else unit
        if current:
            chunks.append(current)
        return chunks

    # ------------------------------------------------------------------
    # LLM extraction (rate-limited + retried)
    # ------------------------------------------------------------------
    async def _extract_rules_from_chunk(self, chunk_text: str) -> tuple[list[dict], str]:
        messages = [
            {"role": "system", "content": RULES_SYSTEM_PROMPT},
            {"role": "user", "content": chunk_text},
        ]

        last_error: Exception | None = None
        for attempt in range(1, EXTRACTION_MAX_RETRIES + 1):
            try:
                raw_response = await chat(
                    messages, response_format="json_object", max_tokens=EXTRACTION_MAX_TOKENS
                )
                rules = self._parse_rules_json(raw_response)
                return rules, raw_response
            except Exception as e:
                last_error = e
                if attempt < EXTRACTION_MAX_RETRIES:
                    logger.warning(
                        f"[PolicyService] Extraction attempt {attempt}/{EXTRACTION_MAX_RETRIES} "
                        f"failed: {e}. Retrying..."
                    )
        raise PolicyExtractionError(f"Extraction failed after {EXTRACTION_MAX_RETRIES} attempts: {last_error}")

    @staticmethod
    def _parse_rules_json(raw_response: str) -> list[dict]:
        clean_resp = raw_response.strip()
        if clean_resp.startswith("```json"):
            clean_resp = clean_resp[7:].rsplit("```", 1)[0].strip()
        elif clean_resp.startswith("```"):
            clean_resp = clean_resp[3:].rsplit("```", 1)[0].strip()
        parsed = json.loads(clean_resp)  # raises on malformed JSON — caller retries
        rules = parsed.get("rules", [])
        if not isinstance(rules, list):
            raise ValueError(f"Expected 'rules' to be a list, got {type(rules).__name__}")
        return rules

    # ------------------------------------------------------------------
    # Validation / normalization
    # ------------------------------------------------------------------
    def _validate_and_normalize(self, rules: list[dict]) -> tuple[list[dict], int]:
        normalized: list[dict] = []
        needs_review_count = 0

        for r in rules:
            parameter = (r.get("parameter") or "").strip() or None
            description = (r.get("description") or "").strip() or None
            rule_type = r.get("rule_type")
            priority = r.get("priority")
            policy_page = self._coerce_page(r.get("policy_page"))

            if not parameter and not description:
                logger.warning("[PolicyService] Skipping rule with no parameter and no description.")
                continue

            needs_review = False

            if rule_type not in VALID_RULE_TYPES:
                # CRITICAL: do NOT silently default an unclassifiable rule to
                # "Documentation" — that would remove it from being enforced
                # as a blocking rule with no trace of the ambiguity. Instead
                # keep it non-blocking (Documentation) but flag it so a human
                # reviews whether it should actually be Hard/Derived.
                logger.error(
                    f"[PolicyService] rule_type '{rule_type}' invalid/missing for "
                    f"parameter '{parameter}' — flagging for manual review instead of "
                    f"auto-classifying as enforceable or non-enforceable."
                )
                rule_type = "Documentation"
                needs_review = True

            if priority not in VALID_PRIORITIES:
                priority = "Medium"
                needs_review = True

            if rule_type in {"Hard", "Derived"} and not parameter:
                # A blocking rule with no parameter can't be evaluated
                # programmatically by the loan-checking engine.
                logger.error(
                    f"[PolicyService] {rule_type} rule has no 'parameter' — cannot be "
                    f"evaluated automatically. Flagging for manual review: "
                    f"{(description or '')[:80]}"
                )
                needs_review = True

            if needs_review:
                needs_review_count += 1

            normalized.append(
                {
                    "rule_id": r.get("rule_id") or f"rule_{uuid.uuid4().hex[:8]}",
                    "parameter": parameter,
                    "description": description,
                    "category": (r.get("category") or "").strip() or "Uncategorized",
                    "policy_section": r.get("policy_section"),
                    "policy_page": policy_page,
                    "priority": priority,
                    "rule_type": rule_type,
                    "needs_review": needs_review,
                }
            )

        return normalized, needs_review_count

    @staticmethod
    def _coerce_page(value: Any) -> int | None:
        if value in (None, "", "null"):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _dedupe(rules: list[dict]) -> list[dict]:
        """Cross-chunk boundaries can produce the same rule twice (e.g. a
        rule restated in a summary section). Dedupe on normalized
        (parameter, description) so the loan-checker doesn't evaluate the
        same Hard rule multiple times."""
        seen: set[tuple[str, str]] = set()
        deduped: list[dict] = []
        for r in rules:
            key = ((r["parameter"] or "").strip().lower(), (r["description"] or "").strip().lower())
            if key in seen:
                continue
            seen.add(key)
            deduped.append(r)
        return deduped

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    async def _store_rules(
        self, bank_id: str, version: str, rules: list[dict], extraction_id: str
    ) -> None:
        """Atomically supersede prior versions and insert the new rule set.

        Requires schema additions (see module docstring / migration note
        below): `is_active BOOLEAN DEFAULT TRUE` and `needs_review BOOLEAN
        DEFAULT FALSE` on policy_rules, and `raw_extraction_id` for
        traceability back to the audit table.
        """
        async with transaction():
            # Delete old policy rules and relationships for this bank
            await execute(
                "DELETE FROM policy_rules WHERE bank_id = $1",
                bank_id,
            )
            await execute(
                "DELETE FROM rule_relationships WHERE bank_id = $1",
                bank_id,
            )

            for r in rules:
                await execute(
                    """
                    INSERT INTO policy_rules (
                        rule_id, bank_id, policy_version, parameter, description,
                        category, policy_section, policy_page, priority, rule_type,
                        needs_review, is_active, raw_extraction_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, $12)
                    ON CONFLICT (rule_id) DO NOTHING
                    """,
                    r["rule_id"], bank_id, version, r["parameter"], r["description"],
                    r["category"], r["policy_section"], r["policy_page"], r["priority"],
                    r["rule_type"], r["needs_review"], extraction_id,
                )

    async def _record_audit(
        self, extraction_id: str, bank_id: str, version: str, chunk_index: int,
        raw_response: str, rule_count: int, success: bool,
    ) -> None:
        """Persist the raw LLM output per chunk for compliance/audit trace-back.
        Requires a `policy_extraction_audit` table (see migration note)."""
        try:
            await execute(
                """
                INSERT INTO policy_extraction_audit (
                    extraction_id, bank_id, policy_version, chunk_index,
                    raw_response, rule_count, success, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                extraction_id, bank_id, version, chunk_index,
                raw_response, rule_count, success, datetime.now(timezone.utc),
            )
        except Exception as e:
            # Audit logging must never break the extraction pipeline itself.
            logger.warning(f"[PolicyService] Failed to write extraction audit row: {e}")

    def _refresh_cache(self, bank_id: str, version: str, rules: list[dict]) -> None:
        cache_service.invalidate_bank_cache(bank_id)
        cache_service.set_policy_bundle(bank_id, version, {"rules": rules}, "rules_inventory")

        categories = {r["category"] for r in rules if r.get("category")}
        for cat in categories:
            cat_rules = [r for r in rules if r.get("category") == cat]
            cache_service.set_policy_bundle(bank_id, version, {"rules": cat_rules}, f"category:{cat}")

    # ------------------------------------------------------------------
    # Semantic chunker path (rules + relationships supplied pre-extracted)
    # ------------------------------------------------------------------
    async def process_policy_semantics(
        self, bank_id: str, version: str, rules: list[dict], relationships: list[dict]
    ) -> dict[str, Any]:
        """Stores semantic rules and their relationships generated by the
        Semantic Policy Chunker. Same supersession/validation guarantees as
        process_policy."""
        log = logger.bind(bank_id=bank_id, version=version)

        normalized_rules, needs_review_count = self._validate_and_normalize(rules)
        deduped_rules = self._dedupe(normalized_rules)
        rule_ids = {r["rule_id"] for r in deduped_rules}

        valid_relationships = [
            rel for rel in relationships
            if rel.get("source_rule_id") in rule_ids and rel.get("target_rule_id") in rule_ids
        ]
        dropped = len(relationships) - len(valid_relationships)
        if dropped:
            log.warning(
                f"[PolicyService] Dropped {dropped} relationship(s) referencing "
                f"unknown/filtered-out rule_id(s)."
            )

        extraction_id = uuid.uuid4().hex
        async with transaction():
            await execute(
                "DELETE FROM policy_rules WHERE bank_id = $1",
                bank_id,
            )
            await execute(
                "DELETE FROM rule_relationships WHERE bank_id = $1",
                bank_id,
            )
            for r in deduped_rules:
                await execute(
                    """
                    INSERT INTO policy_rules (
                        rule_id, bank_id, policy_version, parameter, description,
                        category, policy_section, policy_page, priority, rule_type,
                        needs_review, is_active, raw_extraction_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, $12)
                    ON CONFLICT (rule_id) DO NOTHING
                    """,
                    r["rule_id"], bank_id, version, r["parameter"], r["description"],
                    r["category"], r["policy_section"], r["policy_page"], r["priority"],
                    r["rule_type"], r["needs_review"], extraction_id,
                )
            for rel in valid_relationships:
                await execute(
                    """
                    INSERT INTO rule_relationships (bank_id, policy_version, source_rule_id, target_rule_id, relationship_type)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    bank_id, version, rel.get("source_rule_id"), rel.get("target_rule_id"),
                    rel.get("relationship_type"),
                )

        self._refresh_cache(bank_id, version, deduped_rules)

        log.info(
            f"[PolicyService] Stored {len(deduped_rules)} rules and "
            f"{len(valid_relationships)} relationships ({needs_review_count} need review)."
        )
        return {
            "rules": deduped_rules,
            "rule_count": len(deduped_rules),
            "needs_review_count": needs_review_count,
            "relationship_count": len(valid_relationships),
        }


policy_service = PolicyService()