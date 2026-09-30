import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger("websocket_manager")


INITIAL_STARTER_FILES = [
    {
        "name": "main.py",
        "language": "python",
        "content": '''# Collaborative CodeSpace — Live Session
# Run this code or invite your team to edit together!

from utils import greet_team, calculate_sum

def main():
    team = ["Developer A", "Developer B"]
    print(greet_team(team))

    total = calculate_sum([10, 20, 30, 40])
    print(f"Sum: {total}")

if __name__ == "__main__":
    main()
'''
    },
    {
        "name": "utils.py",
        "language": "python",
        "content": '''# Helper utilities for the project

def greet_team(names):
    return f"Welcome to Collaborative CodeSpace, {', '.join(names)}!"

def calculate_sum(numbers):
    return sum(numbers)
'''
    },
    {
        "name": "README.md",
        "language": "markdown",
        "content": '''# Project Room

> Code Together. Communicate Together. Build Together.

### Getting Started
1. Invite team members using the Room Code in the top bar.
2. Edit code files concurrently — changes sync in real time.
3. Use the terminal to execute code.
4. Open the AI Assistant panel for explanations and bug fixes.
'''
    }
]


class ConnectionManager:
    def __init__(self):
        # room_code -> list of dict: {"websocket": WebSocket, "user_id": str, "name": str}
        self.active_rooms: Dict[str, List[Dict[str, Any]]] = {}
        # room_code -> {file_id: version} — monotonically increasing file versions
        self.file_versions: Dict[str, Dict[str, int]] = {}
        # room_code -> {file_id: file_dict} — live in-memory room files
        self.room_files: Dict[str, Dict[str, dict]] = {}
        # room_code -> list of message dicts — live in-memory room chat messages
        self.room_messages: Dict[str, List[dict]] = {}

    # -------------------------------------------------------------------------
    # In-Memory Room Files Store
    # -------------------------------------------------------------------------
    def ensure_room_initialized(self, room_code: str, initial_files: Optional[List[dict]] = None):
        """Initialize in-memory files for a room if not already loaded."""
        code = room_code.upper().strip()
        if code not in self.room_files:
            self.room_files[code] = {}
            if code not in self.file_versions:
                self.file_versions[code] = {}
            starter = initial_files or INITIAL_STARTER_FILES
            now_iso = datetime.now(timezone.utc).isoformat()
            for item in starter:
                f_id = item.get("id") or str(uuid.uuid4())
                name = item["name"]
                parts = name.rsplit("/", 1)
                parent_path = parts[0] if len(parts) > 1 else ""
                file_obj = {
                    "id": f_id,
                    "room_id": code,
                    "room_code": code,
                    "name": name,
                    "parent_path": parent_path,
                    "language": item.get("language") or "plaintext",
                    "content": item.get("content") or "",
                    "version": item.get("version", 1),
                    "created_at": item.get("created_at") or now_iso,
                    "updated_at": item.get("updated_at") or now_iso,
                }
                self.room_files[code][f_id] = file_obj
                self.file_versions[code][f_id] = file_obj["version"]

    def get_room_files(self, room_code: str) -> List[dict]:
        code = room_code.upper().strip()
        self.ensure_room_initialized(code)
        return list(self.room_files[code].values())

    def get_room_file(self, room_code: str, file_id: str) -> Optional[dict]:
        code = room_code.upper().strip()
        self.ensure_room_initialized(code)
        return self.room_files[code].get(file_id)

    def get_room_file_by_name(self, room_code: str, filename: str) -> Optional[dict]:
        code = room_code.upper().strip()
        self.ensure_room_initialized(code)
        for f in self.room_files[code].values():
            if f["name"] == filename:
                return f
        return None

    def add_room_file(self, room_code: str, file_data: dict) -> dict:
        code = room_code.upper().strip()
        self.ensure_room_initialized(code)
        f_id = file_data.get("id") or str(uuid.uuid4())
        name = file_data.get("name", "untitled")
        parts = name.rsplit("/", 1)
        parent_path = parts[0] if len(parts) > 1 else ""
        now_iso = datetime.now(timezone.utc).isoformat()
        file_obj = {
            "id": f_id,
            "room_id": code,
            "room_code": code,
            "name": name,
            "parent_path": parent_path,
            "language": file_data.get("language") or "plaintext",
            "content": file_data.get("content") or "",
            "version": file_data.get("version", 1),
            "created_at": file_data.get("created_at") or now_iso,
            "updated_at": now_iso,
        }
        self.room_files[code][f_id] = file_obj
        self.file_versions[code][f_id] = file_obj["version"]
        return file_obj

    def update_room_file(
        self,
        room_code: str,
        file_id: str,
        content: Optional[str] = None,
        name: Optional[str] = None,
        language: Optional[str] = None,
        version: Optional[int] = None
    ) -> Optional[dict]:
        code = room_code.upper().strip()
        self.ensure_room_initialized(code)
        f = self.room_files[code].get(file_id)
        if not f:
            return None
        if content is not None:
            f["content"] = content
        if name is not None:
            f["name"] = name
            parts = name.rsplit("/", 1)
            f["parent_path"] = parts[0] if len(parts) > 1 else ""
        if language is not None:
            f["language"] = language
        if version is not None:
            f["version"] = version
            self.file_versions[code][file_id] = version
        else:
            f["version"] = f.get("version", 1) + 1
            self.file_versions[code][file_id] = f["version"]
        f["updated_at"] = datetime.now(timezone.utc).isoformat()
        return f

    def delete_room_file(self, room_code: str, file_id: str) -> Optional[dict]:
        code = room_code.upper().strip()
        self.ensure_room_initialized(code)
        f = self.room_files[code].pop(file_id, None)
        if code in self.file_versions and file_id in self.file_versions[code]:
            del self.file_versions[code][file_id]
        return f

    # -------------------------------------------------------------------------
    # In-Memory Room Messages Store
    # -------------------------------------------------------------------------
    def add_room_message(self, room_code: str, message_dict: dict):
        code = room_code.upper().strip()
        if code not in self.room_messages:
            self.room_messages[code] = []
        self.room_messages[code].append(message_dict)

    def get_room_messages(self, room_code: str, limit: int = 100) -> List[dict]:
        code = room_code.upper().strip()
        msgs = self.room_messages.get(code, [])
        return msgs[-limit:]

    # -------------------------------------------------------------------------
    # WebSocket Connection Management
    # -------------------------------------------------------------------------
    async def connect(self, room_code: str, websocket: WebSocket, user_id: str, name: str):
        await websocket.accept()
        code = room_code.upper().strip()
        if code not in self.active_rooms:
            self.active_rooms[code] = []

        # Remove any stale connections from the same user (e.g. reconnect before disconnect detected)
        self.active_rooms[code] = [
            c for c in self.active_rooms[code]
            if not (c["user_id"] == user_id and c["websocket"] != websocket)
        ]

        # Append connection
        self.active_rooms[code].append({
            "websocket": websocket,
            "user_id": user_id,
            "name": name
        })

    def disconnect(self, room_code: str, websocket: WebSocket) -> Optional[Dict[str, Any]]:
        code = room_code.upper().strip()
        removed_user = None
        if code in self.active_rooms:
            for item in self.active_rooms[code]:
                if item["websocket"] == websocket:
                    removed_user = item
                    break
            if removed_user:
                self.active_rooms[code].remove(removed_user)
            if not self.active_rooms[code]:
                del self.active_rooms[code]
        return removed_user

    def get_online_users(self, room_code: str) -> List[Dict[str, str]]:
        code = room_code.upper().strip()
        if code not in self.active_rooms:
            return []
        unique_users: Dict[str, str] = {}
        for conn in self.active_rooms[code]:
            unique_users[conn["user_id"]] = conn["name"]
        return [{"user_id": uid, "name": uname} for uid, uname in unique_users.items()]

    def get_file_version(self, room_code: str, file_id: str) -> int:
        """Get current in-memory version for a file."""
        code = room_code.upper().strip()
        return self.file_versions.get(code, {}).get(file_id, 0)

    def set_file_version(self, room_code: str, file_id: str, version: int):
        """Set the in-memory version for a file."""
        code = room_code.upper().strip()
        if code not in self.file_versions:
            self.file_versions[code] = {}
        self.file_versions[code][file_id] = version

    def increment_file_version(self, room_code: str, file_id: str) -> int:
        """Atomically increment and return the new version for a file."""
        code = room_code.upper().strip()
        if code not in self.file_versions:
            self.file_versions[code] = {}
        current = self.file_versions[code].get(file_id, 0)
        new_version = current + 1
        self.file_versions[code][file_id] = new_version
        return new_version

    def is_stale_version(self, room_code: str, file_id: str, incoming_version: int) -> bool:
        """Check if an incoming version is older than the current version."""
        code = room_code.upper().strip()
        current = self.get_file_version(code, file_id)
        return incoming_version <= current

    def generate_event_id(self) -> str:
        """Generate a unique event ID."""
        return str(uuid.uuid4())

    async def broadcast_to_room(self, room_code: str, message: dict, exclude_socket: Optional[WebSocket] = None):
        code = room_code.upper().strip()
        if code not in self.active_rooms:
            return
        dead_connections = []
        data_text = json.dumps(message)
        for conn in self.active_rooms[code]:
            ws = conn["websocket"]
            if exclude_socket is not None and ws == exclude_socket:
                continue
            try:
                await ws.send_text(data_text)
            except Exception:
                dead_connections.append(ws)

        # Clean up dead connections
        for ws in dead_connections:
            self.disconnect(code, ws)

    async def send_to_user(self, room_code: str, target_user_id: str, message: dict):
        code = room_code.upper().strip()
        if code not in self.active_rooms:
            return
        data_text = json.dumps(message)
        for conn in self.active_rooms[code]:
            if conn["user_id"] == target_user_id:
                try:
                    await conn["websocket"].send_text(data_text)
                except Exception:
                    pass

    async def send_to_socket(self, websocket: WebSocket, message: dict):
        """Send a message directly to a specific WebSocket connection."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            logger.warning("Failed to send to socket")


manager = ConnectionManager()
