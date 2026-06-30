"""
Cross-encoder re-ranker for the multi-agent extraction pipeline.

Takes a domain's top-K candidate chunks (from embedding similarity) and
re-ranks them using a cross-encoder model (sentence-transformers) which
jointly encodes the query and each passage — far more accurate than
cosine similarity alone.

Architecture:
  Embedding retrieval  →  top-40 candidates
  CrossEncoder.predict →  top-10 final chunks passed to each agent

The model is lazy-loaded on first use and gracefully falls back to
cosine-score ordering if sentence-transformers is not installed or
RERANKER_ENABLED=False.
"""
from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Optional

from loguru import logger
import threading

from config.settings import get_settings

settings = get_settings()



_model_lock = threading.Lock()

@lru_cache(maxsize=1)
def _load_cross_encoder():
    """
    Load the CrossEncoder model once, cache it for the process lifetime.
    Returns None if sentence-transformers is not installed.
    """
    with _model_lock:
        try:
            from sentence_transformers import CrossEncoder  
            model_name = settings.RERANKER_MODEL
            logger.info(f"[Reranker] Loading CrossEncoder: {model_name}")
            model = CrossEncoder(model_name, max_length=512)
            logger.info(f"[Reranker] CrossEncoder ready: {model_name}")
            return model
        except ImportError:
            logger.warning(
                "[Reranker] sentence-transformers not installed — "
                "falling back to cosine-score ordering. "
                "Run: pip install sentence-transformers"
            )
            return None
        except Exception as e:
            logger.error(f"[Reranker] Failed to load CrossEncoder: {e} — using cosine fallback")
            return None




def _rerank_sync(
    query: str,
    chunks: list[dict],
    top_k: int,
) -> list[dict]:
    """
    Synchronous re-rank. Called inside a thread-pool executor to avoid
    blocking the event loop during CrossEncoder inference.
    """
    model = _load_cross_encoder()

    if model is None or not settings.RERANKER_ENABLED:
        
        for chunk in chunks:
            chunk["rerank_score"] = chunk.get("score", 0.0)
        return chunks[:top_k]

    
    pairs = [(query, c.get("text", "")) for c in chunks]

    try:
        scores: list[float] = model.predict(pairs).tolist()
    except Exception as e:
        logger.error(f"[Reranker] CrossEncoder.predict failed: {e} — using cosine fallback")
        for chunk in chunks:
            chunk["rerank_score"] = chunk.get("score", 0.0)
        return chunks[:top_k]

    
    for chunk, score in zip(chunks, scores):
        chunk["rerank_score"] = float(score)

    ranked = sorted(chunks, key=lambda c: c["rerank_score"], reverse=True)
    return ranked[:top_k]


async def rerank(
    query: str,
    chunks: list[dict],
    top_k: Optional[int] = None,
) -> list[dict]:
    """
    Async wrapper: re-rank *chunks* for *query*, return top-*top_k*.

    Args:
        query:  The domain representative query string used for ranking.
        chunks: Candidate chunks (dicts with at least 'text' and 'score').
        top_k:  Number of chunks to return. Defaults to EXTRACTION_TOP_K_FINAL.

    Returns:
        Sorted list of up to top_k chunk dicts, each with 'rerank_score' added.
    """
    top_k = top_k or settings.EXTRACTION_TOP_K_FINAL

    if not chunks:
        return []

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,  
        _rerank_sync,
        query,
        list(chunks),  
        top_k,
    )
    return result


async def rerank_all_domains(
    domain_chunks: dict[str, list[dict]],
    top_k: Optional[int] = None,
) -> dict[str, list[dict]]:
    """
    Re-rank all domains concurrently.

    Args:
        domain_chunks: Output of retriever.retrieve_all_domains()
        top_k:         Final chunk count per domain after re-ranking.

    Returns:
        Same structure as input, but each domain's list is pruned to top_k
        and sorted by rerank_score descending.
    """
    from services.extraction.retriever import DOMAIN_QUERIES

    top_k = top_k or settings.EXTRACTION_TOP_K_FINAL

    
    domain_representative_queries = {
        domain: queries[0]
        for domain, queries in DOMAIN_QUERIES.items()
    }

    tasks = {
        domain: rerank(
            query=domain_representative_queries.get(domain, domain),
            chunks=chunks,
            top_k=top_k,
        )
        for domain, chunks in domain_chunks.items()
    }

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    reranked: dict[str, list[dict]] = {}

    for domain, result in zip(tasks.keys(), results):
        if isinstance(result, Exception):
            logger.error(f"[Reranker] Re-ranking failed for domain={domain}: {result}")
            
            reranked[domain] = domain_chunks.get(domain, [])[:top_k]
        else:
            reranked[domain] = result
            if result:
                logger.info(
                    f"[Reranker] domain={domain:12s} -> {len(result):2d} chunks "
                    f"(rerank: {result[0]['rerank_score']:.3f}–{result[-1]['rerank_score']:.3f})"
                )

    return reranked
