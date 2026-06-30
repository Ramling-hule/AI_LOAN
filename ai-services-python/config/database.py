"""
PostgreSQL async connection pool using asyncpg.
Database connections.
"""
import json
import asyncpg
from loguru import logger
from config.settings import get_settings

settings = get_settings()

_pool: asyncpg.Pool | None = None


async def init_db() -> None:
    """Initialize the asyncpg connection pool and verify pgvector extension."""
    global _pool

    async def init_connection(conn):
        
        await conn.set_type_codec(
            "vector",
            encoder=_encode_vector,
            decoder=_decode_vector,
            schema="public",
            format="text",
        )
        
        await conn.set_type_codec(
            "json",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
            format="text",
        )
        await conn.set_type_codec(
            "jsonb",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
            format="text",
        )

    _pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL,
        min_size=settings.DB_POOL_MIN_SIZE,
        max_size=settings.DB_POOL_MAX_SIZE,
        command_timeout=60,
        init=init_connection,
    )
    
    async with _pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        await conn.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS loan_processing_jobs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                loan_id VARCHAR NOT NULL,
                priority INT DEFAULT 1,
                status VARCHAR DEFAULT 'pending',
                task_type VARCHAR NOT NULL,
                payload JSONB NOT NULL,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS query_embedding_cache (
                key VARCHAR PRIMARY KEY,
                query_text TEXT NOT NULL,
                embedding vector(768) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        await _ensure_rag_indexes(conn)
    logger.info(f"✅  PostgreSQL connected (asyncpg pool, min={settings.DB_POOL_MIN_SIZE}, max={settings.DB_POOL_MAX_SIZE})")


async def close_db() -> None:
    """Gracefully close the connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("🛑  PostgreSQL connection pool closed")


def get_pool() -> asyncpg.Pool:
    """Return the active connection pool. Raises if not initialized."""
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db() first.")
    return _pool


async def execute(sql: str, *args) -> str:
    """Execute a write query."""
    pool = get_pool()
    return await pool.execute(sql, *args)


async def fetch(sql: str, *args) -> list[asyncpg.Record]:
    """Execute a read query returning all rows."""
    pool = get_pool()
    return await pool.fetch(sql, *args)


async def fetchrow(sql: str, *args) -> asyncpg.Record | None:
    """Execute a read query returning a single row."""
    pool = get_pool()
    return await pool.fetchrow(sql, *args)


async def fetchval(sql: str, *args):
    """Execute a query returning a single scalar value."""
    pool = get_pool()
    return await pool.fetchval(sql, *args)


async def executemany(sql: str, args_list: list[tuple]) -> None:
    """Execute the same statement for many argument tuples in one round-trip."""
    if not args_list:
        return
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(sql, args_list)


async def _ensure_rag_indexes(conn: asyncpg.Connection) -> None:
    """Create btree / HNSW / GIN indexes for document_embeddings if the table exists."""
    table_exists = await conn.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'document_embeddings'
        )
        """
    )
    if not table_exists:
        logger.warning("document_embeddings table not found — skipping RAG index creation")
        return

    await conn.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    index_statements = [
        """
        CREATE INDEX IF NOT EXISTS idx_doc_emb_application_id
            ON document_embeddings (application_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_doc_emb_app_doctype
            ON document_embeddings (application_id, document_type)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_doc_emb_source_document
            ON document_embeddings (source_document)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_doc_emb_vector_hnsw
            ON document_embeddings
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_doc_emb_chunk_text_trgm
            ON document_embeddings USING gin (chunk_text gin_trgm_ops)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_doc_emb_structured_facts
            ON document_embeddings USING gin ((metadata->'structured_facts'))
        """,
    ]

    for stmt in index_statements:
        try:
            await conn.execute(stmt)
        except Exception as e:
            logger.warning(f"RAG index creation skipped ({e.__class__.__name__}): {e}")

    logger.info("✅  RAG indexes ensured on document_embeddings")




def _encode_vector(value) -> str:
    """Encode a list/ndarray to pgvector text format '[x,y,z,...]'."""
    if hasattr(value, "tolist"):
        value = value.tolist()
    return "[" + ",".join(str(v) for v in value) + "]"


def _decode_vector(value: str) -> list[float]:
    """Decode pgvector text '[x,y,z,...]' to a Python list of floats."""
    return [float(x) for x in value.strip("[]").split(",")]
