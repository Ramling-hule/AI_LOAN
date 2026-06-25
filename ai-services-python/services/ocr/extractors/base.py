from typing import Protocol
from dataclasses import dataclass, field

@dataclass
class PageResult:
    page_number: int
    text: str = ""
    confidence: float = 0.0
    word_count: int = 0
    char_count: int = 0
    processing_time_ms: int = 0

@dataclass
class DocumentResult:
    raw_text: str = ""
    tables: list[dict] = field(default_factory=list)
    page_results: list[PageResult] = field(default_factory=list)
    confidence_score: float = 0.0
    word_count: int = 0
    char_count: int = 0
    language_detected: str = "en"
    pdf_type: str = "unknown"
    page_count: int = 0
    processing_time_ms: int = 0

class DocumentExtractor(Protocol):
    async def extract(self, file_bytes: bytes, filename: str) -> DocumentResult:
        """Extract text and metadata from document."""
        ...
