from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import FRONTEND_URL, ENVIRONMENT

app = FastAPI(
    title="Collaborative CodeSpace API",
    description="Real-Time Collaborative Code Editor & Collaboration Room API",
    version="1.0.0"
)

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "app": "Collaborative CodeSpace API",
        "tagline": "Code Together. Communicate Together. Build Together.",
        "status": "online",
        "environment": ENVIRONMENT
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": "2026-09-30T11:54:00Z",
        "services": {
            "api": "up",
            "websocket": "ready",
            "database": "sqlite_ready"
        }
    }
