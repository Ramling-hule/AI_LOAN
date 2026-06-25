import google.generativeai as genai
from config.settings import get_settings

settings = get_settings()
genai.configure(api_key=settings.GEMINI_API_KEY)

try:
    model = genai.GenerativeModel('gemini-1.5-flash-8b')
    response = model.generate_content("Hello")
    print("gemini-1.5-flash-8b success:", response.text)
except Exception as e:
    print("gemini-1.5-flash-8b failed:", e)

try:
    model = genai.GenerativeModel('gemini-1.5-pro')
    response = model.generate_content("Hello")
    print("gemini-1.5-pro success:", response.text)
except Exception as e:
    print("gemini-1.5-pro failed:", e)

try:
    model = genai.GenerativeModel('gemini-2.5-flash')
    response = model.generate_content("Hello")
    print("gemini-2.5-flash success:", response.text)
except Exception as e:
    print("gemini-2.5-flash failed:", e)
