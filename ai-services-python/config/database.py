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
        # Ensure pgvector sends/receives vectors as text lists
        await conn.set_type_codec(
            "vector",
            encoder=_encode_vector,
            decoder=_decode_vector,
            schema="public",
            format="text",
        )
        # Register JSON/JSONB codecs
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
    # Ensure extensions exist on startup
    async with _pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        await conn.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";")
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


# ── pgvector Type Codecs ───────────────────────────────────────────────────────

def _encode_vector(value) -> str:
    """Encode a list/ndarray to pgvector text format '[x,y,z,...]'."""
    if hasattr(value, "tolist"):
        value = value.tolist()
    return "[" + ",".join(str(v) for v in value) + "]"


def _decode_vector(value: str) -> list[float]:
    """Decode pgvector text '[x,y,z,...]' to a Python list of floats."""
    return [float(x) for x in value.strip("[]").split(",")]
