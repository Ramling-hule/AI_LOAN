"""
Extraction Service — orchestrates the full parameter extraction pipeline.
Stores results in the PostgreSQL extracted_parameters table.

Key changes from v1:
  - Reads ExtractedField objects from the orchestrator (not just raw dicts)
  - Confidence scores now store the full provenance record (evidence, page, doc_type)
  - _validate_and_score uses format validation + composite confidence
  - DB storage is backward-compatible (same columns, same schema)
"""
from __future__ import annotations

import uuid
import json
import re
from loguru import logger
from config.database import execute, fetchrow
from config.settings import get_settings
from services.extraction.types import ExtractedField, REQUIRED_FIELDS, ALL_FIELDS
from services.extraction.llm_extractor import extract_parameters, extract_missing_fields

settings = get_settings()


SECOND_PASS_FIELDS = ["gstin", "pan", "annual_turnover", "net_profit", "avg_monthly_balance"]


_GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
_PAN_RE    = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")
_CIN_RE    = re.compile(r"^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$")
_LLPIN_RE  = re.compile(r"^[A-Z]{3}-\d{4}$")


class ExtractionService:

    async def run(
        self,
        application_id: str,
        loan_id: str,
        enable_second_pass: bool = True,
        force: bool = False,
    ) -> dict:
        """
        Full extraction pipeline. Returns the structured extraction result.
        Public API is identical to v1 — only internals changed.
        """
        logger.info(f"[Extraction] Starting pipeline for app={application_id}, loan={loan_id}")

        
        if not force:
            cached = await self._get_cached_result(application_id)
            if cached and cached.get("is_complete"):
                logger.info(f"[Extraction] Returning cached complete result for app={application_id}")
                return self._format_result(cached)

        
        extraction = await extract_parameters(application_id)
        raw: dict = extraction["raw"]
        extracted_fields: dict[str, ExtractedField] = extraction.get("extracted_fields", {})
        chunks: list[dict] = extraction["chunks"]
        avg_score: float = extraction["avg_chunk_score"]

        if not raw or all(v is None for v in raw.values()):
            logger.warning(f"[Extraction] No parameters extracted for app={application_id}")

        
        confidence_scores, missing_fields = self._validate_and_score(raw, extracted_fields)
        overall_confidence = (
            sum(c["score"] for c in confidence_scores.values())
            / max(len(confidence_scores), 1)
        )

        
        if enable_second_pass and missing_fields:
            critical_missing = [f for f in SECOND_PASS_FIELDS if f in missing_fields]
            if critical_missing:
                logger.info(f"[Extraction] Manual second-pass for: {critical_missing}")
                raw = await extract_missing_fields(application_id, raw, critical_missing)
                confidence_scores, missing_fields = self._validate_and_score(raw, {})
                overall_confidence = (
                    sum(c["score"] for c in confidence_scores.values())
                    / max(len(confidence_scores), 1)
                )

        is_complete = len(missing_fields) == 0

        
        extraction_id = await self._upsert_extraction(
            application_id=application_id,
            loan_id=loan_id,
            raw=raw,
            confidence_scores=confidence_scores,
            missing_fields=missing_fields,
            is_complete=is_complete,
            overall_confidence=overall_confidence,
        )

        result = {
            "extraction_id": str(extraction_id),
            "application_id": application_id,
            "is_complete": is_complete,
            "overall_confidence": round(overall_confidence, 4),
            "missing_fields": missing_fields,
            "extraction_model": f"google-gemini/{settings.GEMINI_FLASH_MODEL}+{settings.GEMINI_MODEL}",
            "parameters": raw,
            "confidence_scores": {k: v["score"] for k, v in confidence_scores.items()},
        }

        logger.info(
            f"[Extraction] Complete for app={application_id}. "
            f"Fields extracted: {len([v for v in raw.values() if v is not None])}/{len(ALL_FIELDS)}. "
            f"Confidence: {overall_confidence:.2%}. Missing: {missing_fields}"
        )

        return result

    

    def _validate_and_score(
        self,
        raw: dict,
        extracted_fields: dict[str, "ExtractedField"],
    ) -> tuple[dict[str, dict], list[str]]:
        """
        Validate extracted fields and compute per-field confidence records.

        Returns:
            confidence_scores: {field: {"score": float, "evidence": ..., "page": ..., ...}}
            missing_fields:    list of required fields that are null or invalid
        """
        confidence_scores: dict[str, dict] = {}
        missing_fields: list[str] = []

        def _ef(field: str) -> ExtractedField | None:
            return extracted_fields.get(field)

        def _base_record(field: str, score: float) -> dict:
            ef = _ef(field)
            if ef:
                return ef.to_confidence_record() | {"score": score}
            return {"score": score, "source": "llm", "page": None, "document_type": None,
                    "evidence": None, "rerank_score": 0.0, "retrieval_score": 0.0}

        
        gstin = raw.get("gstin")
        if gstin:
            valid = bool(_GSTIN_RE.match(str(gstin)))
            score = 0.99 if valid and _ef("gstin") and _ef("gstin").source == "regex" else \
                    (_ef("gstin").confidence if _ef("gstin") else (0.90 if valid else 0.50))
            confidence_scores["gstin"] = _base_record("gstin", score)
            if not valid:
                missing_fields.append("gstin")
        else:
            missing_fields.append("gstin")
            confidence_scores["gstin"] = _base_record("gstin", 0.0)

        pan = raw.get("pan")
        if pan:
            valid = bool(_PAN_RE.match(str(pan)))
            score = _ef("pan").confidence if _ef("pan") else (0.90 if valid else 0.50)
            confidence_scores["pan"] = _base_record("pan", score)
            if not valid:
                missing_fields.append("pan")
        else:
            missing_fields.append("pan")
            confidence_scores["pan"] = _base_record("pan", 0.0)

        cin = raw.get("cin")
        if cin:
            valid = bool(_CIN_RE.match(str(cin)))
            score = _ef("cin").confidence if _ef("cin") else (0.90 if valid else 0.50)
            confidence_scores["cin"] = _base_record("cin", score)
        else:
            confidence_scores["cin"] = _base_record("cin", 0.0)

        llpin = raw.get("llpin")
        if llpin:
            valid = bool(_LLPIN_RE.match(str(llpin)))
            score = _ef("llpin").confidence if _ef("llpin") else (0.90 if valid else 0.50)
            confidence_scores["llpin"] = _base_record("llpin", score)
        else:
            confidence_scores["llpin"] = _base_record("llpin", 0.0)

        
        for field in ["annual_turnover", "net_profit", "total_liabilities", "avg_monthly_balance"]:
            val = raw.get(field)
            if val is not None and val != "":
                try:
                    float(val)
                    score = _ef(field).confidence if _ef(field) else 0.90
                    confidence_scores[field] = _base_record(field, score)
                except (TypeError, ValueError):
                    confidence_scores[field] = _base_record(field, 0.0)
                    if field in REQUIRED_FIELDS:
                        missing_fields.append(field)
            else:
                if field in REQUIRED_FIELDS:
                    missing_fields.append(field)
                confidence_scores[field] = _base_record(field, 0.0)

        
        cbc = raw.get("cheque_bounce_count")
        if cbc is not None:
            score = _ef("cheque_bounce_count").confidence if _ef("cheque_bounce_count") else 0.85
            confidence_scores["cheque_bounce_count"] = _base_record("cheque_bounce_count", score)
        else:
            confidence_scores["cheque_bounce_count"] = _base_record("cheque_bounce_count", 0.0)

        
        for field in ["loan_balances", "promoter_details", "collateral_details"]:
            val = raw.get(field)
            ef = _ef(field)
            if isinstance(val, list):
                score = ef.confidence if ef else 0.80
            else:
                score = 0.0
            confidence_scores[field] = _base_record(field, score)

        return confidence_scores, missing_fields

    

    async def _upsert_extraction(
        self,
        application_id: str,
        loan_id: str,
        raw: dict,
        confidence_scores: dict,
        missing_fields: list,
        is_complete: bool,
        overall_confidence: float,
    ) -> str:
        """Upsert extraction result to extracted_parameters table (schema unchanged)."""

        def clean(v, default):
            if v is None:
                return default
            if isinstance(v, str):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return v

        def clean_scalar(v):
            if isinstance(v, list):
                return str(v[0]) if len(v) > 0 else None
            if isinstance(v, dict):
                return None
            if v == "":
                return None
            return v

        loan_balances     = clean(raw.get("loan_balances"), [])
        promoter_details  = clean(raw.get("promoter_details"), [])
        collateral_details= clean(raw.get("collateral_details"), [])
        
        confidence_json   = clean(confidence_scores, {})

        existing = await fetchrow(
            "SELECT id FROM extracted_parameters WHERE application_id = $1",
            application_id,
        )

        if existing:
            await execute(
                """
                UPDATE extracted_parameters SET
                    gstin = $2, pan = $3, cin = $4, llpin = $5,
                    annual_turnover = $6, net_profit = $7, total_liabilities = $8,
                    avg_monthly_balance = $9, cheque_bounce_count = $10,
                    loan_balances = $11::jsonb, promoter_details = $12::jsonb,
                    collateral_details = $13::jsonb,
                    confidence_scores = $14::jsonb, missing_fields = $15,
                    is_complete = $16, updated_at = NOW()
                WHERE application_id = $1
                """,
                application_id,
                clean_scalar(raw.get("gstin")), clean_scalar(raw.get("pan")), clean_scalar(raw.get("cin")), clean_scalar(raw.get("llpin")),
                clean_scalar(raw.get("annual_turnover")), clean_scalar(raw.get("net_profit")), clean_scalar(raw.get("total_liabilities")),
                clean_scalar(raw.get("avg_monthly_balance")), clean_scalar(raw.get("cheque_bounce_count")),
                loan_balances, promoter_details, collateral_details,
                confidence_json, missing_fields, is_complete,
            )
            return existing["id"]

        new_id = str(uuid.uuid4())
        await execute(
            """
            INSERT INTO extracted_parameters (
                id, application_id, loan_id,
                gstin, pan, cin, llpin,
                annual_turnover, net_profit, total_liabilities,
                avg_monthly_balance, cheque_bounce_count,
                loan_balances, promoter_details, collateral_details,
                confidence_scores, missing_fields, is_complete
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12,
                $13::jsonb, $14::jsonb, $15::jsonb,
                $16::jsonb, $17, $18
            )
            """,
            new_id, application_id, loan_id,
            clean_scalar(raw.get("gstin")), clean_scalar(raw.get("pan")), clean_scalar(raw.get("cin")), clean_scalar(raw.get("llpin")),
            clean_scalar(raw.get("annual_turnover")), clean_scalar(raw.get("net_profit")), clean_scalar(raw.get("total_liabilities")),
            clean_scalar(raw.get("avg_monthly_balance")), clean_scalar(raw.get("cheque_bounce_count")),
            loan_balances, promoter_details, collateral_details,
            confidence_json, missing_fields, is_complete,
        )
        return new_id

    

    async def _get_cached_result(self, application_id: str) -> dict | None:
        row = await fetchrow(
            "SELECT * FROM extracted_parameters WHERE application_id = $1",
            application_id,
        )
        return dict(row) if row else None

    def _format_result(self, row: dict) -> dict:
        """Format a PostgreSQL row into the standard result dict."""
        def parse_json(v, default):
            if v is None:
                return default
            if isinstance(v, str):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return v

        confidence_scores_raw = parse_json(row.get("confidence_scores"), {})
        
        confidence_scores = {
            k: (v["score"] if isinstance(v, dict) else v)
            for k, v in confidence_scores_raw.items()
        }

        return {
            "extraction_id": str(row["id"]),
            "application_id": row["application_id"],
            "is_complete": row["is_complete"],
            "missing_fields": row.get("missing_fields", []),
            "parameters": {
                "gstin":                row.get("gstin"),
                "pan":                  row.get("pan"),
                "cin":                  row.get("cin"),
                "llpin":                row.get("llpin"),
                "annual_turnover":      row.get("annual_turnover"),
                "net_profit":           row.get("net_profit"),
                "total_liabilities":    row.get("total_liabilities"),
                "avg_monthly_balance":  row.get("avg_monthly_balance"),
                "cheque_bounce_count":  row.get("cheque_bounce_count"),
                "loan_balances":        parse_json(row.get("loan_balances"), []),
                "promoter_details":     parse_json(row.get("promoter_details"), []),
                "collateral_details":   parse_json(row.get("collateral_details"), []),
            },
            "confidence_scores": confidence_scores,
        }


extraction_service = ExtractionService()
