"""
Metrics logger for RAG-based retrieval interactions.

Provides a single, reusable `log_retrieval_metric()` function that writes
a structured JSONL record to a date-partitioned file under `metrics/<channel>/`.
This is intentionally I/O-only (no async, no DB, no external deps) so that
metric emission never stalls the hot path and a failure never propagates upward.

Channels:
  - "semantic_evaluations"  – SemanticRuleEngine per-rule LLM calls
  - "loan_chat"             – /chat/loan/{application_id}
  - "policy_chat"           – /chat/policy/{bank_id}
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any

from loguru import logger

METRICS_BASE = "metrics"


def log_retrieval_metric(
    channel: str,
    *,
    session_id: str,           # application_id / bank_id / rule context
    query: str,                # The user query or rule description used for retrieval
    k_value: int,              # How many chunks were requested (top-K)
    retrieved_chunks: list[dict],  # Raw chunk objects returned by retriever
    prompt: str | None = None, # Full prompt sent to the LLM (optional)
    llm_raw_response: str | None = None,   # Verbatim string returned by the LLM
    parsed_result: Any = None,  # Parsed/structured output, if applicable
    extra: dict | None = None,  # Any caller-specific extra fields
) -> None:
    """
    Append one JSONL record to `metrics/<channel>/evals_YYYY-MM-DD.jsonl`.
    Never raises — errors are logged and swallowed so callers are unaffected.
    """
    dir_path = os.path.join(METRICS_BASE, channel)
    try:
        os.makedirs(dir_path, exist_ok=True)
    except Exception as e:
        logger.error(f"[Metrics] Cannot create metrics dir '{dir_path}': {e}")
        return

    date_str = datetime.now().strftime("%Y-%m-%d")
    # Using .log instead of .jsonl since we are pretty-printing multi-line JSON
    filepath = os.path.join(dir_path, f"evals_{date_str}.log")

    record: dict[str, Any] = {
        "timestamp": datetime.now().isoformat(),
        "channel": channel,
        "session_id": session_id,
        "query": query,
        "k_value": k_value,
        "num_chunks_returned": len(retrieved_chunks),
        "retrieved_chunks": [
            {
                "document_name": c.get("document_name"),
                "document_type": c.get("document_type"),
                "page_number": c.get("page_number"),
                "score": round(c.get("score", 0.0), 4),
                "rerank_score": round(c.get("rerank_score", 0.0), 4),
                "text": c.get("text", "").strip(),
            }
            for c in retrieved_chunks
        ],
        "prompt": prompt,
        "llm_raw_response": llm_raw_response,
        "parsed_result": parsed_result,
        **(extra or {}),
    }

    try:
        with open(filepath, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, default=str, indent=2) + "\n\n")
    except Exception as e:
        logger.error(f"[Metrics] Failed to write record to '{filepath}': {e}")
