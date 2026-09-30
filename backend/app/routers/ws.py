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

        # Connect user to room
        await manager.connect(code_normalized, websocket, user.id, user.name)

        # Broadcast presence
        online_users = manager.get_online_users(code_normalized)
        await manager.broadcast_to_room(code_normalized, {
            "type": "presence_update",
            "room_code": code_normalized,
            "online_users": online_users,
            "event": "user_joined",
            "user": {"id": user.id, "name": user.name}
        })

        # Send initial welcome confirmation to the connecting user
        await websocket.send_text(json.dumps({
            "type": "room_connected",
            "room_code": code_normalized,
            "room_name": room.name,
            "online_users": online_users,
            "user": {"id": user.id, "name": user.name}
        }))

    finally:
        db.close()

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
            except Exception:
                continue

            event_type = data.get("type")

            # CODE CHANGE EVENT
            if event_type == "code_change":
                file_id = data.get("file_id")
                content = data.get("content", "")
                
                # Persist content to DB asynchronously in fresh session
                if file_id:
                    with SessionLocal() as file_db:
                        target_file = file_db.query(ProjectFile).filter(
                            ProjectFile.id == file_id,
                            ProjectFile.room_id == room.id
                        ).first()
                        if target_file:
                            target_file.content = content
                            file_db.commit()

                # Broadcast to other participants (exclude sender to prevent cursor jump/echo)
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "code_change",
                        "file_id": file_id,
                        "content": content,
                        "sender_id": user.id,
                        "sender_name": user.name,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    },
                    exclude_socket=websocket
                )

            # CURSOR MOVE EVENT
            elif event_type == "cursor_move":
                await manager.broadcast_to_room(
                    code_normalized,
                    {
                        "type": "cursor_move",
                        "file_id": data.get("file_id"),
                        "sender_id": user.id,
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
                            room_id=room.id,
                            sender_id=user.id,
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
                            "sender_id": user.id,
                            "sender_name": user.name,
                            "message": msg_content,
                            "timestamp": created_at_iso
                        }
                    )

            # FILE CREATED / RENAMED / DELETED BROADCAST
            elif event_type in ["file_created", "file_deleted", "file_renamed"]:
                await manager.broadcast_to_room(
                    code_normalized,
                    data,
                    exclude_socket=websocket
                )

            # WEBRTC SIGNALING (offer, answer, candidate)
            elif event_type == "signal":
                target_user_id = data.get("target_user_id")
                signal_data = data.get("signal")
                payload_out = {
                    "type": "signal",
                    "sender_id": user.id,
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
                        "sender_id": user.id,
                        "sender_name": user.name,
                        "output": data.get("output"),
                        "status": data.get("status")
                    }
                )

            # PING / PONG
            elif event_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        manager.disconnect(code_normalized, websocket)
        online_users = manager.get_online_users(code_normalized)
        await manager.broadcast_to_room(code_normalized, {
            "type": "presence_update",
            "room_code": code_normalized,
            "online_users": online_users,
            "event": "user_left",
            "user": {"id": user.id, "name": user.name}
        })
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(code_normalized, websocket)
