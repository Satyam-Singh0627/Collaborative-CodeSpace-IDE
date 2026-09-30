"""
Comprehensive test suite for Collaborative CodeSpace IDE.

Covers:
1. Language detection utility
2. Auth registration and login
3. Room creation without mandatory language
4. 4 simultaneous users in the same room
5. Room isolation (events never leak across rooms)
6. Monotonic file versioning and stale event rejection
7. Reconnect and full-state resync
8. File CRUD event propagation over WebSocket
9. AI Agent workspace tools (list, create, read, update, rename, delete)
"""
import uuid
import pytest
from starlette.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import SessionLocal, Base, engine
from app.models import User, Room, ProjectFile, RoomMember
from app.routers.ws import _detect_language
from app.websocket_manager import manager
from app.services.ai_agent import (
    tool_list_files,
    tool_create_file,
    tool_read_file,
    tool_update_file,
    tool_rename_file,
    tool_delete_file,
    execute_tool,
)


@pytest.fixture(scope="module")
def client():
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_test_user(client: TestClient, name: str, email: str, password: str = "Password123!"):
    """Helper to register and login a test user, returning user info and JWT token."""
    res = client.post("/api/auth/register", json={
        "name": name,
        "email": email,
        "password": password
    })
    if res.status_code in (200, 201):
        data = res.json()
        token = data.get("access_token") or data.get("token")
        user = data.get("user")
        return user, token

    res_login = client.post("/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert res_login.status_code == 200, f"Failed to login user {email}: {res_login.text}"
    data = res_login.json()
    token = data.get("access_token") or data.get("token")
    user = data.get("user")
    return user, token


def test_language_detection():
    """Verify file extensions map to appropriate language identifiers."""
    assert _detect_language("main.py") == "python"
    assert _detect_language("index.ts") == "typescript"
    assert _detect_language("App.tsx") == "typescript"
    assert _detect_language("script.js") == "javascript"
    assert _detect_language("Component.jsx") == "javascript"
    assert _detect_language("solution.cpp") == "cpp"
    assert _detect_language("main.rs") == "rust"
    assert _detect_language("server.go") == "go"
    assert _detect_language("Main.java") == "java"
    assert _detect_language("style.css") == "css"
    assert _detect_language("index.html") == "html"
    assert _detect_language("config.json") == "json"
    assert _detect_language("README.md") == "markdown"
    assert _detect_language("query.sql") == "sql"
    assert _detect_language("unknown.xyz123") == "plaintext"
    assert _detect_language("noextension") == "plaintext"


def test_auth_and_room_creation(client: TestClient):
    """Test user signup, login, and room creation without mandatory language."""
    uid = uuid.uuid4().hex[:6]
    user, token = create_test_user(client, f"Host_{uid}", f"host_{uid}@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create room without language specification
    res = client.post("/api/rooms", json={"name": f"Test Room {uid}"}, headers=headers)
    assert res.status_code in (200, 201)
    room = res.json()
    assert "room_code" in room
    assert room["name"] == f"Test Room {uid}"

    # Default file should be created and have version >= 1
    files_res = client.get(f"/api/rooms/{room['room_code']}/files", headers=headers)
    assert files_res.status_code == 200
    files = files_res.json()
    assert len(files) >= 1
    assert files[0].get("version", 1) >= 1


def test_four_simultaneous_users_and_room_isolation(client: TestClient):
    """
    Test that at least 4 users can collaborate simultaneously in the same room.
    Also test room isolation: messages in Room A must never leak to Room B.
    """
    uid = uuid.uuid4().hex[:6]
    # Create 4 users for Room A
    u1, tok1 = create_test_user(client, f"User1_{uid}", f"u1_{uid}@test.com")
    u2, tok2 = create_test_user(client, f"User2_{uid}", f"u2_{uid}@test.com")
    u3, tok3 = create_test_user(client, f"User3_{uid}", f"u3_{uid}@test.com")
    u4, tok4 = create_test_user(client, f"User4_{uid}", f"u4_{uid}@test.com")

    # Create Room A
    res_a = client.post("/api/rooms", json={"name": f"Room A {uid}"}, headers={"Authorization": f"Bearer {tok1}"})
    room_a = res_a.json()["room_code"]

    # Join u2, u3, u4 to Room A
    for tok in [tok2, tok3, tok4]:
        client.post(f"/api/rooms/{room_a}/join", headers={"Authorization": f"Bearer {tok}"})

    # Create User 5 and Room B for isolation test
    u5, tok5 = create_test_user(client, f"User5_{uid}", f"u5_{uid}@test.com")
    res_b = client.post("/api/rooms", json={"name": f"Room B {uid}"}, headers={"Authorization": f"Bearer {tok5}"})
    room_b = res_b.json()["room_code"]

    # Connect all 4 users to Room A and 1 user to Room B simultaneously
    with client.websocket_connect(f"/ws/{room_a}?token={tok1}") as ws1, \
         client.websocket_connect(f"/ws/{room_a}?token={tok2}") as ws2, \
         client.websocket_connect(f"/ws/{room_a}?token={tok3}") as ws3, \
         client.websocket_connect(f"/ws/{room_a}?token={tok4}") as ws4, \
         client.websocket_connect(f"/ws/{room_b}?token={tok5}") as ws5:

        # Drain initial greetings for ws1..ws4
        for _ in range(4):
            try:
                ws1.receive_json()
            except Exception:
                break

        # Verify online count in Room A
        online_users = manager.get_online_users(room_a)
        assert len(online_users) == 4, f"Expected 4 active users in Room A, got {len(online_users)}"

        # Verify Room B has exactly 1 online user
        online_b = manager.get_online_users(room_b)
        assert len(online_b) == 1

        # Test Broadcast in Room A: ws1 sends chat message
        ws1.send_json({
            "type": "chat_message",
            "message": "Hello from User 1!"
        })

        # ws2, ws3, ws4 should receive chat message
        def find_chat(ws):
            for _ in range(5):
                msg = ws.receive_json()
                if msg.get("type") == "chat_message" and msg.get("message") == "Hello from User 1!":
                    return True
            return False

        assert find_chat(ws2), "ws2 did not receive chat message from ws1"
        assert find_chat(ws3), "ws3 did not receive chat message from ws1"
        assert find_chat(ws4), "ws4 did not receive chat message from ws1"

        # ROOM ISOLATION CHECK: ws5 in Room B must NOT receive ws1's message from Room A
        ws5.send_json({"type": "ping"})
        received_b = ws5.receive_json()
        assert received_b.get("type") != "chat_message", "Room B received message leaked from Room A!"


def test_monotonic_file_versioning_and_stale_rejection():
    """Test ConnectionManager file version tracking and rejection of stale events."""
    room = "TEST_ROOM_VER"
    file_id = "test-file-1"

    # Initial state
    assert manager.get_file_version(room, file_id) == 0

    # Explicit set
    manager.set_file_version(room, file_id, 1)
    assert manager.get_file_version(room, file_id) == 1

    # Increment
    new_v = manager.increment_file_version(room, file_id)
    assert new_v == 2
    assert manager.get_file_version(room, file_id) == 2

    # Stale checks
    assert manager.is_stale_version(room, file_id, 1) is True   # 1 <= 2: stale!
    assert manager.is_stale_version(room, file_id, 2) is True   # 2 <= 2: stale/duplicate!
    assert manager.is_stale_version(room, file_id, 3) is False  # 3 > 2: fresh!


def test_reconnect_and_resync_flow(client: TestClient):
    """Test client disconnect, reconnect, and resync fetching full room state."""
    uid = uuid.uuid4().hex[:6]
    u1, tok1 = create_test_user(client, f"SyncUser_{uid}", f"sync_{uid}@test.com")
    headers = {"Authorization": f"Bearer {tok1}"}

    res = client.post("/api/rooms", json={"name": f"Sync Room {uid}"}, headers=headers)
    room_code = res.json()["room_code"]

    # First connection: create file and post a message
    with client.websocket_connect(f"/ws/{room_code}?token={tok1}") as ws:
        # Drain initial
        ws.receive_json()
        # Post chat
        ws.send_json({"type": "chat_message", "message": "Remember this message"})

    # Client reconnects and requests resync
    with client.websocket_connect(f"/ws/{room_code}?token={tok1}") as ws:
        # Send resync event
        ws.send_json({"type": "resync"})

        # Collect responses until resync payload is found
        resync_payload = None
        for _ in range(5):
            msg = ws.receive_json()
            if msg.get("type") == "resync":
                resync_payload = msg
                break

        assert resync_payload is not None, "Failed to receive resync payload on reconnect"
        assert "files" in resync_payload
        assert "messages" in resync_payload
        assert "online_users" in resync_payload
        assert resync_payload["room_code"] == room_code
def test_file_crud_websocket_propagation(client: TestClient):
    """Test file_create, file_update, file_rename, file_delete events propagate via WebSocket."""
    uid = uuid.uuid4().hex[:6]
    u1, tok1 = create_test_user(client, f"FileUser1_{uid}", f"fu1_{uid}@test.com")
    u2, tok2 = create_test_user(client, f"FileUser2_{uid}", f"fu2_{uid}@test.com")

    # Create room
    res = client.post("/api/rooms", json={"name": f"File CRUD Room {uid}"}, headers={"Authorization": f"Bearer {tok1}"})
    room_code = res.json()["room_code"]
    client.post(f"/api/rooms/{room_code}/join", headers={"Authorization": f"Bearer {tok2}"})

    with client.websocket_connect(f"/ws/{room_code}?token={tok1}") as ws1, \
         client.websocket_connect(f"/ws/{room_code}?token={tok2}") as ws2:

        # Helper to drain until expected type
        def wait_for_type(ws, target_type):
            for _ in range(6):
                msg = ws.receive_json()
                if msg.get("type") == target_type:
                    return msg
            return None

        # 1. file_create event from ws1
        file_id = f"file-{uid}"
        ws1.send_json({
            "type": "file_create",
            "file": {"id": file_id, "name": "app.py", "content": "# initial", "language": "python"}
        })
        created_msg = wait_for_type(ws2, "file_created")
        assert created_msg is not None, "ws2 did not receive file_created event"
        assert created_msg["file"]["name"] == "app.py"
        assert created_msg["file"]["language"] == "python"
        file_id = created_msg["file"]["id"]

        # 2. file_update event from ws2
        ws2.send_json({
            "type": "file_update",
            "file_id": file_id,
            "content": "# updated content",
            "version": 2
        })
        updated_msg = wait_for_type(ws1, "file_updated")
        assert updated_msg is not None, "ws1 did not receive file_updated event"
        assert updated_msg["file_id"] == file_id
        assert updated_msg["version"] == 2

        # 3. file_rename event from ws1
        ws1.send_json({
            "type": "file_rename",
            "file_id": file_id,
            "new_name": "main_app.py"
        })
        renamed_msg = wait_for_type(ws2, "file_renamed")
        assert renamed_msg is not None, "ws2 did not receive file_renamed event"
        assert renamed_msg["new_name"] == "main_app.py"

        # 4. file_delete event from ws2
        ws2.send_json({
            "type": "file_delete",
            "file_id": file_id
        })
        deleted_msg = wait_for_type(ws1, "file_deleted")
        assert deleted_msg is not None, "ws1 did not receive file_deleted event"
        assert deleted_msg["file_id"] == file_id


def test_ai_agent_tools(db_session: Session):
    """Test AI Agent tools for direct workspace file manipulation."""
    uid = uuid.uuid4().hex[:6]
    owner = User(name=f"Owner_{uid}", email=f"owner_{uid}@test.com", password_hash="hashed_pass")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    room = Room(name=f"AI Test Room {uid}", room_code=f"AIR{uid.upper()[:5]}", owner_id=owner.id)
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)

    # 1. Create file tool
    create_res = execute_tool("create_file", room.id, db_session, filename="agent_test.py", content="print('hello AI')")
    assert "Created file" in create_res

    # 2. List files tool
    list_res = execute_tool("list_files", room.id, db_session)
    assert "agent_test.py" in list_res

    # 3. Read file tool
    read_res = execute_tool("read_file", room.id, db_session, filename="agent_test.py")
    assert "print('hello AI')" in read_res

    # 4. Update file tool
    update_res = execute_tool("update_file", room.id, db_session, filename="agent_test.py", content="print('updated content')")
    assert "Updated file" in update_res

    # Verify update in DB
    updated_file = db_session.query(ProjectFile).filter(ProjectFile.room_id == room.id, ProjectFile.name == "agent_test.py").first()
    assert updated_file is not None
    assert updated_file.content == "print('updated content')"
    assert updated_file.version >= 2

    # 5. Rename file tool
    rename_res = execute_tool("rename_file", room.id, db_session, old_name="agent_test.py", new_name="agent_renamed.py")
    assert "Renamed" in rename_res

    # 6. Delete file tool
    delete_res = execute_tool("delete_file", room.id, db_session, filename="agent_renamed.py")
    assert "Deleted file" in delete_res

    # Verify deletion in DB
    deleted = db_session.query(ProjectFile).filter(ProjectFile.room_id == room.id, ProjectFile.name == "agent_renamed.py").first()
    assert deleted is None


def test_file_state_isolation_and_save_integrity(client, db_session):
    """
    Verify that file versioning is strictly monotonic, file state in the database
    remains protected from unsolicited mutations, and local file operations
    maintain database isolation.
    """
    # 1. Register user and create room
    _, token = create_test_user(client, "SaveTester", f"savetester_{uuid.uuid4().hex[:8]}@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    room_res = client.post("/api/rooms", json={"name": "Save Integrity Room"}, headers=headers)
    assert room_res.status_code == 201
    room_code = room_res.json()["room_code"]

    # 2. Create a test file
    file_res = client.post(f"/api/rooms/{room_code}/files", json={
        "name": "calculator.py",
        "language": "python",
        "content": "def add(a, b): return a + b"
    }, headers=headers)
    assert file_res.status_code == 201
    file_data = file_res.json()
    file_id = file_data["id"]
    initial_version = file_data["version"]

    # 3. Verify server state is unaffected until an explicit PUT update
    files_list = client.get(f"/api/rooms/{room_code}/files", headers=headers).json()
    assert len(files_list) >= 1
    calc_file = next(f for f in files_list if f["id"] == file_id)
    assert calc_file["version"] == initial_version
    assert calc_file["content"] == "def add(a, b): return a + b"

    # 4. Perform explicit update and verify monotonic version increment
    update_res = client.put(f"/api/rooms/{room_code}/files/{file_id}", json={
        "content": "def add(a, b): return a + b\n\ndef sub(a, b): return a - b",
        "version": initial_version
    }, headers=headers)
    assert update_res.status_code == 200
    updated_file = update_res.json()
    assert updated_file["version"] == initial_version + 1
    assert "def sub" in updated_file["content"]

