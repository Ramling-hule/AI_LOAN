import asyncio
from config.settings import get_settings
from services.llm.providers.gemini import GeminiLLMProvider
from services.underwriting.underwriting_service import UNDERWRITING_SYSTEM_PROMPT

async def test():
    llm = GeminiLLMProvider()
    user_msg = """
LOAN APPLICATION DETAILS:
Application ID: 123
Bank: HDFC
Requested Amount: ₹50,00,000

EXTRACTED FINANCIAL PARAMETERS:
{"gstin": "27AAAAA1234A1Z1", "pan": "AAAAA1234A", "annual_turnover": 10000000.0, "net_profit": 500000.0, "total_liabilities": 2000000.0, "avg_monthly_balance": 50000.0, "cheque_bounce_count": 0, "loan_balances": [], "promoter_details": [], "collateral_details": []}

BANK LENDING POLICIES:
No specific bank policies provided — apply general RBI SME lending guidelines.

DOCUMENT EVIDENCE (RAG-retrieved):
[Evidence Chunk 1]
GST Registration Certificate
"""
    messages = [
        {"role": "system", "content": UNDERWRITING_SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]
    
    print("Sending...")
    res = await llm.chat(messages, response_format="json_object")
    with open("test_out.json", "w", encoding="utf-8") as f:
        f.write(res)
    print("Saved to test_out.json")

if __name__ == "__main__":
    asyncio.run(test())
