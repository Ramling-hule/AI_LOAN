"""
PostgreSQL async connection pool using asyncpg.
Database connections.
"""
import json
import asyncpg
from loguru import logger
from contextlib import asynccontextmanager
from contextvars import ContextVar
from config.settings import get_settings

settings = get_settings()

_current_conn: ContextVar[asyncpg.Connection | None] = ContextVar("_current_conn", default=None)


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
        max_inactive_connection_lifetime=300, # Cycle idle connections to avoid silent drops by firewalls/PgBouncer
        server_settings={"statement_timeout": "60000"},
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
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS policy_rules (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                rule_id VARCHAR NOT NULL UNIQUE,
                bank_id VARCHAR,
                policy_version VARCHAR,
                parameter VARCHAR,
                description TEXT,
                category VARCHAR,
                policy_section VARCHAR,
                policy_page INT,
                related_chunk_ids TEXT[],
                priority VARCHAR,
                rule_type VARCHAR NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                needs_review BOOLEAN NOT NULL DEFAULT FALSE,
                raw_extraction_id TEXT
            );
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS policy_extraction_audit (
              id SERIAL PRIMARY KEY,
              extraction_id TEXT NOT NULL,
              bank_id TEXT NOT NULL,
              policy_version TEXT NOT NULL,
              chunk_index INT NOT NULL,
              raw_response TEXT,
              rule_count INT NOT NULL,
              success BOOLEAN NOT NULL,
              created_at TIMESTAMPTZ NOT NULL
            );
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS underwriting_audit_logs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                applicant_id VARCHAR,
                application_id VARCHAR NOT NULL,
                policy_version VARCHAR,
                decision VARCHAR NOT NULL,
                risk_score INT,
                confidence FLOAT,
                rule_evaluations JSONB NOT NULL,
                prompt_version VARCHAR,
                model_version VARCHAR,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS rule_relationships (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                bank_id VARCHAR NOT NULL,
                policy_version VARCHAR NOT NULL,
                source_rule_id VARCHAR NOT NULL,
                target_rule_id VARCHAR NOT NULL,
                relationship_type VARCHAR NOT NULL, -- parent_rule, child_rule, depends_on, exception_of, related_to
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


@asynccontextmanager
async def transaction():
    """Provides a transactional scope for database operations using a ContextVar."""
    conn = _current_conn.get()
    if conn is not None:
        # Already in a transaction block
        yield conn
        return

    pool = get_pool()
    async with pool.acquire() as new_conn:
        token = _current_conn.set(new_conn)
        try:
            async with new_conn.transaction():
                yield new_conn
        finally:
            _current_conn.reset(token)


async def execute(sql: str, *args) -> str:
    """Execute a write query."""
    conn = _current_conn.get()
    if conn:
        return await conn.execute(sql, *args)
    return await get_pool().execute(sql, *args)


async def fetch(sql: str, *args) -> list[asyncpg.Record]:
    """Execute a read query returning all rows."""
    conn = _current_conn.get()
    if conn:
        return await conn.fetch(sql, *args)
    return await get_pool().fetch(sql, *args)


async def fetchrow(sql: str, *args) -> asyncpg.Record | None:
    """Execute a read query returning a single row."""
    conn = _current_conn.get()
    if conn:
        return await conn.fetchrow(sql, *args)
    return await get_pool().fetchrow(sql, *args)


async def fetchval(sql: str, *args):
    """Execute a query returning a single scalar value."""
    conn = _current_conn.get()
    if conn:
        return await conn.fetchval(sql, *args)
    return await get_pool().fetchval(sql, *args)


async def executemany(sql: str, args_list: list[tuple]) -> None:
    """Execute the same statement for many argument tuples in one round-trip."""
    if not args_list:
        return
    conn = _current_conn.get()
    if conn:
        await conn.executemany(sql, args_list)
    else:
        async with get_pool().acquire() as c:
            await c.executemany(sql, args_list)


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
