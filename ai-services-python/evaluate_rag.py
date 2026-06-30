import asyncio
import json
import uuid
import time
from config.database import init_db, fetchrow, close_db
from services.extraction.retriever import retrieve_domain
from services.llm.providers.gemini import GeminiLLMProvider

gemini_provider = GeminiLLMProvider()

async def evaluate():
    await init_db()
    
    row = await fetchrow('SELECT application_id FROM extracted_parameters ORDER BY updated_at DESC LIMIT 1')
    if not row:
        print('No application found')
        return
    app_id = row['application_id']
    print(f'Evaluating for app_id: {app_id}')
    
    
    queries = [
        "What is the annual turnover or gross revenue?",
        "What is the net profit after tax?",
        "What is the GSTIN number?",
        "What is the PAN number?"
    ]
    chunks = await retrieve_domain('financial', queries, app_id, 20)
    
    if not chunks:
        print("No chunks retrieved! Check RAG setup.")
        await close_db()
        return

    chunk_texts = "\n\n".join([f"--- Chunk {i+1} ---\n{c['text']}" for i, c in enumerate(chunks[:10])])
    
    
    eval_prompt = f"""
    You are evaluating a RAG (Retrieval-Augmented Generation) system for financial document extraction.
    
    RETRIEVED CHUNKS:
    {chunk_texts}
    
    QUERIES USED:
    {queries}
    
    Please evaluate the retrieval performance and answer the following for EACH query:
    1. **Context Recall**: Does the retrieved context contain the information needed to answer the query? (Yes/No/Partial)
    2. **Answer Faithfulness**: If you extract the answer from the context, is it fully supported by the text? (Yes/No)
    3. **Recall@K (Top 10)**: Is the exact required value present anywhere in these top 10 chunks?
    
    Provide your response as a valid Markdown string.
    """
    
    print("Calling Gemini to evaluate RAG metrics...")
    eval_response = await gemini_provider.chat(
        messages=[{"role": "user", "content": eval_prompt}],
        temperature=0.1
    )
    
    
    artifact_path = 'C:/Users/Hule Ramling/.gemini/antigravity-ide/brain/0127a3de-54cb-4621-be40-a1f9d634a737/evaluation_results.md'
    with open(artifact_path, 'w', encoding='utf-8') as f:
        f.write(f'# RAG Evaluation Results for {app_id}\n\n')
        
        f.write('## Metrics (Evaluated by LLM Judge)\n\n')
        f.write(eval_response.strip())
        f.write('\n\n## Top Retrieved Chunks\n\n')
        for i, c in enumerate(chunks[:10]):
            f.write(f'### Chunk {i+1}\n')
            f.write(f'- **Source**: `{c.get("document_type", "Unknown")}`\n')
            f.write(f'- **Rerank Score**: `{c.get("rerank_score", c.get("similarity", 0)):.4f}`\n\n')
            f.write(f'```text\n{c["text"]}\n```\n\n')
            
    print("Saved to evaluation_results.md")
    await close_db()

if __name__ == "__main__":
    asyncio.run(evaluate())
