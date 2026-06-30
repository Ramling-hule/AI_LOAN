"""
pgvector service.
All vector insert/query/delete operations go through PostgreSQL.
"""
import json
from loguru import logger
from config.database import fetch, execute, fetchrow, fetchval, executemany
from config.settings import get_settings

settings = get_settings()

_INSERT_CHUNK_SQL = """
INSERT INTO document_embeddings
  (id, application_id, source_document, document_type, document_name,
   chunk_index, page_number, chunk_text, embedding, metadata)
VALUES
  (uuid_generate_v4(), $1, $2, $3::doc_type, $4, $5, $6, $7, $8, $9::jsonb)
"""


def map_doc_type(dt: str) -> str:
    if not dt:
        return "general"
    dt = dt.lower()
    mapping = {
        "identity_document": "id_document",
        "financial_statement": "balance_sheets",
        "bank_statement": "bank_statements",
        "account_statement": "bank_statements",
        "tax_return": "itr",
        "balance_sheet": "balance_sheets",
        "loan_document": "loan_documents",
        "sanction_letter": "loan_documents",
        "promoter": "id_document",
        "director": "id_document",
        "appraisal": "general",
        "valuation": "general",
        "property_report": "general",
    }
    valid = {
        'loan_application', 'bank_policy', 'invoice', 'id_document', 'general',
        'pan', 'aadhaar', 'gst_certificate', 'bank_statements', 'itr',
        'balance_sheets', 'profit_loss', 'loan_documents'
    }
    mapped = mapping.get(dt, dt)
    return mapped if mapped in valid else "general"


def _chunk_to_row(chunk: dict) -> tuple:
    return (
        chunk["application_id"],
        chunk["source_document"],
        map_doc_type(chunk.get("document_type", "general")),
        chunk.get("document_name", ""),
        chunk.get("chunk_index", 0),
        chunk.get("page_number"),
        chunk["chunk_text"],
        chunk["embedding"],
        json.dumps(chunk.get("metadata", {})),
    )


async def insert_document_chunks(chunks: list[dict]) -> int:
    """Bulk-insert chunks without deleting existing rows (for incremental batch saves)."""
    if not chunks:
        return 0

    await executemany(_INSERT_CHUNK_SQL, [_chunk_to_row(chunk) for chunk in chunks])
    logger.info(
        f"[pgvector] Inserted {len(chunks)} chunks for source: {chunks[0]['source_document']}"
    )
    return len(chunks)


async def upsert_document_chunks(chunks: list[dict]) -> int:
    """
    Replace all chunks for a source_document with the provided set.
    Idempotent: deletes existing chunks for the source_document first.

    Each chunk dict must have:
        application_id, source_document, document_type, document_name,
        chunk_index, page_number, chunk_text, embedding (list[float]), metadata (dict)

    Returns the number of chunks inserted.
    """
    if not chunks:
        return 0

    source_doc = chunks[0]["source_document"]
    deleted = await delete_chunks_by_source(source_doc)
    if deleted:
        logger.info(f"[pgvector] Removed {deleted} old chunks for source: {source_doc}")

    return await insert_document_chunks(chunks)


async def query_similar_chunks(
    query_embedding: list[float],
    application_id: str,
    limit: int = 15,
    document_types: list[str] | None = None,
) -> list[dict]:
    """
    Retrieve the most semantically similar chunks for a given query vector.
    Uses cosine distance (<=>) for ranking. Filtered to the specific application,
    with optional document-type narrowing for domain retrieval.

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
          AND ($4::text[] IS NULL OR document_type::text = ANY($4::text[]))
        ORDER BY embedding <=> $1::vector
        LIMIT $3
        """,
        query_embedding,
        application_id,
        limit,
        document_types,
    )

    return [_row_to_chunk(row, retrieval_source="vector") for row in rows]


async def query_keyword_chunks(
    application_id: str,
    keywords: list[str],
    limit: int = 15,
    document_types: list[str] | None = None,
) -> list[dict]:
    """
    Retrieve chunks by exact/keyword evidence in chunk_text.
    This complements vectors for IDs, labels, dates, and financial terms.
    """
    patterns = [f"%{kw.strip()}%" for kw in keywords if kw and kw.strip()]
    if not patterns:
        return []

    rows = await fetch(
        """
        SELECT
            chunk_text,
            document_name,
            document_type,
            page_number,
            metadata,
            0.72 + LEAST(
                0.20,
                0.02 * (
                    SELECT COUNT(*)
                    FROM unnest($3::text[]) AS kw(pattern)
                    WHERE chunk_text ILIKE kw.pattern
                )
            ) AS score
        FROM document_embeddings
        WHERE application_id = $1
          AND ($2::text[] IS NULL OR document_type::text = ANY($2::text[]))
          AND EXISTS (
              SELECT 1
              FROM unnest($3::text[]) AS kw(pattern)
              WHERE chunk_text ILIKE kw.pattern
          )
        ORDER BY
          (
              SELECT COUNT(*)
              FROM unnest($3::text[]) AS kw(pattern)
              WHERE chunk_text ILIKE kw.pattern
          ) DESC,
          page_number NULLS LAST
        LIMIT $4
        """,
        application_id,
        document_types,
        patterns,
        limit,
    )

    return [_row_to_chunk(row, retrieval_source="keyword") for row in rows]


async def query_structured_fact_chunks(
    application_id: str,
    fact_keys: list[str],
    limit: int = 15,
    document_types: list[str] | None = None,
) -> list[dict]:
    """
    Retrieve chunks whose metadata contains document-aware structured facts.
    Facts are stored under metadata.structured_facts during chunking.
    """
    keys = [key.strip() for key in fact_keys if key and key.strip()]
    if not keys:
        return []

    rows = await fetch(
        """
        SELECT
            chunk_text,
            document_name,
            document_type,
            page_number,
            metadata,
            0.82 + LEAST(
                0.15,
                0.03 * (
                    SELECT COUNT(*)
                    FROM unnest($3::text[]) AS fact_key(key)
                    WHERE COALESCE(metadata->'structured_facts', '{}'::jsonb) ? fact_key.key
                )
            ) AS score
        FROM document_embeddings
        WHERE application_id = $1
          AND ($2::text[] IS NULL OR document_type::text = ANY($2::text[]))
          AND EXISTS (
              SELECT 1
              FROM unnest($3::text[]) AS fact_key(key)
              WHERE COALESCE(metadata->'structured_facts', '{}'::jsonb) ? fact_key.key
          )
        ORDER BY
          (
              SELECT COUNT(*)
              FROM unnest($3::text[]) AS fact_key(key)
              WHERE COALESCE(metadata->'structured_facts', '{}'::jsonb) ? fact_key.key
          ) DESC,
          page_number NULLS LAST
        LIMIT $4
        """,
        application_id,
        document_types,
        keys,
        limit,
    )

    return [_row_to_chunk(row, retrieval_source="structured_fact") for row in rows]


def _row_to_chunk(row, retrieval_source: str) -> dict:
    metadata = (
        row["metadata"]
        if isinstance(row["metadata"], dict)
        else json.loads(row["metadata"])
        if isinstance(row["metadata"], str)
        else {}
    )
    return {
        "text": row["chunk_text"],
        "score": float(row["score"]),
        "metadata": metadata,
        "document_name": row["document_name"],
        "document_type": row["document_type"],
        "page_number": row["page_number"],
        "retrieval_source": retrieval_source,
    }


async def delete_chunks_by_source(source_document_id: str) -> int:
    """
    Delete all chunks for a source document.
    """
    result = await execute(
        "DELETE FROM document_embeddings WHERE source_document = $1",
        source_document_id,
    )
    
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
