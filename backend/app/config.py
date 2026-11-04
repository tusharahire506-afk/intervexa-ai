import os
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_API_URL = os.getenv(
    "GEMINI_API_URL",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent",
).strip()
INTERVEXA_AI_API_KEY = os.getenv("INTERVEXA_AI_API_KEY", "").strip()
INTERVEXA_AI_API_URL = os.getenv("INTERVEXA_AI_API_URL", "").strip()
INTERVEXA_AI_MODEL = os.getenv("INTERVEXA_AI_MODEL", "gpt-4o-mini").strip()
SECRET_KEY = os.getenv("INTERVEXA_SECRET_KEY", "").strip()
AUTH_DB_PATH = os.getenv("INTERVEXA_AUTH_DB_PATH", str(PROJECT_ROOT / "backend" / "data" / "intervexa.db")).strip()
AUTH_EXPOSE_RESET_TOKEN = os.getenv("AUTH_EXPOSE_RESET_TOKEN", "false").lower() == "true"
SESSION_COOKIE_SECURE = os.getenv("INTERVEXA_SESSION_COOKIE_SECURE", "false").lower() == "true"
ALLOWED_ORIGINS = tuple(
    origin.strip()
    for origin in os.getenv(
        "INTERVEXA_ALLOWED_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8000,http://localhost:8000",
    ).split(",")
    if origin.strip()
)