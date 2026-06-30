import asyncio
import os
import google.generativeai as genai
from config.settings import get_settings

settings = get_settings()
all_keys = [k.strip() for k in settings.GEMINI_API_KEY.split(",") if k.strip()]

async def test_keys():
    print(f"Testing {len(all_keys)} keys...")
    for idx, key in enumerate(all_keys):
        genai.configure(api_key=key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        try:
            resp = await model.generate_content_async("Say hello")
            print(f"Key #{idx}: SUCCESS -> {resp.text.strip()}")
        except Exception as e:
            err = str(e).replace('\n', ' ')
            print(f"Key #{idx}: FAILED -> {err}")
            
if __name__ == "__main__":
    asyncio.run(test_keys())
