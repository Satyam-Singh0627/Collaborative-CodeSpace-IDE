import json
import uuid
import logging
from typing import Dict, List, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger("websocket_manager")


class ConnectionManager:
    def __init__(self):
        # room_code -> list of dict: {"websocket": WebSocket, "user_id": str, "name": str}
        self.active_rooms: Dict[str, List[Dict[str, Any]]] = {}
        # room_code -> {file_id: version} — monotonically increasing file versions
        self.file_versions: Dict[str, Dict[str, int]] = {}

    async def connect(self, room_code: str, websocket: WebSocket, user_id: str, name: str):
        await websocket.accept()
        if room_code not in self.active_rooms:
            self.active_rooms[room_code] = []

        # Remove any stale connections from the same user (e.g. reconnect before disconnect detected)
        self.active_rooms[room_code] = [
            c for c in self.active_rooms[room_code]
            if not (c["user_id"] == user_id and c["websocket"] != websocket)
        ]

        # Append connection
        self.active_rooms[room_code].append({
            "websocket": websocket,
            "user_id": user_id,
            "name": name
        })

    def disconnect(self, room_code: str, websocket: WebSocket) -> Optional[Dict[str, Any]]:
        removed_user = None
        if room_code in self.active_rooms:
            for item in self.active_rooms[room_code]:
                if item["websocket"] == websocket:
                    removed_user = item
                    break
            if removed_user:
                self.active_rooms[room_code].remove(removed_user)
            if not self.active_rooms[room_code]:
                del self.active_rooms[room_code]
        return removed_user

    def get_online_users(self, room_code: str) -> List[Dict[str, str]]:
        if room_code not in self.active_rooms:
            return []
        unique_users: Dict[str, str] = {}
        for conn in self.active_rooms[room_code]:
            unique_users[conn["user_id"]] = conn["name"]
        return [{"user_id": uid, "name": uname} for uid, uname in unique_users.items()]

    def get_file_version(self, room_code: str, file_id: str) -> int:
        """Get current in-memory version for a file."""
        return self.file_versions.get(room_code, {}).get(file_id, 0)

    def set_file_version(self, room_code: str, file_id: str, version: int):
        """Set the in-memory version for a file."""
        if room_code not in self.file_versions:
            self.file_versions[room_code] = {}
        self.file_versions[room_code][file_id] = version

    def increment_file_version(self, room_code: str, file_id: str) -> int:
        """Atomically increment and return the new version for a file."""
        if room_code not in self.file_versions:
            self.file_versions[room_code] = {}
        current = self.file_versions[room_code].get(file_id, 0)
        new_version = current + 1
        self.file_versions[room_code][file_id] = new_version
        return new_version

    def is_stale_version(self, room_code: str, file_id: str, incoming_version: int) -> bool:
        """Check if an incoming version is older than the current version."""
        current = self.get_file_version(room_code, file_id)
        return incoming_version <= current

    def generate_event_id(self) -> str:
        """Generate a unique event ID."""
        return str(uuid.uuid4())

    async def broadcast_to_room(self, room_code: str, message: dict, exclude_socket: Optional[WebSocket] = None):
        if room_code not in self.active_rooms:
            return
        dead_connections = []
        data_text = json.dumps(message)
        for conn in self.active_rooms[room_code]:
            ws = conn["websocket"]
            if exclude_socket is not None and ws == exclude_socket:
                continue
            try:
                await ws.send_text(data_text)
            except Exception:
                dead_connections.append(ws)

        # Clean up dead connections
        for ws in dead_connections:
            self.disconnect(room_code, ws)

    async def send_to_user(self, room_code: str, target_user_id: str, message: dict):
        if room_code not in self.active_rooms:
            return
        data_text = json.dumps(message)
        for conn in self.active_rooms[room_code]:
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
