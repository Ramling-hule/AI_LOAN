from __future__ import annotations

import re
from collections.abc import Iterable

TOKEN_RE = re.compile(r"\w+|[^\w\s]", re.UNICODE)
HEADING_RE = re.compile(
    r"^\s*(?:[A-Z][A-Z0-9 &/\-().]{4,}|(?:\d+\.?\s+)?[A-Z][A-Za-z0-9 &/\-()]{3,}:?)\s*$"
)


def normalize_document_type(document_type: str | None, document_name: str = "") -> str:
    value = f"{document_type or ''} {document_name or ''}".lower()

    if any(term in value for term in ("bank", "statement", "account statement")):
        return "bank_statement"
    if any(term in value for term in ("paystub", "pay_stub", "pay slip", "payslip", "salary slip")):
        return "pay_stub"
    if any(term in value for term in ("tax", "itr", "income tax", "return", "form 16", "w-2", "1099")):
        return "tax_return"
    if any(term in value for term in ("appraisal", "valuation", "property report")):
        return "appraisal"
    if any(term in value for term in ("aadhaar", "aadhar", "pan", "passport", "license", "id", "identity")):
        return "identity_document"
    if any(term in value for term in ("check", "cheque")):
        return "check"
    if any(term in value for term in ("balance sheet", "profit", "loss", "financial")):
        return "financial_statement"
    return document_type or "general"


def count_tokens(text: str) -> int:
    return len(TOKEN_RE.findall(text or ""))


def split_tokens(text: str, max_tokens: int, overlap_tokens: int) -> list[str]:
    tokens = TOKEN_RE.findall(text or "")
    if not tokens:
        return []

    chunks: list[str] = []
    step = max(max_tokens - overlap_tokens, 1)
    idx = 0
    while idx < len(tokens):
        chunk = _join_tokens(tokens[idx: idx + max_tokens]).strip()
        if chunk:
            chunks.append(chunk)
        if idx + max_tokens >= len(tokens):
            break
        idx += step
    return chunks


def split_sections(text: str) -> list[tuple[str | None, str]]:
    """Split text into heading-led sections while tolerating OCR line noise."""
    sections: list[tuple[str | None, list[str]]] = []
    current_title: str | None = None
    current_lines: list[str] = []

    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            if current_lines:
                current_lines.append("")
            continue

        if _looks_like_heading(line):
            if current_lines:
                sections.append((current_title, current_lines))
                current_lines = []
            current_title = line.rstrip(":")
            continue

        current_lines.append(raw_line)

    if current_lines:
        sections.append((current_title, current_lines))

    if not sections and text.strip():
        return [(None, text.strip())]

    return [(title, "\n".join(lines).strip()) for title, lines in sections if "\n".join(lines).strip()]


def split_paragraphs(text: str) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", text or "") if p.strip()]
    if len(paragraphs) > 1:
        return paragraphs
    return [p.strip() for p in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text or "") if p.strip()]


def merge_small_blocks(blocks: Iterable[str], target_tokens: int, max_tokens: int) -> list[str]:
    merged: list[str] = []
    current: list[str] = []
    current_tokens = 0

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        block_tokens = count_tokens(block)
        if current and current_tokens + block_tokens > max_tokens:
            merged.append("\n\n".join(current))
            current = []
            current_tokens = 0

        current.append(block)
        current_tokens += block_tokens

        if current_tokens >= target_tokens:
            merged.append("\n\n".join(current))
            current = []
            current_tokens = 0

    if current:
        merged.append("\n\n".join(current))
    return merged


def looks_like_table_row(line: str) -> bool:
    if not line.strip():
        return False
    has_money = bool(re.search(r"(?:rs\.?|inr|\$)?\s*[\d,]+\.\d{2}", line, re.IGNORECASE))
    many_columns = len(re.split(r"\s{2,}|\t|\|", line.strip())) >= 3
    return has_money or many_columns


def group_table_rows(text: str, max_rows: int = 35) -> list[str]:
    groups: list[str] = []
    current: list[str] = []
    for line in (text or "").splitlines():
        if looks_like_table_row(line):
            current.append(line)
            if len(current) >= max_rows:
                groups.append("\n".join(current))
                current = []
        else:
            if current:
                groups.append("\n".join(current))
                current = []
            if line.strip():
                groups.append(line.strip())
    if current:
        groups.append("\n".join(current))
    return groups


def extract_nearby_value(text: str, labels: tuple[str, ...]) -> str | None:
    label_pattern = "|".join(re.escape(label) for label in labels)
    match = re.search(rf"(?i)\b(?:{label_pattern})\b\s*[:\-]?\s*([A-Z0-9][^\n\r]{{0,80}})", text or "")
    if match:
        return match.group(1).strip()
    return None


def _looks_like_heading(line: str) -> bool:
    if len(line) > 90 or len(line) < 4:
        return False
    if looks_like_table_row(line):
        return False
    return bool(HEADING_RE.match(line))


def _join_tokens(tokens: list[str]) -> str:
    text = " ".join(tokens)
    text = re.sub(r"\s+([,.;:%)])", r"\1", text)
    text = re.sub(r"([(])\s+", r"\1", text)
    text = re.sub(r"([$])\s+", r"\1", text)
    return text
