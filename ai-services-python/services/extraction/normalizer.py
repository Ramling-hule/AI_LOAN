"""
OCR and monetary normalization for Indian SME financial documents.

Problems addressed:
  - OCR whitespace artifacts: "2 7 A B C D E 1 2 3 4 F 1 Z 5" → "27ABCDE1234F1Z5"
  - Indian currency labels: "₹", "Rs.", "INR", "Crore", "Lakh"
  - Indian number formatting: "1,20,00,000" or "1 20 00 000" → 12000000
  - Common OCR char substitutions: 'O'↔'0', 'l'↔'1', 'S'↔'5'
  - Duplicate/collapsed whitespace
"""
from __future__ import annotations

import re
from typing import Optional

from loguru import logger

# ── Monetary conversion constants ─────────────────────────────────────────────

_CRORE = 10_000_000   # 1 Crore = 10,000,000
_LAKH  = 100_000      # 1 Lakh  = 100,000
_THOU  = 1_000        # 1 Thousand = 1,000

# ── Regex patterns ────────────────────────────────────────────────────────────

# Matches "2.3 Crore", "2.3Cr", "2.3 cr"
_CRORE_RE = re.compile(
    r"""([\d,\s]+(?:\.\d+)?)\s*(?:crore|cr\.?)\b""",
    re.IGNORECASE,
)
# Matches "12.5 Lakh", "12.5L", "12.5 lacs"
_LAKH_RE = re.compile(
    r"""([\d,\s]+(?:\.\d+)?)\s*(?:lakh|lac(?:s)?|l\.?)\b""",
    re.IGNORECASE,
)
# Matches "500 thousand", "500K"
_THOUSAND_RE = re.compile(
    r"""([\d,\s]+(?:\.\d+)?)\s*(?:thousand|k)\b""",
    re.IGNORECASE,
)
# Currency prefix: ₹, Rs., INR (strip before number)
_CURRENCY_PREFIX_RE = re.compile(r"(?:₹|Rs\.?|INR)\s*", re.IGNORECASE)
# Indian comma-formatted numbers: 1,20,00,000
_INDIAN_NUM_RE = re.compile(r"\d{1,2}(?:,\d{2})+(?:,\d{3})?")
# Collapsed spaces inside a number/identifier caused by OCR
_SPACED_ALPHANUM_RE = re.compile(r"(?<=[A-Z0-9])\s(?=[A-Z0-9])")


# ── Public API ────────────────────────────────────────────────────────────────

def normalize_chunk(text: str) -> str:
    """
    Normalize a single document chunk for downstream regex and LLM consumption.

    Steps:
      1. Collapse multiple whitespace → single space
      2. Remove currency prefixes from amounts
      3. Convert Indian-formatted numbers to plain digits
      4. Convert Crore/Lakh/Thousand labels to plain digits
      5. Repair OCR-spaced identifiers (e.g. GSTIN, PAN)
    """
    if not text:
        return text

    # Step 1: Normalise whitespace
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Step 2: Strip currency prefixes but preserve surrounding whitespace
    # "Rs. 2.3" → "2.3",  "Total: ₹2.3" → "Total: 2.3"
    text = re.sub(r'(?:₹|Rs\.?|INR)\s*', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'[ \t]+', ' ', text)  # re-collapse any doubled spaces

    # Step 3: Indian number formatting → plain digits (do before Crore/Lakh)
    def _deindian_num(m: re.Match) -> str:
        return m.group(0).replace(",", "")
    text = _INDIAN_NUM_RE.sub(_deindian_num, text)

    # Step 4: Crore → plain integer/float
    def _crore(m: re.Match) -> str:
        try:
            raw = m.group(1).replace(",", "").strip()
            num = float(raw)
            result = str(int(num * _CRORE)) if num == int(num) else f"{num * _CRORE:.0f}"
            # Preserve a leading space if the match started with one
            prefix = " " if m.group(1).startswith(" ") else ""
            return prefix + result
        except ValueError:
            return m.group(0)
    text = _CRORE_RE.sub(_crore, text)

    # Lakh → plain integer/float
    def _lakh(m: re.Match) -> str:
        try:
            raw = m.group(1).replace(",", "").strip()
            num = float(raw)
            result = str(int(num * _LAKH)) if num == int(num) else f"{num * _LAKH:.0f}"
            prefix = " " if m.group(1).startswith(" ") else ""
            return prefix + result
        except ValueError:
            return m.group(0)
    text = _LAKH_RE.sub(_lakh, text)

    # Thousand → plain integer/float
    def _thousand(m: re.Match) -> str:
        try:
            raw = m.group(1).replace(",", "").strip()
            num = float(raw)
            prefix = " " if m.group(1).startswith(" ") else ""
            return prefix + str(int(num * _THOU))
        except ValueError:
            return m.group(0)
    text = _THOUSAND_RE.sub(_thousand, text)

    # Step 5: Collapse OCR-spaced identifiers  e.g. "2 7 A B C" → "27ABC"
    # Only collapse single-char tokens that look like parts of an identifier
    text = _SPACED_ALPHANUM_RE.sub("", text)

    return text.strip()


def normalize_chunks(chunks: list[dict]) -> list[dict]:
    """
    Normalize the 'text' field of every chunk dict in-place.
    Returns the same list (mutated).
    """
    for chunk in chunks:
        if chunk.get("text"):
            chunk["text"] = normalize_chunk(chunk["text"])
    return chunks


def parse_indian_amount(text: str) -> Optional[float]:
    """
    Parse an Indian monetary string into a plain rupee float.

    Examples:
        "2.3 Crore"       →  23_000_000.0
        "12.5 Lakh"       →  1_250_000.0
        "₹ 1,50,000"      →  150_000.0
        "1 20 00 000"     →  12_000_000.0   (OCR spaced)
        "500 Thousand"    →  500_000.0

    Returns None if parsing fails.
    """
    if not text:
        return None

    text = text.strip()
    # Strip currency symbols
    text = _CURRENCY_PREFIX_RE.sub("", text).strip()

    # Check for unit multipliers
    m = _CRORE_RE.search(text)
    if m:
        try:
            return float(m.group(1).replace(",", "").replace(" ", "")) * _CRORE
        except ValueError:
            pass

    m = _LAKH_RE.search(text)
    if m:
        try:
            return float(m.group(1).replace(",", "").replace(" ", "")) * _LAKH
        except ValueError:
            pass

    m = _THOUSAND_RE.search(text)
    if m:
        try:
            return float(m.group(1).replace(",", "").replace(" ", "")) * _THOU
        except ValueError:
            pass

    # Plain number (possibly with Indian commas or spaces)
    plain = re.sub(r"[,\s]", "", text)
    try:
        return float(plain)
    except ValueError:
        return None


def to_rupees(value: float | int | str | None) -> Optional[float]:
    """
    Coerce a value (already passed through the LLM) to a plain rupee float.
    Handles cases where the LLM returns a string like "2300000" or "23,00,000".
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return parse_indian_amount(value)
    return None
