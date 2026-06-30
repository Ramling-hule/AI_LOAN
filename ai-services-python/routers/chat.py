from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger
from services.llm.providers.gemini import GeminiLLMProvider, RateLimitError
from services.vectordb.pgvector_service import query_similar_chunks
import google.generativeai as genai
from config.settings import get_settings

router = APIRouter(prefix="/api/v1/chat", tags=["Chat"])
settings = get_settings()
llm = GeminiLLMProvider()

class ChatRequest(BaseModel):
    query: str

@router.post("/loan/{application_id}")
async def chat_with_loan_documents(application_id: str, body: ChatRequest):
    try:
        query_vector = await llm.embed(body.query)
        chunks = await query_similar_chunks(query_vector, application_id, limit=8)
        
        if not chunks:
            return {"success": True, "answer": "No extracted documents found for this loan application.", "sources": []}

        context_text = "\n\n".join([f"Document: {c['document_name']} (Page {c['page_number']})\n{c['text']}" for c in chunks])
        
        prompt = f"""You are a strict AI underwriting assistant answering an administrator's questions about a loan application.
Use ONLY the provided context below to answer the question. If the answer is not contained in the context, state explicitly that you cannot find the answer in the provided documents. Do not invent or assume information.

Context:
{context_text}

Question: {body.query}
"""
        
        messages = [{"role": "user", "content": prompt}]
        response_text = await llm.chat(messages, response_format="text")        
        
        sources = list(set([c['document_name'] for c in chunks if c['document_name']]))
        
        return {"success": True, "answer": response_text, "sources": sources}
    except RateLimitError as e:
        logger.warning(f"[Chat Router] Rate limit hit for {application_id}: retry_after={e.retry_after}")
        raise HTTPException(status_code=429, detail={"message": "AI Engine is processing too many requests. Please wait.", "retry_after": e.retry_after})
    except Exception as e:
        logger.error(f"[Chat Router] Chat failed for {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
