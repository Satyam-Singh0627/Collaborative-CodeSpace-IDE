import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import User, Room, RoomMember, ProjectFile, Message
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


def _build_resync_payload(room: Room, db: Session, online_users: list) -> dict:
    """Build full room state for client resync."""
    files = db.query(ProjectFile).filter(ProjectFile.room_id == room.id).all()
    file_list = []
    for f in files:
        file_list.append({
            "id": f.id,
            "room_id": f.room_id,
            "name": f.name,
            "language": f.language,
            "content": f.content,
            "version": f.version,
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        })
    messages = (
        db.query(Message)
        .filter(Message.room_id == room.id)
        .order_by(Message.created_at.asc())
        .limit(100)
        .all()
    )
    msg_list = []
    for m in messages:
        u = db.query(User).filter(User.id == m.sender_id).first()
        msg_list.append({
            "id": m.id,
            "sender_id": m.sender_id,
            "sender_name": u.name if u else "Unknown",
            "message": m.message,
            "timestamp": m.created_at.isoformat() if m.created_at else None,
        })
    return {
        "type": "resync",
        "room_code": room.room_code,
        "room_name": room.name,
        "files": file_list,
        "messages": msg_list,
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

        # 3. Ensure Room Membership
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

        # Initialize file versions from DB if room is new to memory
        files = db.query(ProjectFile).filter(ProjectFile.room_id == room.id).all()
        for f in files:
            current_mem_ver = manager.get_file_version(code_normalized, f.id)
            if current_mem_ver < f.version:
                manager.set_file_version(code_normalized, f.id, f.version)

        room_id = room.id
        room_name = room.name

    finally:
        db.close()

    # Connect user to room
    await manager.connect(code_normalized, websocket, user_id, user.name)

    # Broadcast presence
    online_users = manager.get_online_users(code_normalized)
    await manager.broadcast_to_room(code_normalized, {
        "type": "presence_update",
        "room_code": code_normalized,
        "online_users": online_users,
        "event": "user_joined",
        "user": {"id": user_id, "name": user.name}
    })

    # Send initial welcome confirmation to the connecting user
    await manager.send_to_socket(websocket, {
        "type": "room_connected",
        "room_code": code_normalized,
        "room_name": room_name,
        "online_users": online_users,
        "user": {"id": user_id, "name": user.name}
    })

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
            except Exception:
                continue

            event_type = data.get("type")

            # CODE CHANGE EVENT — with versioning
            if event_type == "code_change":
                file_id = data.get("file_id")
                content = data.get("content", "")
                client_version = data.get("version", 0)

                if not file_id:
                    continue

                # Reject stale events
                if client_version > 0 and manager.is_stale_version(code_normalized, file_id, client_version):
                    await manager.send_to_socket(websocket, {
                        "type": "version_conflict",
                        "file_id": file_id,
                        "server_version": manager.get_file_version(code_normalized, file_id),
                        "client_version": client_version,
                    })
                    continue

                # Increment version
                new_version = manager.increment_file_version(code_normalized, file_id)
                event_id = manager.generate_event_id()

                # Persist content to DB asynchronously in fresh session
                try:
                    with SessionLocal() as file_db:
                        target_file = file_db.query(ProjectFile).filter(
                            ProjectFile.id == file_id,
                            ProjectFile.room_id == room_id
                        ).first()
                        if target_file:
                            # Only update if new version is greater
                            if new_version > target_file.version:
                                target_file.content = content
                                target_file.version = new_version
                                target_file.updated_by = user_id
                                file_db.commit()
                except Exception as e:
                    logger.error(f"Failed to persist file {file_id}: {e}")

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
                        "sender_name": user.name,
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
                        "sender_name": user.name,
                        "cursor": data.get("cursor"), # {lineNumber, column}
                        "selection": data.get("selection")
                    },
                    exclude_socket=websocket
                )

            # CHAT MESSAGE EVENT
            elif event_type == "chat_message":
                msg_content = str(data.get("message", "")).strip()
                if msg_content and len(msg_content) <= 2000:
                    with SessionLocal() as chat_db:
                        new_msg = Message(
                            room_id=room_id,
                            sender_id=user_id,
                            message=msg_content
                        )
                        chat_db.add(new_msg)
                        chat_db.commit()
                        chat_db.refresh(new_msg)
                        created_at_iso = new_msg.created_at.isoformat()
                        msg_id = new_msg.id

                    # Broadcast to all members including sender
                    await manager.broadcast_to_room(
                        code_normalized,
                        {
                            "type": "chat_message",
                            "id": msg_id,
                            "sender_id": user_id,
                            "sender_name": user.name,
                            "message": msg_content,
                            "timestamp": created_at_iso
                        }
                    )

            # FILE CREATED BROADCAST
            elif event_type in ("file_created", "file_create"):
                file_data = data.get("file", data)
                if isinstance(file_data, dict) and file_data.get("id"):
                    manager.set_file_version(code_normalized, file_data["id"], file_data.get("version", 1))
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "file_created",
                        "file": file_data,
                        "sender_id": user_id,
                        "sender_name": user.name,
                        "event_id": manager.generate_event_id(),
                    },
                    exclude_socket=websocket
                )

            # FILE DELETED BROADCAST
            elif event_type in ("file_deleted", "file_delete"):
                file_data = data.get("file", data)
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "file_deleted",
                        "file": file_data,
                        "file_id": file_data.get("id") or data.get("file_id"),
                        "sender_id": user_id,
                        "sender_name": user.name,
                        "event_id": manager.generate_event_id(),
                    },
                    exclude_socket=websocket
                )

            # FILE RENAMED BROADCAST
            elif event_type in ("file_renamed", "file_rename"):
                file_data = data.get("file", data)
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "file_renamed",
                        "file": file_data,
                        "file_id": file_data.get("id") or data.get("file_id"),
                        "new_name": file_data.get("new_name") or file_data.get("name") or data.get("new_name"),
                        "sender_id": user_id,
                        "sender_name": user.name,
                        "event_id": manager.generate_event_id(),
                    },
                    exclude_socket=websocket
                )

            # FILE UPDATED BROADCAST
            elif event_type in ("file_updated", "file_update"):
                file_data = data.get("file", data)
                if isinstance(file_data, dict) and file_data.get("id"):
                    manager.set_file_version(code_normalized, file_data["id"], file_data.get("version", 1))
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "file_updated",
                        "file": file_data,
                        "file_id": file_data.get("id") or data.get("file_id"),
                        "version": file_data.get("version") or data.get("version"),
                        "sender_id": user_id,
                        "sender_name": user.name,
                        "event_id": manager.generate_event_id(),
                    },
                    exclude_socket=websocket
                )

            # RESYNC REQUEST — client requests full state on reconnect
            elif event_type == "resync":
                with SessionLocal() as resync_db:
                    resync_room = resync_db.query(Room).filter(Room.room_code == code_normalized).first()
                    if resync_room:
                        online_users = manager.get_online_users(code_normalized)
                        resync_payload = _build_resync_payload(resync_room, resync_db, online_users)
                        await manager.send_to_socket(websocket, resync_payload)

            # WEBRTC SIGNALING (offer, answer, candidate)
            elif event_type == "signal":
                target_user_id = data.get("target_user_id")
                signal_data = data.get("signal")
                payload_out = {
                    "type": "signal",
                    "sender_id": user_id,
                    "sender_name": user.name,
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
                        "sender_name": user.name,
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
            "user": {"id": user_id, "name": user.name}
        })
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(code_normalized, websocket)
