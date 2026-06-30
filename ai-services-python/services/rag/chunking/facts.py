from __future__ import annotations

import re
from typing import Any

from services.rag.chunking.utils import extract_nearby_value

MONEY_RE = r"(?:rs\.?|inr|\$)?\s*[\d,]+(?:\.\d{1,2})?"


class StructuredFactExtractor:
    """Heuristic document facts that support filtering/citations without replacing extraction agents."""

    def extract(self, text: str, document_type: str) -> dict[str, Any]:
        extractor = {
            "bank_statement": self._bank_statement,
            "pay_stub": self._pay_stub,
            "tax_return": self._tax_return,
            "appraisal": self._appraisal,
            "identity_document": self._identity_document,
            "check": self._check,
            "financial_statement": self._financial_statement,
        }.get(document_type, self._generic)
        return {k: v for k, v in extractor(text or "").items() if v not in (None, "", [])}

    def _generic(self, text: str) -> dict[str, Any]:
        return {
            "pan": self._first_match(text, r"\b[A-Z]{5}\d{4}[A-Z]\b"),
            "gstin": self._first_match(text, r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b"),
        }

    def _bank_statement(self, text: str) -> dict[str, Any]:
        return self._generic(text) | {
            "account_holder": extract_nearby_value(text, ("account holder", "customer name", "name")),
            "account_number_hint": self._account_number_hint(text),
            "statement_period": self._statement_period(text),
            "opening_balance": self._money_after(text, ("opening balance", "beginning balance")),
            "closing_balance": self._money_after(text, ("closing balance", "ending balance")),
        }

    def _pay_stub(self, text: str) -> dict[str, Any]:
        return self._generic(text) | {
            "employee": extract_nearby_value(text, ("employee", "employee name")),
            "employer": extract_nearby_value(text, ("employer", "company", "organization")),
            "pay_period": extract_nearby_value(text, ("pay period", "period")),
            "gross_pay": self._money_after(text, ("gross pay", "gross earnings")),
            "net_pay": self._money_after(text, ("net pay", "net salary")),
            "ytd_income": self._money_after(text, ("ytd", "year to date", "ytd gross")),
        }

    def _tax_return(self, text: str) -> dict[str, Any]:
        return self._generic(text) | {
            "tax_year": self._first_match(text, r"\b(?:20\d{2}|19\d{2})\b"),
            "form_name": self._first_match(text, r"\b(?:ITR[-\s]?\d|Form\s+16|1040|W-2|1099)\b"),
            "gross_income": self._money_after(text, ("gross total income", "total income", "adjusted gross income")),
            "tax_payable": self._money_after(text, ("tax payable", "total tax")),
        }

    def _appraisal(self, text: str) -> dict[str, Any]:
        return {
            "property_address": extract_nearby_value(text, ("property address", "subject property", "address")),
            "appraised_value": self._money_after(text, ("appraised value", "market value", "valuation")),
            "valuation_date": extract_nearby_value(text, ("valuation date", "effective date")),
        }

    def _identity_document(self, text: str) -> dict[str, Any]:
        return self._generic(text) | {
            "aadhaar_hint": self._first_match(text, r"\b(?:\d{4}\s?){2}\d{4}\b"),
            "document_number_hint": extract_nearby_value(text, ("document number", "id number", "passport no")),
            "name": extract_nearby_value(text, ("name", "full name")),
        }

    def _check(self, text: str) -> dict[str, Any]:
        return {
            "payee": extract_nearby_value(text, ("pay", "payee")),
            "amount": self._money_after(text, ("amount", "rupees", "dollars")),
            "account_number_hint": self._account_number_hint(text),
        }

    def _financial_statement(self, text: str) -> dict[str, Any]:
        return self._generic(text) | {
            "revenue": self._money_after(text, ("revenue", "sales", "turnover")),
            "net_profit": self._money_after(text, ("net profit", "profit after tax")),
            "total_liabilities": self._money_after(text, ("total liabilities", "liabilities")),
            "total_assets": self._money_after(text, ("total assets", "assets")),
        }

    def _money_after(self, text: str, labels: tuple[str, ...]) -> str | None:
        label_pattern = "|".join(re.escape(label) for label in labels)
        return self._first_match(text, rf"(?i)\b(?:{label_pattern})\b\s*[:\-]?\s*({MONEY_RE})")

    def _statement_period(self, text: str) -> str | None:
        return self._first_match(
            text,
            r"(?i)(?:statement period|period)\s*[:\-]?\s*([A-Za-z0-9, /\-.]+(?:to|-)[A-Za-z0-9, /\-.]+)",
        )

    def _account_number_hint(self, text: str) -> str | None:
        labeled = self._first_match(
            text,
            r"(?i)(?:account(?:\s+number|\s+no\.?)?|a/c\s+no\.?)\s*[:\-]?\s*((?:x+|X+|\*+)?\d[\d\s-]{3,20})",
        )
        if labeled:
            digits = re.sub(r"\D", "", labeled)
            return f"***{digits[-4:]}" if len(digits) >= 4 else None
        masked = self._first_match(text, r"(?:x{2,}|X{2,}|\*{2,})\s*\d{4}\b")
        return masked

    def _first_match(self, text: str, pattern: str) -> str | None:
        match = re.search(pattern, text or "")
        return match.group(1).strip() if match and match.groups() else match.group(0).strip() if match else None
