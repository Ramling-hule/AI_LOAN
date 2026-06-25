from typing import Protocol

class LLMProvider(Protocol):
    async def embed(self, text: str) -> list[float]:
        """Generate an embedding vector for a text string."""
        ...

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts in a single API call."""
        ...

    async def chat(self, messages: list[dict], temperature: float = 0.1, max_tokens: int = 4096, response_format: str = "json_object", model: str | None = None) -> str:
        """Call LLM for chat completion."""
        ...

    async def ping(self) -> bool:
        """Health check."""
        ...
