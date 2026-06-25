import re
import asyncio
import json
from json_repair import repair_json
import google.generativeai as genai
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from .base import LLMProvider
from ..utils.rate_limiter import GlobalRateLimiter
from config.settings import get_settings

class RateLimitError(Exception):
    def __init__(self, retry_after: float, message: str = "Rate limit exceeded"):
        self.retry_after = retry_after
        self.message = message
        super().__init__(self.message)

settings = get_settings()
chat_rate_limiter = GlobalRateLimiter(rpm=14)

async def _auto_quota_retry(func, *args, **kwargs):
    max_quota_retries = 5
    for attempt in range(max_quota_retries):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Quota" in err_str or "ResourceExhausted" in err_str:
                match = re.search(r"retry in (\d+\.?\d*)s", err_str)
                wait_seconds = float(match.group(1)) + 1.0 if match else 30.0
                
                # If it's a long wait, abort and tell the client to back off
                if wait_seconds > 10.0:
                    logger.warning(f"[Quota Auto-Retry] Wait time ({wait_seconds}s) is too long. Raising RateLimitError.")
                    raise RateLimitError(retry_after=wait_seconds)

                logger.warning(f"[Quota Auto-Retry] Rate limit hit. Waiting {wait_seconds:.1f}s before attempt {attempt+2}...")
                await asyncio.sleep(wait_seconds)
                continue
            raise e
    raise Exception("Max quota retries exceeded")

class GeminiLLMProvider(LLMProvider):
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        logger.info(f"✅ Google Gemini client configured. Model: {settings.GEMINI_MODEL}, Embed: {settings.GEMINI_EMBEDDING_MODEL}")

    @retry(stop=stop_after_attempt(10), wait=wait_exponential(multiplier=2, min=5, max=65), retry=retry_if_exception_type(Exception), reraise=True)
    async def embed(self, text: str) -> list[float]:
        truncated = text[:30000]
        response = await _auto_quota_retry(
            genai.embed_content_async,
            model=f"models/{settings.GEMINI_EMBEDDING_MODEL}",
            content=truncated,
            task_type="retrieval_document",
            output_dimensionality=768
        )
        return response['embedding']

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        truncated_texts = [t[:30000] for t in texts]
        response = await _auto_quota_retry(
            genai.embed_content_async,
            model=f"models/{settings.GEMINI_EMBEDDING_MODEL}",
            content=truncated_texts,
            task_type="retrieval_document",
            output_dimensionality=768
        )
        return response['embedding']

    @retry(stop=stop_after_attempt(10), wait=wait_exponential(multiplier=2, min=5, max=65), retry=retry_if_exception_type(Exception), reraise=True)
    async def chat(self, messages: list[dict], temperature: float = 0.1, max_tokens: int = 4096, response_format: str = "json_object", model: str | None = None) -> str:
        system_instruction = None
        contents = []

        for msg in messages:
            role = msg.get("role")
            content = msg.get("content", "")
            if role == "system":
                system_instruction = content
            elif role == "user":
                contents.append({"role": "user", "parts": [content]})
            elif role in ("assistant", "model"):
                contents.append({"role": "model", "parts": [content]})

        model_name = model or settings.GEMINI_MODEL
        gen_model = genai.GenerativeModel(model_name=model_name, system_instruction=system_instruction)

        generation_config = genai.types.GenerationConfig(temperature=temperature, max_output_tokens=max_tokens)
        if response_format == "json_object":
            generation_config.response_mime_type = "application/json"

        from google.generativeai.types import HarmCategory, HarmBlockThreshold
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }

        await chat_rate_limiter.acquire()
        
        response = await _auto_quota_retry(
            gen_model.generate_content_async,
            contents=contents,
            generation_config=generation_config,
            safety_settings=safety_settings
        )

        text = response.text or ""
        
        if response_format == "json_object":
            try:
                clean_text = text.strip()
                if clean_text.startswith("```json"):
                    clean_text = clean_text[7:-3].strip()
                elif clean_text.startswith("```"):
                    clean_text = clean_text[3:-3].strip()
                
                try:
                    json.loads(clean_text)
                    return clean_text
                except json.JSONDecodeError as e:
                    logger.warning(f"[GeminiLLMProvider] Native JSON parse failed. Using json_repair... Error: {e}")
                    repaired_str = repair_json(clean_text)
                    json.loads(repaired_str)
                    return repaired_str
            except Exception as e:
                logger.error(f"[GeminiLLMProvider] json_repair failed. Forcing retry... Error: {e}\nRaw: {text}")
                raise Exception(f"Invalid JSON returned from Gemini: {e}")
                
        return text

    async def ping(self) -> bool:
        try:
            await self.embed("health check")
            logger.info("✅ Google Gemini API connectivity verified")
            return True
        except Exception as e:
            logger.error(f"❌ Google Gemini API connectivity failed: {e}")
            return False
