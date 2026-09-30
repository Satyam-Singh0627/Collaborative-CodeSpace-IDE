import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import ALLOWED_ORIGINS, ENVIRONMENT, DATABASE_URL
from .routers import auth, rooms, ws, execution, ai

logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure Alembic migrations are applied (both PostgreSQL production and SQLite local)
    try:
        from alembic.config import Config
        from alembic import command
        backend_dir = Path(__file__).resolve().parent.parent
        ini_path = backend_dir / "alembic.ini"
        if ini_path.exists():
            alembic_cfg = Config(str(ini_path))
            alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
            command.upgrade(alembic_cfg, "head")
            logger.info("Alembic upgrade head executed successfully on startup.")
    except Exception as exc:
        logger.error("Alembic startup migration error: %s", exc, exc_info=True)
    yield


app = FastAPI(
    title="Collaborative CodeSpace API",
    description="Real-Time Collaborative Code Editor & Collaboration Room API",
    version="2.0.0",
    lifespan=lifespan,
)

# Global unhandled exception handler for detailed logging
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check server logs for details."}
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
