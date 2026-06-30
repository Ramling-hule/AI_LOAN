"""
Composite confidence scoring for extracted financial parameters.

Replaces the binary regex pass/fail scoring with a 5-factor product:

    confidence = retrieval_score
               × rerank_factor
               × regex_factor
               × doc_priority
               × llm_confidence

Each factor is normalised to [0, 1] before multiplication.
The final score is clamped to [0, 1].
"""
from __future__ import annotations

import math
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .types import ExtractedField

from loguru import logger



DOCUMENT_PRIORITY: dict[str, float] = {
    
    "audited_balance_sheet":     1.00,
    "audited_financials":        1.00,
    "itr":                       0.95,
    "income_tax_return":         0.95,
    "gst_certificate":           0.92,
    "gst_return":                0.90,
    "bank_statement":            0.85,
    "loan_statement":            0.82,
    "loan_sanction_letter":      0.80,
    "provisional_balance_sheet": 0.75,
    "ca_certificate":            0.72,
    "cin_certificate":           0.90,
    "pan_card":                  0.90,
    "llp_deed":                  0.88,
    
    "ocr_scan":                  0.60,
    "scanned_document":          0.60,
    "handwritten":               0.40,
    "general":                   0.55,
    "unknown":                   0.50,
}

_DEFAULT_DOC_PRIORITY = 0.55   


def get_doc_priority(document_type: Optional[str]) -> float:
    """Return the document priority weight for a given document_type string."""
    if not document_type:
        return _DEFAULT_DOC_PRIORITY
    key = document_type.lower().strip().replace(" ", "_").replace("-", "_")
    return DOCUMENT_PRIORITY.get(key, _DEFAULT_DOC_PRIORITY)




def _normalise_rerank_score(raw_score: float) -> float:
    """
    Normalise a CrossEncoder logit score to [0, 1] using sigmoid.
    CrossEncoder/ms-marco returns raw logits, typically in [-10, 10].
    """
    try:
        return 1.0 / (1.0 + math.exp(-raw_score))
    except OverflowError:
        return 0.0 if raw_score < 0 else 1.0




def compute_confidence(
    retrieval_score: float = 0.0,    
    rerank_score: float = 0.0,       
    regex_validated: bool = False,   
    document_type: Optional[str] = None,
    llm_confidence: float = 0.7,     
) -> float:
    """
    Compute the composite confidence for an extracted field.

    Args:
        retrieval_score:  Cosine similarity score from pgvector [0, 1].
        rerank_score:     Raw CrossEncoder score (logit, unbounded).
        regex_validated:  Whether a regex pattern confirmed the value.
        document_type:    Source document type string.
        llm_confidence:   The LLM's self-reported confidence [0, 1].

    Returns:
        Composite confidence score in [0.0, 1.0].
    """
    
    f_retrieval = max(0.0, min(1.0, retrieval_score))

    
    f_rerank = _normalise_rerank_score(rerank_score)

    
    f_regex = 1.0 if regex_validated else 0.80

    
    f_doc = get_doc_priority(document_type)

    
    f_llm = max(0.0, min(1.0, llm_confidence))

    
    
    weighted_log = (
        0.20 * math.log(max(f_retrieval, 1e-9))
        + 0.25 * math.log(max(f_rerank, 1e-9))
        + 0.20 * math.log(max(f_regex, 1e-9))
        + 0.15 * math.log(max(f_doc, 1e-9))
        + 0.20 * math.log(max(f_llm, 1e-9))
    )
    composite = math.exp(weighted_log)
    return round(max(0.0, min(1.0, composite)), 4)


def score_extracted_field(
    field: "ExtractedField",  
    regex_validated: bool = False,
) -> float:
    """
    Convenience wrapper: compute confidence directly from an ExtractedField.
    """
    return compute_confidence(
        retrieval_score=field.retrieval_score,
        rerank_score=field.rerank_score,
        regex_validated=regex_validated or field.source == "regex",
        document_type=field.document_type,
        llm_confidence=field.confidence,  
    )
