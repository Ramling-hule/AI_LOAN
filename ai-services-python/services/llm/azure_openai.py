"""
Facade for the LLM Provider to maintain backward compatibility.
Now delegates to the new SOLID architecture (GeminiLLMProvider).
"""
from .providers.gemini import GeminiLLMProvider

# Instantiate the singleton provider
_provider = GeminiLLMProvider()

async def embed(text: str) -> list[float]:
    """Generate an embedding vector for a text string."""
    return await _provider.embed(text)

async def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts in a single API call."""
    return await _provider.embed_batch(texts)

async def chat(
    messages: list[dict],
    temperature: float = 0.1,
    max_tokens: int = 4096,
    response_format: str = "json_object",
    model: str | None = None,
) -> str:
    """Call the configured LLM for chat completion."""
    return await _provider.chat(messages, temperature, max_tokens, response_format, model)

async def ping() -> bool:
    """Health check — test if LLM API is reachable."""
    return await _provider.ping()
