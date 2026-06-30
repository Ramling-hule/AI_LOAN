"""
Facade for the LLM Provider to maintain backward compatibility.
Now delegates to the new SOLID architecture (GeminiLLMProvider).
"""
from .providers.gemini import GeminiLLMProvider


_provider = GeminiLLMProvider()

async def embed(text: str, use_last_key: bool = False, is_background: bool = False) -> list[float]:
    """Generate an embedding vector for a text string."""
    return await _provider.embed(text, use_last_key, is_background=is_background)

async def embed_batch(texts: list[str], use_last_key: bool = False, is_background: bool = False) -> list[list[float]]:
    """Embed multiple texts in a single API call."""
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
    return await _provider.chat(messages, temperature, max_tokens, response_format, model, is_background=is_background)

async def ping() -> bool:
    """Health check — test if LLM API is reachable."""
    return await _provider.ping()
