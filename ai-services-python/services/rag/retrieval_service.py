from loguru import logger
from config.database import execute, fetch
from services.llm.llm_facade import embed as llm_embed
from services.vectordb.pgvector_service import query_similar_chunks

UNDERWRITING_QUESTIONS = {
    "annual_revenue": {
        "text": "What is the annual revenue, turnover, or gross receipts?",
        "document_types": ["balance_sheets", "profit_loss", "itr", "gst_certificate"]
    },
    "gst_turnover": {
        "text": "What is the GST turnover, sales, or outward supplies?",
        "document_types": ["gst_certificate", "itr"]
    },
    "business_age": {
        "text": "What is the date of incorporation, business age, or vintage?",
        "document_types": ["id_document", "itr", "general"]
    },
    "cash_flow": {
        "text": "What is the average monthly balance, cash flow, or banking transactions?",
        "document_types": ["bank_statements"]
    },
    "existing_loans": {
        "text": "What are the existing loans, EMIs, credit facilities, or debt obligations?",
        "document_types": ["loan_documents", "bank_statements", "balance_sheets"]
    },
    "policy_compliance": {
        "text": "What are the rules, eligibility criteria, policies, or guidelines for loan approval?",
        "document_types": ["bank_policy"]
    }
}


class RetrievalService:
    def __init__(self):
        # NOTE: previously this held its own `GeminiLLMProvider()` and called
        # `.embed()` directly, which bypassed llm_facade entirely — meaning
        # these embedding calls were NOT covered by the shared rate limiter.
        # Routing through llm_facade.embed() fixes that and avoids a second,
        # redundant provider instance.
        self._cache_initialized = False

    async def initialize_cache(self):
        """Ensure all underwriting questions have embeddings cached in DB."""
        if self._cache_initialized:
            return

        logger.info("[RetrievalService] Initializing query embedding cache...")

        rows = await fetch("SELECT key FROM query_embedding_cache")
        existing_keys = {row["key"] for row in rows}

        for key, q_data in UNDERWRITING_QUESTIONS.items():
            if key not in existing_keys:
                logger.info(f"[RetrievalService] Generating embedding for question '{key}'")
                emb = await llm_embed(q_data["text"])
                await execute(
                    """
                    INSERT INTO query_embedding_cache (key, query_text, embedding)
                    VALUES ($1, $2, $3::vector)
                    ON CONFLICT (key) DO NOTHING
                    """,
                    key, q_data["text"], emb
                )
        self._cache_initialized = True

    async def get_cached_embedding(self, key: str) -> list[float] | None:
        """Fetch embedding from cache table."""
        await self.initialize_cache()
        row = await fetch("SELECT embedding::text FROM query_embedding_cache WHERE key = $1", key)
        if row:
            raw = row[0]["embedding"].strip("[]")
            return [float(x) for x in raw.split(",")]
        return None

    async def batch_retrieve(self, application_id: str, bank_name: str) -> str:
        """
        Retrieves evidence for all underwriting questions, deduplicates them,
        merges contiguous chunks, and returns a compressed context string.
        """
        await self.initialize_cache()
        all_hits = []

        for key, q_data in UNDERWRITING_QUESTIONS.items():
            emb = await self.get_cached_embedding(key)
            if not emb:
                continue

            search_app_id = application_id
            if key == "policy_compliance":
                search_app_id = f"BANK_{bank_name}"

            hits = await query_similar_chunks(
                query_embedding=emb,
                application_id=search_app_id,
                limit=5,
                document_types=q_data["document_types"]
            )
            all_hits.extend(hits)

        if not all_hits:
            return "No relevant document evidence found."

        unique_chunks = {}
        for h in all_hits:
            doc_name = h["document_name"]
            page = h.get("page_number") or 1
            idx = h["metadata"].get("chunk_index", 0)
            uid = f"{doc_name}_{page}_{idx}"
            if uid not in unique_chunks:
                unique_chunks[uid] = h

        sorted_chunks = sorted(
            unique_chunks.values(),
            key=lambda x: (
                x["document_name"],
                x.get("page_number", 1),
                x["metadata"].get("chunk_index", 0)
            )
        )

        compressed_chunks = []
        if sorted_chunks:
            current_group = [sorted_chunks[0]]

            for i in range(1, len(sorted_chunks)):
                prev = current_group[-1]
                curr = sorted_chunks[i]

                same_doc = curr["document_name"] == prev["document_name"]
                same_page = curr.get("page_number") == prev.get("page_number")
                prev_idx = prev["metadata"].get("chunk_index", 0)
                curr_idx = curr["metadata"].get("chunk_index", 0)

                if same_doc and same_page and curr_idx == prev_idx + 1:
                    current_group.append(curr)
                else:
                    compressed_chunks.append(self._merge_group(current_group))
                    current_group = [curr]

            compressed_chunks.append(self._merge_group(current_group))

        context_text = "\n\n---\n\n".join(
            f"[Evidence Source: {c['document_name']} | Type: {c['document_type']}]\n{c['text']}"
            for c in compressed_chunks
        )

        return context_text

    def _merge_group(self, group: list[dict]) -> dict:
        """Merges a group of contiguous chunks into one."""
        if len(group) == 1:
            return group[0]

        merged_text = "\n".join([c["text"] for c in group])
        base_chunk = group[0].copy()
        base_chunk["text"] = merged_text
        return base_chunk


retrieval_service = RetrievalService()