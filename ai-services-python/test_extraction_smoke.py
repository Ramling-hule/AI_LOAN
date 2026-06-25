"""Smoke test for all utility modules (no LLM or DB required)."""
import sys
sys.path.insert(0, '.')

from services.extraction.types import ExtractedField, ALL_FIELDS, REQUIRED_FIELDS
print("OK: types")

from services.extraction.normalizer import normalize_chunk, parse_indian_amount, normalize_chunks
print("OK: normalizer")

from services.extraction.regex_extractor import extract_identity_fields, extract_from_chunks, to_known_values_hint
print("OK: regex_extractor")

from services.extraction.confidence import compute_confidence, get_doc_priority, DOCUMENT_PRIORITY
print("OK: confidence")

# --- ExtractedField ---
ef = ExtractedField(value="27AABCU9603R1ZX", confidence=0.99, source="regex")
assert ef.is_present(), "is_present should be True"
rec = ef.to_confidence_record()
assert rec["score"] == 0.99 and rec["source"] == "regex"
print(f"  ExtractedField.to_confidence_record OK: {rec}")

# --- Normalizer ---
assert normalize_chunk("Annual Turnover: Rs. 2.3 Crore") == "Annual Turnover: 23000000", \
    f"Got: {normalize_chunk('Annual Turnover: Rs. 2.3 Crore')}"
assert normalize_chunk("Balance: INR 12.5 Lakh") == "Balance: 1250000", \
    f"Got: {normalize_chunk('Balance: INR 12.5 Lakh')}"
assert normalize_chunk("Amount: 1,20,000") == "Amount: 120000", \
    f"Got: {normalize_chunk('Amount: 1,20,000')}"
print("  normalize_chunk: ALL PASS")

assert parse_indian_amount("2.3 Crore") == 23000000.0
assert parse_indian_amount("12.5 Lakh") == 1250000.0
assert parse_indian_amount("1,50,000") == 150000.0
assert parse_indian_amount("500 Thousand") == 500000.0
print("  parse_indian_amount: ALL PASS")

# --- Regex extractor ---
# Use separate GSTIN and PAN (PAN must NOT be a substring of the GSTIN)
text = "GSTIN: 27AABCU9603R1ZX\nPAN Card No: ABCDE1234F\nCIN L17110MH1973PLC019786"
matches = extract_identity_fields(text)
print(f"  GSTIN: {matches['gstin'].value if matches['gstin'] else None}")
print(f"  PAN:   {matches['pan'].value if matches['pan'] else None}")
print(f"  CIN:   {matches['cin'].value if matches['cin'] else None}")
assert matches["gstin"] and matches["gstin"].value == "27AABCU9603R1ZX", f"Got: {matches['gstin']}"
assert matches["pan"] and matches["pan"].value == "ABCDE1234F", f"Got: {matches['pan']}"
assert matches["cin"] and matches["cin"].value == "L17110MH1973PLC019786", f"Got: {matches['cin']}"
print("  regex_extractor: ALL PASS")

# LLPIN
llpin_text = "LLP ID: AAA-1234 registered under MCA"
llpin_matches = extract_identity_fields(llpin_text)
assert llpin_matches["llpin"] and llpin_matches["llpin"].value == "AAA-1234"
print("  LLPIN regex: PASS")

hint = to_known_values_hint(matches)
assert "27AABCU9603R1ZX" in hint
print("  to_known_values_hint: PASS")

# --- Confidence scoring ---
score_high = compute_confidence(
    retrieval_score=0.85, rerank_score=2.5, regex_validated=True,
    document_type="gst_certificate", llm_confidence=0.92
)
score_low = compute_confidence(
    retrieval_score=0.3, rerank_score=-1.0, regex_validated=False,
    document_type="handwritten", llm_confidence=0.4
)
assert 0.7 < score_high < 1.0, f"High score out of range: {score_high}"
assert score_low < score_high, f"Low score not lower: {score_low} vs {score_high}"
print(f"  compute_confidence high={score_high:.4f}, low={score_low:.4f}: PASS")

# Document priority
assert get_doc_priority("audited_balance_sheet") == 1.0
assert get_doc_priority("handwritten") == 0.40
assert get_doc_priority("unknown_type") == 0.55  # default
print("  get_doc_priority: PASS")

# --- Types consistency ---
assert "gstin" in ALL_FIELDS
assert "annual_turnover" in REQUIRED_FIELDS
assert len(ALL_FIELDS) == 12
print(f"  ALL_FIELDS={len(ALL_FIELDS)}, REQUIRED_FIELDS={len(REQUIRED_FIELDS)}: PASS")

print()
print("=" * 50)
print("=== ALL UTILITY MODULE TESTS PASS ===")
print("=" * 50)
