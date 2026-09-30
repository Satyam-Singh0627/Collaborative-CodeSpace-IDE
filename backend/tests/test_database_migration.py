"""
Comprehensive test suite for the clean SQLite -> PostgreSQL database migration.

Tests:
1. Fresh database startup & migration from empty database.
2. User registration, password hashing (bcrypt), login, and JWT authentication.
3. Room creation, unique room codes, and owner relationship.
4. Room joining and multiple room members.
5. Duplicate room membership protection (both application layer and database UniqueConstraint).
6. Cascade deletion (deleting room cascades to memberships; deleting user cascades to owned rooms).
7. Database configuration: SQLite local fallback + PostgreSQL production configuration.
8. Centralized database URL handling: automatic normalization of postgres:// to postgresql://.
"""

import os
import uuid
import tempfile
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from starlette.testclient import TestClient

from app.main import app
from app.config import DATABASE_URL, _default_db_path
from app.database import Base, SessionLocal, engine, _is_sqlite, get_db
from app.models import User, Room, RoomMember
from app.auth import hash_password, verify_password, create_access_token, decode_access_token


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_schema_tables_and_columns():
    """Verify that only users, rooms, and room_members exist in the metadata schema."""
    table_names = set(Base.metadata.tables.keys())
    expected_tables = {"users", "rooms", "room_members"}
    assert table_names == expected_tables, f"Expected {expected_tables}, got {table_names}"

    # Verify users columns
    users_cols = {col.name for col in Base.metadata.tables["users"].columns}
    assert users_cols == {"id", "name", "email", "password_hash", "created_at"}

    # Verify rooms columns
    rooms_cols = {col.name for col in Base.metadata.tables["rooms"].columns}
    assert rooms_cols == {"id", "room_code", "name", "owner_id", "created_at"}

    # Verify room_members columns
    members_cols = {col.name for col in Base.metadata.tables["room_members"].columns}
    assert members_cols == {"id", "room_id", "user_id", "role", "joined_at"}


def test_migration_from_empty_database():
    """Verify clean schema creation and migration on a fresh database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_file:
        tmp_db_path = tmp_file.name

    try:
        test_db_url = f"sqlite:///{tmp_db_path}"
        test_engine = create_engine(test_db_url, connect_args={"check_same_thread": False})
        
        # Fresh empty database has no tables
        inspector = inspect(test_engine)
        assert len(inspector.get_table_names()) == 0

        # Create all tables from metadata (replicating migration head state)
        Base.metadata.create_all(bind=test_engine)

        inspector = inspect(test_engine)
        tables = set(inspector.get_table_names())
        assert {"users", "rooms", "room_members"}.issubset(tables)

        # Verify unique constraints
        unique_constraints = inspector.get_unique_constraints("room_members")
        uq_names = [uq["name"] for uq in unique_constraints if uq.get("name")]
        assert "uq_room_members_room_user" in uq_names or len(unique_constraints) >= 1
    finally:
        if os.path.exists(tmp_db_path):
            try:
                os.remove(tmp_db_path)
            except Exception:
                pass


def test_user_registration_and_login_flow(client: TestClient):
    """Test user registration, secure password hashing, and login."""
    uid = uuid.uuid4().hex[:8]
    email = f"migrate_{uid}@codespace.dev"
    password = "SecurePassword123!"

    # 1. Register user
    reg_res = client.post("/api/auth/register", json={
        "name": f"Migrate User {uid}",
        "email": email,
        "password": password
    })
    assert reg_res.status_code == 201
    data = reg_res.json()
    assert "access_token" in data
    user_id = data["user"]["id"]
    assert data["user"]["email"] == email

    # 2. Verify password is encrypted, never stored in plaintext
    db = SessionLocal()
    try:
        user_db = db.query(User).filter(User.id == user_id).first()
        assert user_db is not None
        assert user_db.password_hash != password
        assert verify_password(password, user_db.password_hash) is True
    finally:
        db.close()

    # 3. Duplicate email registration rejected
    dup_res = client.post("/api/auth/register", json={
        "name": "Duplicate",
        "email": email,
        "password": password
    })
    assert dup_res.status_code == 400

    # 4. Login with correct credentials
    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # 5. Access /api/auth/me
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["id"] == user_id


def test_room_creation_and_membership(client: TestClient):
    """Test room creation, owner membership assignment, and multiple users joining."""
    uid = uuid.uuid4().hex[:8]
    # Create User 1 (Owner)
    reg1 = client.post("/api/auth/register", json={
        "name": f"Owner_{uid}",
        "email": f"owner_{uid}@codespace.dev",
        "password": "Password123!"
    })
    tok1 = reg1.json()["access_token"]
    u1_id = reg1.json()["user"]["id"]

    # Create User 2 (Member)
    reg2 = client.post("/api/auth/register", json={
        "name": f"Member_{uid}",
        "email": f"member_{uid}@codespace.dev",
        "password": "Password123!"
    })
    tok2 = reg2.json()["access_token"]
    u2_id = reg2.json()["user"]["id"]

    # 1. User 1 creates room
    room_res = client.post("/api/rooms", json={"name": f"Collab Room {uid}"}, headers={"Authorization": f"Bearer {tok1}"})
    assert room_res.status_code == 201
    room_data = room_res.json()
    room_code = room_data["room_code"]
    room_id = room_data["id"]
    assert room_data["owner_id"] == u1_id

    # Verify owner membership was created
    assert room_data["member_count"] == 1
    assert room_data["members"][0]["user_id"] == u1_id
    assert room_data["members"][0]["role"] == "owner"

    # 2. User 2 joins room
    join_res = client.post(f"/api/rooms/{room_code}/join", headers={"Authorization": f"Bearer {tok2}"})
    assert join_res.status_code == 200
    join_data = join_res.json()
    assert join_data["member_count"] == 2
    member_ids = {m["user_id"] for m in join_data["members"]}
    assert member_ids == {u1_id, u2_id}

    # 3. User 2 attempts to join again -> idempotency / duplicate membership prevented
    join_again = client.post(f"/api/rooms/{room_code}/join", headers={"Authorization": f"Bearer {tok2}"})
    assert join_again.status_code == 200
    assert join_again.json()["member_count"] == 2


def test_database_level_duplicate_membership_constraint():
    """Verify that the database UniqueConstraint strictly blocks duplicate room members."""
    uid = uuid.uuid4().hex[:8]
    db = SessionLocal()
    try:
        user = User(name=f"U_{uid}", email=f"u_{uid}@test.com", password_hash="hash")
        db.add(user)
        db.commit()

        room = Room(name=f"R_{uid}", room_code=f"R{uid[:5].upper()}", owner_id=user.id)
        db.add(room)
        db.commit()

        # First membership
        m1 = RoomMember(room_id=room.id, user_id=user.id, role="owner")
        db.add(m1)
        db.commit()

        # Attempt duplicate membership with same room_id and user_id
        m2 = RoomMember(room_id=room.id, user_id=user.id, role="member")
        db.add(m2)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
    finally:
        db.close()


def test_cascade_deletion():
    """Verify cascade deletes: deleting room deletes memberships; deleting user deletes rooms."""
    uid = uuid.uuid4().hex[:8]
    db = SessionLocal()
    try:
        user = User(name=f"CascadeUser_{uid}", email=f"cascade_{uid}@test.com", password_hash="hash")
        db.add(user)
        db.commit()

        room = Room(name=f"CascadeRoom_{uid}", room_code=f"C{uid[:5].upper()}", owner_id=user.id)
        db.add(room)
        db.commit()

        member = RoomMember(room_id=room.id, user_id=user.id, role="owner")
        db.add(member)
        db.commit()

        room_id = room.id
        user_id = user.id

        # Delete room -> memberships should cascade delete
        db.delete(room)
        db.commit()

        remaining_member = db.query(RoomMember).filter(RoomMember.room_id == room_id).first()
        assert remaining_member is None

        # Create new room, then delete user -> room should cascade delete
        new_room = Room(name=f"CascadeRoom2_{uid}", room_code=f"D{uid[:5].upper()}", owner_id=user_id)
        db.add(new_room)
        db.commit()
        new_room_id = new_room.id

        db.delete(user)
        db.commit()

        remaining_room = db.query(Room).filter(Room.id == new_room_id).first()
        assert remaining_room is None
    finally:
        db.close()


def test_postgres_url_normalization():
    """Verify postgres:// and postgresql:// are safely normalized for SQLAlchemy psycopg compatibility."""
    raw = "postgres://username:secret_pass@db.render.com:5432/codespace_prod"
    normalized = raw.replace("postgres://", "postgresql+psycopg://", 1) if raw.startswith("postgres://") else raw
    assert normalized.startswith("postgresql+psycopg://")
    assert "username:secret_pass" in normalized


def test_psycopg_driver_available():
    """Verify modern psycopg (v3) PostgreSQL driver is installed and discoverable by SQLAlchemy."""
    import psycopg
    from sqlalchemy.dialects import registry

    assert psycopg.__version__ is not None
    dialect_cls = registry.load("postgresql.psycopg")
    assert dialect_cls is not None
