from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import ALLOWED_ORIGINS, ENVIRONMENT, DATABASE_URL
from .database import engine, Base
from .routers import auth, rooms, ws, execution, ai

# In development with local SQLite fallback, ensure initial tables exist if not already migrated.
# In production (PostgreSQL), schema is strictly managed via Alembic migrations.
if DATABASE_URL.startswith("sqlite"):
    Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Collaborative CodeSpace API",
    description="Real-Time Collaborative Code Editor & Collaboration Room API",
    version="2.0.0"
)

# Configure CORS
# Uses explicit allowed origins with credential support (no wildcard '*'), plus matches Vercel domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
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
        "version": "2.0.0",
        "environment": ENVIRONMENT
    }

@app.get("/api/health")
def health_check():
    db_type = "postgresql" if DATABASE_URL.startswith("postgresql") else "sqlite"
    return {
        "status": "healthy",
        "services": {
            "api": "up",
            "websocket": "ready",
            "database": f"{db_type}_ready",
            "execution": "ready",
            "ai": "ready"
        }
    }
