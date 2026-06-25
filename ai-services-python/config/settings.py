"""
Python AI Services — Configuration
Pydantic BaseSettings: validates all env vars at startup.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── App ─────────────────────────────────────────────────────
    APP_NAME: str = "AI Loan Underwriting — Python AI Service"
    APP_VERSION: str = "2.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = 5001
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ── PostgreSQL ───────────────────────────────────────────────
    DATABASE_URL: str
    DB_POOL_MIN_SIZE: int = 5
    DB_POOL_MAX_SIZE: int = 20

    # ── Google Gemini ────────────────────────────────────────────
    GEMINI_API_KEY: str
    GEMINI_MODEL: str = "gemini-1.5-pro"
    GEMINI_EMBEDDING_MODEL: str = "text-embedding-004"

    # ── LLM Inference Settings ────────────────────────────────────────────────
    EXTRACTION_TEMPERATURE: float = 0.1
    UNDERWRITING_TEMPERATURE: float = 0.1
    EXTRACTION_TOP_K: int = 15
    LLM_MAX_TOKENS: int = 4096

    # ── Multi-Agent Extraction Pipeline ──────────────────────────────────────
    # Model for cheap, fast domain-specific agents (6 parallel calls)
    GEMINI_FLASH_MODEL: str = "gemini-2.5-flash"
    # Candidates retrieved per domain before re-ranking
    EXTRACTION_TOP_K_CANDIDATE: int = 40
    # Final chunks per domain passed to each agent after re-ranking
    EXTRACTION_TOP_K_FINAL: int = 10
    # Cross-encoder model for re-ranking (HuggingFace model name)
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    # Set False to disable re-ranking and skip model download
    RERANKER_ENABLED: bool = True
    # Run a Gemini Pro verification pass after agent merge
    ENABLE_VERIFICATION_AGENT: bool = True
    # Second-pass targeted retrieval for null fields
    ENABLE_SECOND_PASS: bool = True

    # ── OCR Settings ──────────────────────────────────────────────
    OCR_LANGUAGE: str = "en"
    OCR_USE_GPU: bool = False          # Set True if GPU is available
    OCR_MAX_QUEUE_SIZE: int = 50
    ENABLE_IMAGE_ENHANCEMENT: bool = True
    PDF_DPI: int = 200                 # DPI for PDF → image conversion

    # ── Backend Callback URL ──────────────────────────────────────
    BACKEND_URL: str = "http://localhost:5000"
    BACKEND_CALLBACK_SECRET: str = "change-me-in-production"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
