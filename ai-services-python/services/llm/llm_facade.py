"""
Facade for the LLM Provider to maintain backward compatibility.
Now delegates to the new SOLID architecture (GeminiLLMProvider).

Rate limiting lives HERE, not in individual services. Every caller —
OCR embedding, policy extraction, underwriting decisions, retrieval query
embeddings — goes through these four functions, so this is the one place
that needs to enforce the shared quota (e.g. Gemini free tier: 15 req/min).
Callers should NOT also call gemini_limiter.acquire() themselves; doing so
double-throttles (each logical call would consume two slots).
"""
from .providers.gemini import GeminiLLMProvider
from services.llm.rate_limiter import gemini_limiter

_provider = GeminiLLMProvider()


async def embed(text: str, use_last_key: bool = False, is_background: bool = False) -> list[float]:
    """Generate an embedding vector for a text string."""
    await gemini_limiter.acquire()
    return await _provider.embed(text, use_last_key, is_background=is_background)


async def embed_batch(texts: list[str], use_last_key: bool = False, is_background: bool = False) -> list[list[float]]:
    """Embed multiple texts in a single API call."""
    await gemini_limiter.acquire()
    return await _provider.embed_batch(texts, use_last_key, is_background=is_background)


async def chat(
    messages: list[dict],
    temperature: float = 0.1,
    max_tokens: int = 4096,
    response_format: str = "json_object",
    model: str | None = None,
    is_background: bool = False,
) -> str:
    """Call the configured LLM for chat completion."""
    await gemini_limiter.acquire()
    return await _provider.chat(messages, temperature, max_tokens, response_format, model, is_background=is_background)


async def ping() -> bool:
    """Health check — test if LLM API is reachable. Does not consume a quota
    slot from the shared limiter; a health check shouldn't be able to starve
    real traffic."""
    return await _provider.ping()