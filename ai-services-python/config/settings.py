"""
Python AI Services — Configuration
Pydantic BaseSettings: validates all env vars at startup.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    
    APP_NAME: str = "AI Loan Underwriting — Python AI Service"
    APP_VERSION: str = "2.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = 5001
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    
    DATABASE_URL: str
    DB_POOL_MIN_SIZE: int = 5
    DB_POOL_MAX_SIZE: int = 20

    
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-1.5-pro"
    GEMINI_EMBEDDING_MODEL: str = "text-embedding-004"

    
    OPENAI_SECRET_KEY: str
    OPENAI_CHAT_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    
    EXTRACTION_TEMPERATURE: float = 0.1
    UNDERWRITING_TEMPERATURE: float = 0.1
    EXTRACTION_TOP_K: int = 15
    LLM_MAX_TOKENS: int = 4096
    ENABLE_PARALLEL_EXECUTION: bool = False

    
    
    GEMINI_FLASH_MODEL: str = "gemini-2.5-flash"
    
    EXTRACTION_TOP_K_CANDIDATE: int = 40
    
    EXTRACTION_TOP_K_FINAL: int = 10
    
    EXTRACTION_CONTEXT_MAX_CHARS: int = 24000
    
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    
    RERANKER_ENABLED: bool = True
    
    ENABLE_VERIFICATION_AGENT: bool = True
    
    ENABLE_SECOND_PASS: bool = True

    
    OCR_LANGUAGE: str = "en"
    OCR_USE_GPU: bool = False          
    OCR_MAX_QUEUE_SIZE: int = 50
    ENABLE_IMAGE_ENHANCEMENT: bool = True
    PDF_DPI: int = 200                 

    
    BACKEND_URL: str = "http://localhost:5000"
    BACKEND_CALLBACK_SECRET: str = "change-me-in-production"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
