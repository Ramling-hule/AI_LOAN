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
_api_keys_count = 1






chat_rate_limiter  = GlobalRateLimiter(rpm=25)   
embed_rate_limiter = GlobalRateLimiter(rpm=1000) 

class GeminiLLMProvider(LLMProvider):
    def __init__(self):
        all_keys = [k.strip() for k in settings.GEMINI_API_KEY.split(",") if k.strip()]
        if not all_keys:
            raise ValueError("No GEMINI_API_KEY provided.")

        n = len(all_keys)

        
        
        self.embed_keys = all_keys
        self.chat_keys  = all_keys

        
        self.api_keys = all_keys

        self._embed_idx = 0
        self._chat_idx  = 0
        self._embed_lock = asyncio.Lock()
        self._chat_lock  = asyncio.Lock()
        self._rotation_lock = asyncio.Lock()

        genai.configure(api_key=self.embed_keys[0])
        logger.info(
            f"Gemini configured: {n} key(s) total — "
            f"{len(self.embed_keys)} embed key(s), {len(self.chat_keys)} chat key(s). "
            f"Model: {settings.GEMINI_MODEL}, Embed: {settings.GEMINI_EMBEDDING_MODEL}"
        )

    def _next_embed_key(self) -> str:
        key = self.embed_keys[self._embed_idx % len(self.embed_keys)]
        self._embed_idx = (self._embed_idx + 1) % len(self.embed_keys)
        return key

    def _next_chat_key(self) -> str:
        key = self.chat_keys[self._chat_idx % len(self.chat_keys)]
        self._chat_idx = (self._chat_idx + 1) % len(self.chat_keys)
        return key

    async def rotate_key(self):
        """Legacy compat — no-op when using pool-based assignment."""
        return len(self.api_keys) > 1

    async def _auto_quota_retry(self, func, initial_key, *args, is_background: bool = False, **kwargs):
        """
        Attempt the call; on 429 rotate within the pool that owns initial_key.
        If all pool keys are exhausted:
          - is_background=True  → wait and retry (OCR/embed pipeline)
          - is_background=False → fail fast (UI requests)
        """
        
        pool = self.embed_keys if initial_key in self.embed_keys else self.chat_keys

        max_quota_retries = max(len(pool) * 4, 10)
        try:
            current_idx = pool.index(initial_key)
        except ValueError:
            current_idx = 0

        initial_idx = current_idx
        keys_exhausted_count = 0

        for attempt in range(max_quota_retries):
            current_key = pool[current_idx]
            try:
                
                
                genai.configure(api_key=current_key)
                return await func(*args, **kwargs)
            except Exception as e:
                err_str = str(e)
                is_quota = "429" in err_str or "Quota" in err_str or "ResourceExhausted" in err_str

                if is_quota:
                    next_idx = (current_idx + 1) % len(pool)
                    all_exhausted = (next_idx == initial_idx)

                    if all_exhausted:
                        keys_exhausted_count += 1
                        match = re.search(r"retry in (\d+\.?\d*)s", err_str)
                        wait_seconds = float(match.group(1)) + 2.0 if match else 30.0

                        if is_background:
                            wait_capped = min(wait_seconds, 120.0)
                            logger.warning(
                                f"[Quota] All {len(pool)} pool key(s) rate limited. "
                                f"Background — waiting {wait_capped:.0f}s (exhaustion #{keys_exhausted_count})."
                            )
                            await asyncio.sleep(wait_capped)
                            current_idx = initial_idx
                            continue
                        else:
                            logger.warning(f"[Quota] All {len(pool)} pool key(s) rate limited. Failing fast for UI.")
                            raise Exception(
                                "API Quota Exceeded: The AI provider rate limit was hit. Please wait a moment and try again."
                            )
                    else:
                        logger.warning(f"[Quota] Pool key #{current_idx} rate limited — rotating to #{next_idx}.")
                        current_idx = next_idx
                    continue

                raise e  

        raise Exception("Max quota retries exceeded")

    @retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=2, min=4, max=60), reraise=True)
    async def embed(self, text: str, use_last_key: bool = False, is_background: bool = False) -> list[float]:
        truncated = text[:30000]
        await embed_rate_limiter.acquire()
        
        target_key = self._next_embed_key()
        response = await self._auto_quota_retry(
            genai.embed_content_async,
            target_key,
            is_background=is_background,
            model=f"models/{settings.GEMINI_EMBEDDING_MODEL}",
            content=truncated,
            task_type="retrieval_document",
            output_dimensionality=768
        )
        return response['embedding']

    async def embed_batch(self, texts: list[str], use_last_key: bool = False, is_background: bool = False) -> list[list[float]]:
        """Batch embed. Round-robins across the dedicated embed pool. Falls back to individual embeds on error."""
        truncated_texts = [t[:30000] for t in texts]
        await embed_rate_limiter.acquire()
        
        target_key = self._next_embed_key()
        try:
            response = await self._auto_quota_retry(
                genai.embed_content_async,
                target_key,
                is_background=is_background,
                model=f"models/{settings.GEMINI_EMBEDDING_MODEL}",
                content=truncated_texts,
                task_type="retrieval_document",
                output_dimensionality=768
            )
            return response['embedding']
        except Exception as e:
            logger.warning(f"[Embed Batch] Batch failed, falling back to individual embeds: {e}")
            results = []
            for t in truncated_texts:
                emb = await self.embed(t, use_last_key=use_last_key, is_background=is_background)
                results.append(emb)
            return results

    @retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=2, min=5, max=60), reraise=True)
    async def chat(self, messages: list[dict], temperature: float = 0.1, max_tokens: int = 4096, response_format: str = "json_object", model: str | None = None, is_background: bool = False) -> str:
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
        
        if not contents:
            contents.append({"role": "user", "parts": ["Analyze and provide the response according to the instruction."] })
        
        if response_format == "json_object":
            strict_json_prompt = "\n\nCRITICAL: Return ONLY a valid JSON object. Do not wrap the response in ```json markdown code blocks. Do not include any conversational text."
            if system_instruction:
                system_instruction += strict_json_prompt
            else:
                system_instruction = strict_json_prompt

        gen_model = genai.GenerativeModel(model_name=model_name, system_instruction=system_instruction)
        generation_config = genai.types.GenerationConfig(temperature=temperature, max_output_tokens=max_tokens)

        from google.generativeai.types import HarmCategory, HarmBlockThreshold
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }

        await chat_rate_limiter.acquire()
        
        chat_key = self._next_chat_key()
        response = await self._auto_quota_retry(
            gen_model.generate_content_async,
            chat_key,
            is_background=is_background,
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
            logger.info("Google Gemini API connectivity verified")
            return True
        except Exception as e:
            logger.error(f"Google Gemini API connectivity failed: {e}")
            return False
