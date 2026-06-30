"""
FastAPI Application — Main Entry Point
Replaces the Node.js ai-services/src/app.js + server.js.

Startup sequence:
  1. Initialize PostgreSQL connection pool (asyncpg)
  2. Verify Azure OpenAI connectivity
  3. Start OCR worker queue
  4. Mount all routers

Shutdown sequence:
  1. Stop OCR worker
  2. Close PostgreSQL pool
"""
import sys
from contextlib import asynccontextmanager
from loguru import logger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import get_settings
from config.database import init_db, close_db
from services.llm.llm_facade import ping as ping_llm
from services.ocr.ocr_queue import start_worker, stop_worker
from services.processing_queue import processing_queue
from routers import ocr, extraction, underwriting, chat, queue, embed

settings = get_settings()


logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> — <level>{message}</level>",
    level=settings.LOG_LEVEL,
    colorize=True,
)
logger.add(
    "logs/ai_service_{time:YYYY-MM-DD}.log",
    rotation="1 day",
    retention="14 days",
    level="DEBUG",
    compression="gz",
)



@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info(f"🚀  Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info("=" * 60)

    
    try:
        await init_db()
    except Exception as e:
        logger.critical(f"❌  PostgreSQL initialization failed: {e}")
        raise

    
    llm_ok = await ping_llm()
    if not llm_ok:
        logger.warning("⚠️  Google Gemini API is unreachable — LLM features will fail until connectivity is restored.")

    
    await start_worker()

    
    await processing_queue.start()

    logger.info("✅  All services initialized. AI Service is ready.")
    yield

    
    logger.info("🛑  Shutting down...")
    await processing_queue.stop()
    await stop_worker()
    await close_db()
    logger.info("🛑  Shutdown complete.")



app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered document processing, parameter extraction, and underwriting for SME loan applications.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.BACKEND_URL, "http://localhost:5000", "http://localhost:3000"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "x-internal-secret"],
)


app.include_router(ocr.router)
app.include_router(extraction.router)
app.include_router(underwriting.router)
app.include_router(chat.router)
app.include_router(queue.router)
app.include_router(embed.router)



@app.get("/", tags=["Health"])
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "stack": {
            "ocr": "PaddleOCR v4 + unstructured",
            "llm": f"Google Gemini {settings.GEMINI_MODEL}",
            "embeddings": f"Google Gemini {settings.GEMINI_EMBEDDING_MODEL} (768-dim)",
            "vector_store": "PostgreSQL pgvector",
            "database": "PostgreSQL (asyncpg)",
        },
    }


@app.get("/health", tags=["Health"])
async def health():
    from config.database import fetchval
    from services.vectordb.pgvector_service import get_embedding_stats

    db_ok = False
    try:
        val = await fetchval("SELECT 1")
        db_ok = val == 1
    except Exception:
        pass

    stats = await get_embedding_stats()

    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "vector_store": {
            "type": "pgvector",
            "total_chunks": stats["total_chunks"],
            "total_applications": stats["total_applications"],
        },
    }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=1,  
        log_level=settings.LOG_LEVEL.lower(),
    )
