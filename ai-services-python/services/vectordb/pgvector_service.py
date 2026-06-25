"""
pgvector service.
All vector insert/query/delete operations go through PostgreSQL.
"""
import uuid
import json
from loguru import logger
from config.database import fetch, execute, fetchrow, fetchval
from config.settings import get_settings

settings = get_settings()


async def upsert_document_chunks(chunks: list[dict]) -> int:
    """
    Insert document embedding chunks into the document_embeddings table.
    Idempotent: deletes existing chunks for the source_document first.

    Each chunk dict must have:
        application_id, source_document, document_type, document_name,
        chunk_index, page_number, chunk_text, embedding (list[float]), metadata (dict)

    Returns the number of chunks inserted.
    """
    if not chunks:
        return 0

    source_doc = chunks[0]["source_document"]
    # Delete old chunks for this source document (idempotent upsert)
    deleted = await delete_chunks_by_source(source_doc)
    if deleted:
        logger.info(f"[pgvector] Removed {deleted} old chunks for source: {source_doc}")

    for chunk in chunks:
        await execute(
            """
            INSERT INTO document_embeddings
              (id, application_id, source_document, document_type, document_name,
               chunk_index, page_number, chunk_text, embedding, metadata)
            VALUES
              (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
            """,
            chunk["application_id"],
            chunk["source_document"],
            chunk.get("document_type", "general"),
            chunk.get("document_name", ""),
            chunk.get("chunk_index", 0),
            chunk.get("page_number"),
            chunk["chunk_text"],
            chunk["embedding"],
            json.dumps(chunk.get("metadata", {})),
        )

    logger.info(f"[pgvector] Inserted {len(chunks)} chunks for source: {source_doc}")
    return len(chunks)


async def query_similar_chunks(
    query_embedding: list[float],
    application_id: str,
    limit: int = 15,
) -> list[dict]:
    """
    Retrieve the most semantically similar chunks for a given query vector.
    Uses cosine distance (<=>) for ranking. Filtered to the specific application.

    """
    rows = await fetch(
        """
        SELECT
            chunk_text,
            document_name,
            document_type,
            page_number,
            metadata,
            1 - (embedding <=> $1::vector) AS score
        FROM document_embeddings
        WHERE application_id = $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3
        """,
        query_embedding,
        application_id,
        limit,
    )

    return [
        {
            "text": row["chunk_text"],
            "score": float(row["score"]),
            "metadata": row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"]) if isinstance(row["metadata"], str) else {},
            "document_name": row["document_name"],
            "document_type": row["document_type"],
            "page_number": row["page_number"],
        }
        for row in rows
    ]


async def delete_chunks_by_source(source_document_id: str) -> int:
    """
    Delete all chunks for a source document.
    """
    result = await execute(
        "DELETE FROM document_embeddings WHERE source_document = $1",
        source_document_id,
    )
    # result is like "DELETE 15" — extract the count
    count = int(result.split()[-1]) if result else 0
    return count


async def get_chunk_count(source_document_id: str) -> int:
    """Count chunks for a source document."""
    count = await fetchval(
        "SELECT COUNT(*) FROM document_embeddings WHERE source_document = $1",
        source_document_id,
    )
    return int(count or 0)


async def is_document_vectorized(source_document_id: str) -> bool:
    """Check if any embeddings exist for a source doc."""
    return await get_chunk_count(source_document_id) > 0


async def get_embedding_stats() -> dict:
    """Get collection-level stats."""
    row = await fetchrow(
        "SELECT COUNT(*) AS total_chunks, COUNT(DISTINCT application_id) AS total_applications FROM document_embeddings"
    )
    return {
        "total_chunks": int(row["total_chunks"] or 0),
        "total_applications": int(row["total_applications"] or 0),
    }
