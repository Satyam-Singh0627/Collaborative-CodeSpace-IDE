from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import DATABASE_URL

# Determine if SQLite or PostgreSQL
_is_sqlite = DATABASE_URL.startswith("sqlite")

# For SQLite, connect_args check_same_thread needs to be False for multithreading
connect_args = {"check_same_thread": False} if _is_sqlite else {}

# PostgreSQL pool settings for production
pool_kwargs = {}
if not _is_sqlite:
    pool_kwargs = {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    **pool_kwargs
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
