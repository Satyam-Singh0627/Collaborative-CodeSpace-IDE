import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from project root or backend folder if present
BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
if (ROOT_DIR / ".env").exists():
    load_dotenv(ROOT_DIR / ".env")
elif (BASE_DIR / ".env").exists():
    load_dotenv(BASE_DIR / ".env")

# Settings with safe defaults for local prototype development
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
PORT = int(os.getenv("PORT", "8000"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/codespace.db")

JWT_SECRET = os.getenv("JWT_SECRET", "codespace-dev-insecure-secret-key-change-in-prod-12345")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
AI_API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("AI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
AI_PROVIDER = os.getenv("AI_PROVIDER", "auto")
AI_MODEL = os.getenv("AI_MODEL", "")

# Code execution settings (supports 'piston', 'judge0', or 'auto')
EXECUTION_PROVIDER = os.getenv("EXECUTION_PROVIDER", "auto")
PISTON_API_URL = os.getenv("PISTON_API_URL", "https://emkc.org/api/v2/piston")
JUDGE0_API_URL = os.getenv("JUDGE0_API_URL", "https://ce.judge0.com/submissions?wait=true&base64_encoded=true")
