"""
Shared type definitions for the multi-agent extraction pipeline.

ExtractedField is the canonical result object produced by every domain agent,
the regex extractor, and the verification agent. It travels through the whole
pipeline and is finally flattened into plain values for PostgreSQL storage.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class ExtractedField:
    """
    A single extracted parameter with full provenance.

    Attributes:
        value:         The extracted value (str, int, float, list, or None).
        confidence:    Composite confidence score in [0.0, 1.0].
        page:          Page number in the source document (1-indexed), or None.
        document_type: E.g. "gst_certificate", "bank_statement", "itr".
        evidence:      Verbatim text snippet that contains the value.
        source:        How the value was obtained.
        rerank_score:  Best cross-encoder re-rank score of the supporting chunk.
        retrieval_score: Best cosine-similarity score of the supporting chunk.
    """
    value: Any = None
    confidence: float = 0.0
    page: int | None = None
    document_type: str | None = None
    evidence: str | None = None
    source: Literal["regex", "llm", "verified", "merged"] = "llm"
    rerank_score: float = 0.0
    retrieval_score: float = 0.0

    def is_present(self) -> bool:
        """Return True if the field has a usable (non-null) value."""
        if self.value is None:
            return False
        if isinstance(self.value, (list,)) and len(self.value) == 0:
            return True   # empty list is valid (no loans / no collateral)
        return True

    def to_confidence_record(self) -> dict:
        """
        Serialise to the JSONB structure stored in extracted_parameters.confidence_scores.
        Backward-compatible: existing readers only check the numeric score.
        """
        return {
            "score": round(self.confidence, 4),
            "source": self.source,
            "page": self.page,
            "document_type": self.document_type,
            "evidence": (self.evidence or "")[:500],  # cap at 500 chars
            "rerank_score": round(self.rerank_score, 4),
            "retrieval_score": round(self.retrieval_score, 4),
        }


# ── Canonical field list ──────────────────────────────────────────────────────

SCALAR_FIELDS: list[str] = [
    "gstin", "pan", "cin", "llpin",
    "annual_turnover", "net_profit", "total_liabilities",
    "avg_monthly_balance", "cheque_bounce_count",
]

ARRAY_FIELDS: list[str] = [
    "loan_balances", "promoter_details", "collateral_details",
]

ALL_FIELDS: list[str] = SCALAR_FIELDS + ARRAY_FIELDS

# Fields considered mandatory for a "complete" extraction
REQUIRED_FIELDS: list[str] = [
    "gstin", "pan", "annual_turnover", "net_profit", "avg_monthly_balance",
]
