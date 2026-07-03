import asyncio
from loguru import logger
from sentence_transformers import CrossEncoder
from config.settings import get_settings

settings = get_settings()


class RerankerService:
    def __init__(self):
        self.model = None
        self.is_enabled = settings.RERANKER_ENABLED
        self._load_lock = asyncio.Lock()

    async def _get_model(self):
        # Fast path: already loaded, or disabled — no lock needed.
        if self.model or not self.is_enabled:
            return self.model

        # Loading a CrossEncoder is slow (disk + CPU/GPU init) and blocking.
        # Running it via asyncio.to_thread keeps the event loop free for
        # every other in-flight request while it loads. The lock prevents
        # two concurrent callers from both triggering a load on first use.
        async with self._load_lock:
            if self.model or not self.is_enabled:
                return self.model
            try:
                logger.info(f"Loading CrossEncoder re-ranker model: {settings.RERANKER_MODEL}")
                self.model = await asyncio.to_thread(CrossEncoder, settings.RERANKER_MODEL)
            except Exception as e:
                logger.error(f"Failed to load CrossEncoder model: {e}")
                self.is_enabled = False
        return self.model

    async def rerank_chunks(self, query: str, chunks: list[dict], top_k: int = 3) -> list[dict]:
        """
        Re-rank a list of chunks against the query using a CrossEncoder.
        Chunks should be a list of dicts containing a 'text' field.
        Returns the top_k chunks sorted by ML score.

        Runs model inference in a worker thread — CrossEncoder.predict() is
        a synchronous, CPU/GPU-bound call. Calling it directly from an async
        function would block the entire event loop for its duration, stalling
        every other concurrent request in the process.
        """
        if not chunks:
            return []

        model = await self._get_model()
        if not model:
            # Fallback if model failed to load or disabled
            return chunks[:top_k]

        # Prepare sentence pairs for CrossEncoder (Query, Context)
        pairs = [[query, chunk["text"]] for chunk in chunks]

        try:
            scores = await asyncio.to_thread(model.predict, pairs)
            # Add ML score to chunks and sort descending
            for i, chunk in enumerate(chunks):
                chunk["rerank_score"] = float(scores[i])

            reranked = sorted(chunks, key=lambda x: x.get("rerank_score", -999.0), reverse=True)
            return reranked[:top_k]
        except Exception as e:
            logger.error(f"CrossEncoder prediction failed: {e}")
            # Fallback to original pgvector sorting
            return chunks[:top_k]


reranker_service = RerankerService()