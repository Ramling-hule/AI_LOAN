import json
import asyncio
from loguru import logger
import openai
from openai import AsyncOpenAI
import time

from config.settings import get_settings
from .base import LLMProvider

settings = get_settings()

class RateLimitError(Exception):
    def __init__(self, retry_after: float):
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after}s")


class OpenAILLMProvider(LLMProvider):
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_SECRET_KEY)
        self.chat_model = settings.OPENAI_CHAT_MODEL
        self.embedding_model = settings.OPENAI_EMBEDDING_MODEL

    async def ping(self) -> bool:
        """Health check for OpenAI."""
        try:
            
            await self.client.embeddings.create(
                input="ping",
                model=self.embedding_model
            )
            logger.info("✅ OpenAI API connectivity verified")
            return True
        except Exception as e:
            logger.error(f"❌ OpenAI API connectivity failed: {e}")
            return False

    async def _auto_quota_retry(self, func, *args, **kwargs):
        max_retries = 5
        base_delay = 5.0
        
        for attempt in range(max_retries):
            try:
                return await func(*args, **kwargs)
            except openai.RateLimitError as e:
                wait_seconds = base_delay * (2 ** attempt)
                if wait_seconds > 60:
                    raise RateLimitError(retry_after=wait_seconds)
                logger.warning(f"[OpenAI Auto-Retry] Rate limit hit. Waiting {wait_seconds:.1f}s before attempt {attempt+2}...")
                await asyncio.sleep(wait_seconds)
                continue
            except openai.APIError as e:
                
                logger.warning(f"[OpenAI API Error] {e}. Retrying...")
                await asyncio.sleep(base_delay)
                continue
        raise Exception("Max quota retries exceeded for OpenAI")

    async def embed(self, text: str, use_last_key: bool = False) -> list[float]:
        """Generate an embedding vector for a single string."""
        async def _run():
            response = await self.client.embeddings.create(
                input=text.replace("\n", " "),
                model=self.embedding_model
            )
            return response.data[0].embedding
            
        return await self._auto_quota_retry(_run)

    async def embed_batch(self, texts: list[str], use_last_key: bool = False) -> list[list[float]]:
        """Embed multiple texts in a single API call."""
        if not texts:
            return []
            
        
        cleaned_texts = [t.replace("\n", " ") for t in texts]
        
        async def _run():
            response = await self.client.embeddings.create(
                input=cleaned_texts,
                model=self.embedding_model
            )
            
            return [data.embedding for data in response.data]
            
        return await self._auto_quota_retry(_run)

    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 4096,
        response_format: str = "json_object",
        model: str | None = None,
    ) -> str:
        """Call OpenAI for chat completion."""
        
        
        
        async def _run():
            completion_kwargs = {
                "model": model or self.chat_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if response_format == "json_object":
                completion_kwargs["response_format"] = {"type": "json_object"}
                
            start = time.time()
            response = await self.client.chat.completions.create(**completion_kwargs)
            latency = time.time() - start
            
            content = response.choices[0].message.content
            logger.debug(f"[OpenAI] chat completed in {latency:.2f}s, output tokens: {response.usage.completion_tokens}")
            return content

        return await self._auto_quota_retry(_run)
