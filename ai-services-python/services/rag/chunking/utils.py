"""
Pure utility functions for the chunking subsystem.
No imports from other chunking modules to avoid circular dependencies.
"""
from __future__ import annotations

import re
from typing import Any


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def count_tokens(text: str) -> int:
    """Approximate token count (≈ GPT-style: 1 token ≈ 4 chars)."""
    return max(1, len(text) // 4)


def split_tokens(text: str, max_tokens: int, overlap_tokens: int) -> list[str]:
    """Split text into overlapping token-window chunks."""
    words = text.split()
    if not words:
        return []

    # Approx words per token; keep it simple
    words_per_token = 0.75
    max_words = max(1, int(max_tokens * words_per_token))
    overlap_words = max(0, int(overlap_tokens * words_per_token))
    step = max(1, max_words - overlap_words)

    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i: i + max_words]
        chunks.append(" ".join(chunk_words))
        i += step
    return chunks


# ---------------------------------------------------------------------------
# Text splitting helpers
# ---------------------------------------------------------------------------

HEADING_RE = re.compile(
    r"^(?:"
    r"\d+(?:\.\d+)*\.?\s+[A-Z]"        # "1.2 Heading" / "3. Introduction"
    r"|[A-Z][A-Z\s]{4,}$"              # "ALL CAPS HEADING"
    r"|(?:CHAPTER|SECTION|PART)\s+\w"  # explicit labels
    r")",
    re.MULTILINE,
)

# A real heading is short. Without this guard, the first HEADING_RE
# alternative (`\d+... [A-Z]`) matches merely on a line's PREFIX — since
# re.match only anchors at the start and that alternative has no trailing
# `$` — so it was misclassifying long numbered sentences/clauses ("1. In
# the event that the applicant fails to provide documentation within...")
# as section headings. That over-segments the document into extra tiny
# sections that can never be merged back together (merge_small_blocks only
# merges within one section), producing isolated low-content chunks.
MAX_HEADING_WORDS = 12


def split_sections(text: str) -> list[tuple[str | None, str]]:
    """Split text into (section_title, body) pairs using heuristic headings."""
    if not text:
        return [(None, "")]

    lines = text.splitlines()
    sections: list[tuple[str | None, str]] = []
    current_title: str | None = None
    current_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        is_heading = (
            bool(stripped)
            and len(stripped) < 120
            and len(stripped.split()) <= MAX_HEADING_WORDS
            and HEADING_RE.match(stripped)
        )
        if is_heading:
            # flush previous section
            body = "\n".join(current_lines).strip()
            if body or current_title is not None:
                sections.append((current_title, body))
            current_title = stripped
            current_lines = []
        else:
            current_lines.append(line)

    # flush last section
    body = "\n".join(current_lines).strip()
    sections.append((current_title, body))

    return sections if sections else [(None, text)]


def split_paragraphs(text: str) -> list[str]:
    """Split on blank lines; collapse internal whitespace."""
    paragraphs = re.split(r"\n\s*\n", text)
    return [p.strip() for p in paragraphs if p.strip()]


def group_table_rows(text: str) -> list[str]:
    """
    Group lines that look like table rows together so a single
    row is never split from its siblings.  Falls back to
    split_paragraphs for non-tabular text.
    """
    lines = text.splitlines()
    groups: list[str] = []
    current_group: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_group:
                groups.append("\n".join(current_group))
                current_group = []
        else:
            # heuristic: row-like if it has pipe chars, tabs, or ≥2 consecutive spaces
            is_row_like = "|" in stripped or "\t" in line or "  " in stripped
            if is_row_like or current_group:
                current_group.append(stripped)
            else:
                groups.append(stripped)

    if current_group:
        groups.append("\n".join(current_group))

    return groups if groups else split_paragraphs(text)


def merge_small_blocks(blocks: list[str], target_tokens: int, max_tokens: int) -> list[str]:
    """
    Merge adjacent small blocks up to target_tokens.
    Never merges two blocks that would together exceed max_tokens.
    """
    if not blocks:
        return []

    merged: list[str] = []
    buffer = blocks[0]

    for block in blocks[1:]:
        combined = buffer + "\n\n" + block
        if count_tokens(combined) <= max_tokens:
            buffer = combined
        else:
            merged.append(buffer)
            buffer = block

    merged.append(buffer)
    return merged


# ---------------------------------------------------------------------------
# Document type normaliser
# ---------------------------------------------------------------------------

DOC_TYPE_MAP: dict[str, str] = {
    # bank statement aliases
    "bank_statement": "bank_statement",
    "bank statement": "bank_statement",
    "statement": "bank_statement",
    # pay stub aliases
    "pay_stub": "pay_stub",
    "pay stub": "pay_stub",
    "payslip": "pay_stub",
    "salary_slip": "pay_stub",
    "salary slip": "pay_stub",
    # tax return
    "tax_return": "tax_return",
    "tax return": "tax_return",
    "itr": "tax_return",
    # appraisal
    "appraisal": "appraisal",
    "valuation": "appraisal",
    "property_valuation": "appraisal",
    # identity
    "identity_document": "identity_document",
    "identity document": "identity_document",
    "id_proof": "identity_document",
    "id proof": "identity_document",
    "aadhar": "identity_document",
    "aadhaar": "identity_document",
    "passport": "identity_document",
    # check / cheque
    "check": "check",
    "cheque": "check",
    # financial statement
    "financial_statement": "financial_statement",
    "financial statement": "financial_statement",
    "balance_sheet": "financial_statement",
    "balance sheet": "financial_statement",
    "profit_and_loss": "financial_statement",
    # bank policy
    "bank_policy": "bank_policy",
    "bank policy": "bank_policy",
    "policy": "bank_policy",
    "credit_policy": "bank_policy",
}

FILENAME_HINTS: dict[str, str] = {
    "bank_statement": "bank_statement",
    "statement": "bank_statement",
    "payslip": "pay_stub",
    "pay_stub": "pay_stub",
    "salary": "pay_stub",
    "itr": "tax_return",
    "tax": "tax_return",
    "appraisal": "appraisal",
    "valuation": "appraisal",
    "passport": "identity_document",
    "aadhaar": "identity_document",
    "aadhar": "identity_document",
    "pan_card": "identity_document",
    "cheque": "check",
    "check": "check",
    "balance_sheet": "financial_statement",
    "financial": "financial_statement",
    "policy": "bank_policy",
    "credit_policy": "bank_policy",
}


def normalize_document_type(document_type: str, document_name: str = "") -> str:
    """Return a canonical document type string."""
    key = (document_type or "").strip().lower()
    if key in DOC_TYPE_MAP:
        return DOC_TYPE_MAP[key]

    # try filename hints
    name_lower = (document_name or "").lower()
    for hint, canonical in FILENAME_HINTS.items():
        if hint in name_lower:
            return canonical

    return key or "general"


# ---------------------------------------------------------------------------
# RAG context helper used by StructuredFactExtractor in facts.py
# ---------------------------------------------------------------------------

def extract_nearby_value(text: str, labels: tuple[str, ...], window: int = 120) -> str | None:
    """
    Return the text immediately following the first matched label (up to
    *window* characters, trimmed at the next newline).

    Examples:
        extract_nearby_value(txt, ("account holder", "customer name"))
    """
    text_lower = text.lower()
    for label in labels:
        idx = text_lower.find(label.lower())
        if idx == -1:
            continue
        after = text[idx + len(label): idx + len(label) + window]
        # strip leading punctuation/whitespace
        after = re.sub(r"^[\s:–\-]+", "", after)
        # clip at newline
        line = after.split("\n")[0].strip()
        if line:
            return line
    return None