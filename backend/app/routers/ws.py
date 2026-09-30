import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import User, Room, RoomMember
from ..auth import decode_access_token
from ..websocket_manager import manager

logger = logging.getLogger("websocket")
router = APIRouter(tags=["WebSocket"])


def _detect_language(filename: str) -> str:
    """Detect language from file extension."""
    ext_map = {
        "py": "python", "pyw": "python",
        "js": "javascript", "jsx": "javascript", "mjs": "javascript", "cjs": "javascript",
        "ts": "typescript", "tsx": "typescript",
        "c": "c", "h": "c",
        "cpp": "cpp", "cc": "cpp", "cxx": "cpp", "hpp": "cpp", "hxx": "cpp",
        "java": "java",
        "go": "go",
        "rs": "rust",
        "php": "php", "phtml": "php",
        "rb": "ruby",
        "cs": "csharp",
        "kt": "kotlin", "kts": "kotlin",
        "sh": "bash", "bash": "bash", "zsh": "bash",
        "html": "html", "htm": "html",
        "css": "css", "scss": "css", "sass": "css", "less": "css",
        "json": "json",
        "md": "markdown", "markdown": "markdown",
        "sql": "sql",
        "yaml": "yaml", "yml": "yaml",
        "xml": "xml", "svg": "xml",
    }
    parts = filename.rsplit(".", 1)
    if len(parts) < 2:
        return "plaintext"
    ext = parts[-1].lower()
    return ext_map.get(ext, "plaintext")


def _build_resync_payload(room_code: str, room_name: str, online_users: list) -> dict:
    """Build full room state for client resync from in-memory room store."""
    files = manager.get_room_files(room_code)
    messages = manager.get_room_messages(room_code, limit=100)
    return {
        "type": "resync",
        "room_code": room_code,
        "room_name": room_name,
        "files": files,
        "messages": messages,
        "online_users": online_users,
    }


@router.websocket("/ws/{room_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_code: str,
    token: str = Query(...)
):
    code_normalized = room_code.upper().strip()

    # 1. Authenticate Token
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid authentication token")
        return

    user_id = payload.get("sub")
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User not found")
            return

        # 2. Validate Room
        room = db.query(Room).filter(Room.room_code == code_normalized).first()
        if not room:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Room does not exist")
            return

        # 3. Ensure Room Membership in DB
        membership = db.query(RoomMember).filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == user.id
        ).first()
        if not membership:
            new_member = RoomMember(
                room_id=room.id,
                user_id=user.id,
                role="member"
            )
            db.add(new_member)
            db.commit()

        room_id = room.id
        room_name = room.name
        user_name = user.name or "Developer"

    finally:
        db.close()

    # Initialize live room files in memory if not already active
    manager.ensure_room_initialized(code_normalized)

    # Connect user to room
    await manager.connect(code_normalized, websocket, user_id, user_name)

    # Broadcast presence
    online_users = manager.get_online_users(code_normalized)
    await manager.broadcast_to_room(code_normalized, {
        "type": "presence_update",
        "room_code": code_normalized,
        "online_users": online_users,
        "event": "user_joined",
        "user": {"id": user_id, "name": user_name}
    })

    # Send initial welcome confirmation to the connecting user
    await manager.send_to_socket(websocket, {
        "type": "room_connected",
        "room_code": code_normalized,
        "room_name": room_name,
        "online_users": online_users,
        "user": {"id": user_id, "name": user_name}
    })

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
            except Exception:
                continue

            event_type = data.get("type")

            # CODE CHANGE EVENT — Monotonic Last-Write-Wins in memory (never hitting DB)
            if event_type == "code_change":
                file_id = data.get("file_id")
                content = data.get("content")
                if content is None:
                    content = ""

                if not file_id:
                    continue

                # Increment version monotonically
                new_version = manager.increment_file_version(code_normalized, file_id)
                event_id = manager.generate_event_id()

                # Update live in-memory room file
                manager.update_room_file(code_normalized, file_id, content=content, version=new_version)

                # Broadcast to other participants (exclude sender to prevent cursor jump/echo)
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "code_change",
                        "event_id": event_id,
                        "file_id": file_id,
                        "content": content,
                        "version": new_version,
                        "sender_id": user_id,
                        "sender_name": user_name,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    },
                    exclude_socket=websocket
                )

                # Send version ack to sender
                await manager.send_to_socket(websocket, {
                    "type": "version_ack",
                    "file_id": file_id,
                    "version": new_version,
                    "event_id": event_id,
                })

            # CURSOR MOVE EVENT
            elif event_type == "cursor_move":
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "cursor_move",
                        "file_id": data.get("file_id"),
                        "sender_id": user_id,
                        "sender_name": user_name,
                        "cursor": data.get("cursor"),  # {lineNumber, column}
                        "selection": data.get("selection")
                    },
                    exclude_socket=websocket
                )

            # CHAT MESSAGE EVENT
            elif event_type == "chat_message":
                msg_content = str(data.get("message", "")).strip()
                if msg_content and len(msg_content) <= 2000:
                    created_at_iso = datetime.now(timezone.utc).isoformat()
                    msg_id = manager.generate_event_id()

                    msg_obj = {
                        "id": msg_id,
                        "sender_id": user_id,
                        "sender_name": user_name,
                        "message": msg_content,
                        "timestamp": created_at_iso
                    }
                    manager.add_room_message(code_normalized, msg_obj)

                    # Broadcast to all members including sender
                    await manager.broadcast_to_room(
                        code_normalized,
                        {
                            "type": "chat_message",
                            **msg_obj
                        }
                    )

            # FILE CREATED BROADCAST
            elif event_type in ("file_created", "file_create"):
                file_data = data.get("file", data)
                if isinstance(file_data, dict) and file_data.get("name"):
                    added = manager.add_room_file(code_normalized, file_data)
                    file_data = added
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "file_created",
                        "file": file_data,
                        "sender_id": user_id,
                        "sender_name": user_name,
                        "event_id": manager.generate_event_id(),
                    },
                    exclude_socket=websocket
                )

            # FILE DELETED BROADCAST
            elif event_type in ("file_deleted", "file_delete"):
                file_data = data.get("file", data)
                file_id = file_data.get("id") or file_data.get("fileId") or data.get("file_id")
                if file_id:
                    manager.delete_room_file(code_normalized, file_id)
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "file_deleted",
                        "file": file_data,
                        "file_id": file_id,
                        "sender_id": user_id,
                        "sender_name": user_name,
                        "event_id": manager.generate_event_id(),
                    },
                    exclude_socket=websocket
                )

            # FILE RENAMED BROADCAST
            elif event_type in ("file_renamed", "file_rename"):
                file_data = data.get("file", data)
                file_id = file_data.get("id") or data.get("file_id")
                new_name = file_data.get("new_name") or file_data.get("name") or data.get("new_name")
                if file_id and new_name:
                    manager.update_room_file(code_normalized, file_id, name=new_name, language=_detect_language(new_name))
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "file_renamed",
                        "file": file_data,
                        "file_id": file_id,
                        "new_name": new_name,
                        "sender_id": user_id,
                        "sender_name": user_name,
                        "event_id": manager.generate_event_id(),
                    },
                    exclude_socket=websocket
                )

            # FILE UPDATED BROADCAST
            elif event_type in ("file_updated", "file_update"):
                file_data = data.get("file", data)
                file_id = file_data.get("id") or data.get("file_id")
                if file_id:
                    manager.update_room_file(
                        code_normalized,
                        file_id,
                        content=file_data.get("content"),
                        version=file_data.get("version")
                    )
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "file_updated",
                        "file": file_data,
                        "file_id": file_id,
                        "version": file_data.get("version") or data.get("version"),
                        "sender_id": user_id,
                        "sender_name": user_name,
                        "event_id": manager.generate_event_id(),
                    },
                    exclude_socket=websocket
                )

            # RESYNC REQUEST — client requests full state on reconnect
            elif event_type == "resync":
                resync_payload = _build_resync_payload(code_normalized, room_name, online_users)
                await manager.send_to_socket(websocket, resync_payload)

            # WEBRTC SIGNALING (offer, answer, candidate)
            elif event_type == "signal":
                target_user_id = data.get("target_user_id")
                signal_data = data.get("signal")
                payload_out = {
                    "type": "signal",
                    "sender_id": user_id,
                    "sender_name": user_name,
                    "signal": signal_data
                }
                if target_user_id:
                    await manager.send_to_user(code_normalized, target_user_id, payload_out)
                else:
                    await manager.broadcast_to_room(code_normalized, payload_out, exclude_socket=websocket)

            # CODE EXECUTION RESULT BROADCAST
            elif event_type == "execution_broadcast":
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "execution_broadcast",
                        "sender_id": user_id,
                        "sender_name": user_name,
                        "output": data.get("output"),
                        "status": data.get("status")
                    }
                )

            # PING / PONG
            elif event_type == "ping":
                await manager.send_to_socket(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(code_normalized, websocket)
        online_users = manager.get_online_users(code_normalized)
        await manager.broadcast_to_room(code_normalized, {
            "type": "presence_update",
            "room_code": code_normalized,
            "online_users": online_users,
            "event": "user_left",
            "user": {"id": user_id, "name": user_name}
        })
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(code_normalized, websocket)
