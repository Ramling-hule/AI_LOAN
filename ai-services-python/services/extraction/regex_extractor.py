"""
Deterministic regex-based pre-extraction for Indian identity fields.

These patterns cover GSTIN, PAN, CIN, and LLPIN which follow strict
government-defined formats and can be extracted with near-certainty
without any LLM involvement.

Extracted values are passed to domain agents as "known_values" so the
LLM is instructed NOT to re-extract them — eliminating hallucination risk
for these critical identity anchors.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from loguru import logger

# ── Patterns ──────────────────────────────────────────────────────────────────

# GSTIN: 15 chars — state code (2 digits) + PAN (10) + entity number + Z + checksum
_GSTIN_RE = re.compile(
    r"\b(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b"
)

# PAN: 10 chars — AAAAA9999A format
# Negative lookahead avoids matching PAN embedded inside a GSTIN
_PAN_RE = re.compile(
    r"(?<!\d)([A-Z]{5}\d{4}[A-Z])(?!\d)"
)

# CIN: Company Identification Number  L/U + 5 digits + state (2 letters) +
#       year (4 digits) + company type (3 letters) + sequence (6 digits)
_CIN_RE = re.compile(
    r"\b([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b"
)

# LLPIN: LLP Identification Number  AAA-0000
_LLPIN_RE = re.compile(
    r"\b([A-Z]{3}-\d{4})\b"
)

# GSTIN validator (full format check)
_GSTIN_VALID_RE = re.compile(
    r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$"
)

# PAN validator
_PAN_VALID_RE = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class RegexMatch:
    """Result of a single regex extraction attempt."""
    value: str
    confidence: float    # 0.99 if pattern + validation pass, 0.80 if pattern only
    pattern_name: str
    raw_match: str       # the exact string matched


# ── Extractor ─────────────────────────────────────────────────────────────────

def extract_identity_fields(text: str) -> dict[str, Optional[RegexMatch]]:
    """
    Scan *text* for all Indian identity numbers.

    Returns a dict with keys: "gstin", "pan", "cin", "llpin".
    Each value is a RegexMatch or None if not found.

    When multiple matches exist, the one that passes full validation
    (and appears most often) is preferred.
    """
    results: dict[str, Optional[RegexMatch]] = {
        "gstin": None,
        "pan": None,
        "cin": None,
        "llpin": None,
    }

    # ── GSTIN ──────────────────────────────────────────────────────────────
    gstin_matches = _GSTIN_RE.findall(text)
    if gstin_matches:
        # Prefer matches that pass full validation
        valid = [m for m in gstin_matches if _GSTIN_VALID_RE.match(m)]
        chosen = valid[0] if valid else gstin_matches[0]
        conf = 0.99 if valid else 0.80
        results["gstin"] = RegexMatch(
            value=chosen,
            confidence=conf,
            pattern_name="GSTIN_15",
            raw_match=chosen,
        )
        logger.debug(f"[RegexExtractor] GSTIN found: {chosen} (conf={conf})")

    # ── PAN ────────────────────────────────────────────────────────────────
    pan_matches = _PAN_RE.findall(text)
    if pan_matches:
        # Filter out PANs that are substrings of a GSTIN we already found
        gstin_val = results["gstin"].value if results["gstin"] else ""
        filtered = [m for m in pan_matches if m not in gstin_val]
        if filtered:
            valid = [m for m in filtered if _PAN_VALID_RE.match(m)]
            chosen = valid[0] if valid else filtered[0]
            conf = 0.99 if valid else 0.80
            results["pan"] = RegexMatch(
                value=chosen,
                confidence=conf,
                pattern_name="PAN_10",
                raw_match=chosen,
            )
            logger.debug(f"[RegexExtractor] PAN found: {chosen} (conf={conf})")

    # ── CIN ────────────────────────────────────────────────────────────────
    cin_matches = _CIN_RE.findall(text)
    if cin_matches:
        chosen = cin_matches[0]
        results["cin"] = RegexMatch(
            value=chosen,
            confidence=0.99,
            pattern_name="CIN_21",
            raw_match=chosen,
        )
        logger.debug(f"[RegexExtractor] CIN found: {chosen}")

    # ── LLPIN ──────────────────────────────────────────────────────────────
    llpin_matches = _LLPIN_RE.findall(text)
    if llpin_matches:
        chosen = llpin_matches[0]
        results["llpin"] = RegexMatch(
            value=chosen,
            confidence=0.99,
            pattern_name="LLPIN_7",
            raw_match=chosen,
        )
        logger.debug(f"[RegexExtractor] LLPIN found: {chosen}")

    return results


def extract_from_chunks(chunks: list[dict]) -> dict[str, Optional[RegexMatch]]:
    """
    Run extract_identity_fields over the combined text of all provided chunks.
    Returns the best match found across the entire corpus.
    """
    combined = "\n".join(c.get("text", "") for c in chunks if c.get("text"))
    return extract_identity_fields(combined)


def to_known_values_hint(regex_results: dict[str, Optional[RegexMatch]]) -> str:
    """
    Format regex results as a human-readable hint to inject into agent prompts.
    Only includes fields that were successfully extracted.
    """
    lines = []
    for field, match in regex_results.items():
        if match:
            lines.append(f"  {field}: {match.value}  (confidence={match.confidence:.2f}, source=regex)")
    if not lines:
        return "  None detected by pre-scan."
    return "\n".join(lines)
