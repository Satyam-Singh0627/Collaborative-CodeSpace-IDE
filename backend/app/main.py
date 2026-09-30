from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import FRONTEND_URL, ENVIRONMENT
from .database import engine, Base
from .routers import auth, rooms, ws, execution, ai

# Create database tables automatically
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Collaborative CodeSpace API",
    description="Real-Time Collaborative Code Editor & Collaboration Room API",
    version="1.0.0"
)

# Configure CORS
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

# Register API Routers
app.include_router(auth.router)
app.include_router(rooms.router)
app.include_router(ws.router)
app.include_router(execution.router)
app.include_router(ai.router)

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
        "services": {
            "api": "up",
            "websocket": "ready",
            "database": "sqlite_ready",
            "execution": "ready",
            "ai": "ready"
        }
    }
