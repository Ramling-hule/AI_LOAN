import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from loguru import logger

from services.llm.providers.gemini import RateLimitError
from services.llm.llm_facade import embed, chat as llm_chat
from services.vectordb.pgvector_service import query_similar_chunks, retrieve_and_rerank
from services.metrics.retrieval_logger import log_retrieval_metric

router = APIRouter(prefix="/api/v1/chat", tags=["Chat"])

DEFAULT_TOP_K = 8

_SYSTEM_PROMPT_BASE = """You are a highly strict, production-grade AI Banking & Underwriting Assistant.
Your primary directive is to answer the user's question EXCLUSIVELY using the provided context.

CRITICAL RULES:
1. STRICT GROUNDING: Never use external knowledge, prior training data, or assumptions.
2. NO INFERENCE: Do not infer or guess missing information. If a fact is not in the context, it does not exist.
3. REFERENCED VS. EXPLICIT: If the context mentions that a checklist, appendix, table, or external document exists (e.g., "See Annexure A for required documents") but DOES NOT explicitly include its actual contents, you MUST treat the contents as NOT FOUND.
4. LIST-TYPE QUESTIONS: For questions asking for lists (documents, criteria, steps, ratios), every requested item must be explicitly detailed in the context.
5. PARTIAL SUFFICIENCY: If the context provides some relevant information but not the complete answer, explain exactly what was found, explain what is missing, and set `found_in_context` to false.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object. No markdown formatting (like ```json), no preamble, no trailing text.
Schema:
{{
  "reasoning": "<Step-by-step evaluation of the context against the rules>",
  "answer": "<Your final answer to the user>",
  "found_in_context": <true if fully answered by explicit context, false if missing or only partially answered>
}}"""

_FEW_SHOT_EXAMPLES = """
--- Example 1: Referenced but missing information ---
Context: "The bank has adopted a standardized application form along with a checklist of required documents."
Question: "Which documents are required to apply for the loan? List them."
Response:
{{
  "reasoning": "The user asked for a list of required documents. The context mentions that a checklist exists but does not explicitly provide the contents of the checklist.",
  "answer": "I could not find the actual list of required documents. The retrieved context only mentions that a checklist exists, but the checklist itself is not included.",
  "found_in_context": false
}}

--- Example 2: Partial Information ---
Context: "The minimum DSCR required is 1.25. The policy does not specify the maximum Debt-to-Equity ratio."
Question: "What are the DSCR and Debt-to-Equity ratio requirements?"
Response:
{{
  "reasoning": "The user asked for two ratios. The context provides the DSCR (1.25) but explicitly states the Debt-to-Equity ratio is not specified.",
  "answer": "The context specifies that the minimum DSCR required is 1.25. However, it does not contain information regarding the Debt-to-Equity ratio requirement.",
  "found_in_context": false
}}

--- Example 3: Explicit and Complete Information ---
Context: "Eligible borrowers for the SME scheme include Sole Proprietorships, Partnerships, and Private Limited Companies with a vintage of at least 3 years."
Question: "Who is eligible to borrow under the SME scheme?"
Response:
{{
  "reasoning": "The user asked for eligible borrowers. The context explicitly lists Sole Proprietorships, Partnerships, and Private Limited Companies with a 3-year vintage.",
  "answer": "Under the SME scheme, eligible borrowers include Sole Proprietorships, Partnerships, and Private Limited Companies that have a business vintage of at least 3 years.",
  "found_in_context": true
}}
"""

LOAN_CHAT_PROMPT = _SYSTEM_PROMPT_BASE + """

You are answering an administrator's questions about a specific loan application.
""" + _FEW_SHOT_EXAMPLES + """
Context:
{context}

Question: {question}
"""

POLICY_CHAT_PROMPT = _SYSTEM_PROMPT_BASE + """

You are answering questions about the bank's credit underwriting policies. Do not include inline citations or document references in your text, as sources will be attached separately.
""" + _FEW_SHOT_EXAMPLES + """
Context:
{context}

Question: {question}
"""


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, strip_whitespace=True)


class ChatResponse(BaseModel):
    success: bool
    answer: str
    sources: list[str]


def _format_context(chunks: list[dict]) -> str:
    return "\n\n".join(
        f"Document: {c['document_name']} (Page {c.get('page_number') or 'N/A'})\n{c['text']}"
        for c in chunks
    )


def _unique_sources(values: list[Optional[str]]) -> list[str]:
    """Dedupe while preserving retrieval order (unlike list(set(...)))."""
    return list(dict.fromkeys(v for v in values if v))


def _parse_structured_answer(raw_response: str) -> tuple[str, bool]:
    text = raw_response.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        parsed = json.loads(text)
        answer = str(parsed.get("answer", "")).strip()
        found = bool(parsed.get("found_in_context", False))
        if answer:
            return answer, found
    except (json.JSONDecodeError, AttributeError, TypeError):
        pass

    logger.warning("Model did not return valid structured JSON; hiding sources as a fallback.")
    return raw_response, False


async def _run_chat(
    *,
    router_label: str,
    session_id: str,
    query: str,
    chunks: list[dict],
    prompt_template: str,
    empty_message: str,
    source_formatter,
    extra: Optional[dict] = None,
) -> ChatResponse:
    if not chunks:
        return ChatResponse(success=True, answer=empty_message, sources=[])

    prompt = prompt_template.format(context=_format_context(chunks), question=query)
    messages = [{"role": "user", "content": prompt}]

    try:
        response_text = await llm_chat(messages, response_format="json_object")
    except RateLimitError as e:
        logger.warning(f"[{router_label}] Rate limit hit for {session_id}: retry_after={e.retry_after}")
        raise HTTPException(
            status_code=429,
            detail={"message": "AI Engine is processing too many requests. Please wait.", "retry_after": e.retry_after},
        ) from e

    answer, found_in_context = _parse_structured_answer(response_text)

    log_retrieval_metric(
        router_label,
        session_id=session_id,
        query=query,
        k_value=DEFAULT_TOP_K,
        retrieved_chunks=chunks,
        prompt=prompt,
        llm_raw_response=response_text,
        parsed_result={"answer": answer, "found_in_context": found_in_context},
        extra=extra,
    )

    sources = _unique_sources(source_formatter(c) for c in chunks) if found_in_context else []
    
    if found_in_context and answer:
        cited_sources = [s for s in sources if s in answer]
        sources = cited_sources if cited_sources else sources
    
    return ChatResponse(success=True, answer=answer, sources=sources)


@router.post("/loan/{application_id}", response_model=ChatResponse)
async def chat_with_loan_documents(application_id: str, body: ChatRequest) -> ChatResponse:
    """Answer an administrator's question using a specific loan application's extracted documents."""
    try:
        query_vector = await embed(body.query)
        chunks = await query_similar_chunks(query_vector, application_id, limit=DEFAULT_TOP_K)

        return await _run_chat(
            router_label="loan_chat",
            session_id=application_id,
            query=body.query,
            chunks=chunks,
            prompt_template=LOAN_CHAT_PROMPT,
            empty_message="No extracted documents found for this loan application.",
            source_formatter=lambda c: c["document_name"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[Chat Router] Chat failed for {application_id}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/policy/{bank_id}", response_model=ChatResponse)
async def chat_with_bank_policy(bank_id: str, body: ChatRequest) -> ChatResponse:
    """Answer a question about a bank's credit underwriting policy documents."""
    policy_app_id = f"BANK_{bank_id}"
    try:
        query_vector = await embed(body.query)
        chunks = await retrieve_and_rerank(
            query_text=body.query,
            query_embedding=query_vector,
            application_id=policy_app_id,
            final_limit=DEFAULT_TOP_K,
        )

        return await _run_chat(
            router_label="policy_chat",
            session_id=bank_id,
            query=body.query,
            chunks=chunks,
            prompt_template=POLICY_CHAT_PROMPT,
            empty_message=f"No policy documents found for bank {bank_id}.",
            source_formatter=lambda c: f"{c['document_name']} (Page {c.get('page_number') or 'N/A'})",
            extra={"policy_app_id": policy_app_id},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[Policy Chat Router] Chat failed for bank {bank_id}")
        raise HTTPException(status_code=500, detail=str(e)) from e