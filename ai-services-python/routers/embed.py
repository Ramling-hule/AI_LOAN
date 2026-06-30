from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger
from services.llm.providers.gemini import GeminiLLMProvider

router = APIRouter(prefix="/api/v1", tags=["Embeddings"])

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    embedding: list[float]

@router.post("/embed")
async def embed_text(req: EmbedRequest):
    """Generate an embedding for the provided text."""
    try:
        llm = GeminiLLMProvider()
        embedding = await llm.embed(req.text)
        return {"embedding": embedding}
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
