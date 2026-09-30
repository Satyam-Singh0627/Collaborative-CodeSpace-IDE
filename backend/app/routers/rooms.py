import random
import string
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Room, RoomMember
from ..schemas import (
    RoomCreate, RoomResponse, RoomMemberResponse,
    FileCreate, FileUpdate, FileResponse,
    MessageResponse
)
from ..auth import get_current_user
from ..websocket_manager import manager, INITIAL_STARTER_FILES

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])

# Extension -> language key mapping
_EXT_LANG_MAP = {
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


def _detect_language(filename: str) -> str:
    """Auto-detect language from file extension."""
    parts = filename.rsplit(".", 1)
    if len(parts) < 2:
        return "plaintext"
    ext = parts[-1].lower()
    return _EXT_LANG_MAP.get(ext, "plaintext")


def generate_room_code() -> str:
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(random.choices(chars, k=4))
    return f"ROOM-{suffix}"


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
def create_room(
    room_in: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Generate unique room code
    for _ in range(10):
        code = generate_room_code()
        if not db.query(Room).filter(Room.room_code == code).first():
            break
    else:
        code = f"ROOM-{int(datetime.now(timezone.utc).timestamp()) % 10000:04d}"

    room = Room(
        room_code=code,
        name=room_in.name.strip(),
        owner_id=current_user.id
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    # Add owner as first member
    owner_member = RoomMember(
        room_id=room.id,
        user_id=current_user.id,
        role="owner"
    )
    db.add(owner_member)
    db.commit()
    db.refresh(owner_member)

    # Initialize live starter files in in-memory room store (not permanent DB)
    manager.ensure_room_initialized(room.room_code, INITIAL_STARTER_FILES)

    return RoomResponse(
        id=room.id,
        room_code=room.room_code,
        name=room.name,
        owner_id=room.owner_id,
        created_at=room.created_at,
        member_count=1,
        members=[
            RoomMemberResponse(
                user_id=current_user.id,
                name=current_user.name,
                email=current_user.email,
                role="owner",
                joined_at=owner_member.joined_at
            )
        ]
    )


@router.get("/{room_code}", response_model=RoomResponse)
def get_room(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code_normalized = room_code.upper().strip()
    room = db.query(Room).filter(Room.room_code == code_normalized).first()
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found. Check the room ID and try again."
        )

    # Ensure in-memory room files are initialized
    manager.ensure_room_initialized(code_normalized)

    members = db.query(RoomMember).filter(RoomMember.room_id == room.id).all()
    member_responses = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            member_responses.append(RoomMemberResponse(
                user_id=u.id,
                name=u.name,
                email=u.email,
                role=m.role,
                joined_at=m.joined_at
            ))

    return RoomResponse(
        id=room.id,
        room_code=room.room_code,
        name=room.name,
        owner_id=room.owner_id,
        created_at=room.created_at,
        member_count=len(member_responses),
        members=member_responses
    )


@router.post("/{room_code}/join", response_model=RoomResponse)
def join_room(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code_normalized = room_code.upper().strip()
    room = db.query(Room).filter(Room.room_code == code_normalized).first()
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found. Check the room ID and try again."
        )

    # Check if already a member — prevent duplicate membership
    membership = db.query(RoomMember).filter(
        RoomMember.room_id == room.id,
        RoomMember.user_id == current_user.id
    ).first()

    if not membership:
        new_member = RoomMember(
            room_id=room.id,
            user_id=current_user.id,
            role="member"
        )
        db.add(new_member)
        db.commit()

    return get_room(room_code, current_user, db)


# -----------------------------------------------------------------------------
# File Management Endpoints (Operates on in-memory room store, not permanent DB)
# -----------------------------------------------------------------------------
@router.get("/{room_code}/files", response_model=List[FileResponse])
def get_room_files(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code_normalized = room_code.upper().strip()
    room = db.query(Room).filter(Room.room_code == code_normalized).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    files = manager.get_room_files(code_normalized)
    return [
        FileResponse(
            id=f["id"],
            room_id=room.id,
            name=f["name"],
            language=f.get("language") or "plaintext",
            content=f.get("content") or "",
            version=f.get("version", 1),
            updated_at=datetime.fromisoformat(f["updated_at"]) if isinstance(f.get("updated_at"), str) else datetime.now(timezone.utc)
        )
        for f in files
    ]


@router.post("/{room_code}/files", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
def create_room_file(
    room_code: str,
    file_in: FileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code_normalized = room_code.upper().strip()
    room = db.query(Room).filter(Room.room_code == code_normalized).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    clean_name = file_in.name.strip()
    existing = manager.get_room_file_by_name(code_normalized, clean_name)
    if existing:
        raise HTTPException(status_code=400, detail="A file with this name already exists in the room.")

    language = file_in.language or _detect_language(clean_name)
    new_file = manager.add_room_file(code_normalized, {
        "name": clean_name,
        "language": language,
        "content": file_in.content or "",
        "version": 1,
    })

    return FileResponse(
        id=new_file["id"],
        room_id=room.id,
        name=new_file["name"],
        language=new_file["language"],
        content=new_file["content"],
        version=new_file["version"],
        updated_at=datetime.fromisoformat(new_file["updated_at"]) if isinstance(new_file.get("updated_at"), str) else datetime.now(timezone.utc)
    )


@router.put("/{room_code}/files/{file_id}", response_model=FileResponse)
def update_room_file(
    room_code: str,
    file_id: str,
    file_in: FileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code_normalized = room_code.upper().strip()
    room = db.query(Room).filter(Room.room_code == code_normalized).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    p_file = manager.get_room_file(code_normalized, file_id)
    if not p_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Optimistic concurrency check
    if file_in.version is not None and file_in.version < p_file["version"]:
        raise HTTPException(
            status_code=409,
            detail=f"Version conflict: server has v{p_file['version']}, you sent v{file_in.version}"
        )

    clean_name = file_in.name.strip() if file_in.name is not None else None
    language = file_in.language
    if clean_name and not language:
        language = _detect_language(clean_name)

    updated = manager.update_room_file(
        code_normalized,
        file_id,
        content=file_in.content,
        name=clean_name,
        language=language,
        version=file_in.version + 1 if file_in.version is not None else None
    )

    return FileResponse(
        id=updated["id"],
        room_id=room.id,
        name=updated["name"],
        language=updated["language"],
        content=updated["content"],
        version=updated["version"],
        updated_at=datetime.fromisoformat(updated["updated_at"]) if isinstance(updated.get("updated_at"), str) else datetime.now(timezone.utc)
    )


@router.delete("/{room_code}/files/{file_id}")
def delete_room_file(
    room_code: str,
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code_normalized = room_code.upper().strip()
    room = db.query(Room).filter(Room.room_code == code_normalized).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    p_file = manager.get_room_file(code_normalized, file_id)
    if not p_file:
        raise HTTPException(status_code=404, detail="File not found")

    file_name = p_file["name"]
    manager.delete_room_file(code_normalized, file_id)
    return {"status": "success", "message": f"File '{file_name}' deleted successfully."}


@router.get("/{room_code}/messages", response_model=List[MessageResponse])
def get_room_messages(
    room_code: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code_normalized = room_code.upper().strip()
    room = db.query(Room).filter(Room.room_code == code_normalized).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    msgs = manager.get_room_messages(code_normalized, limit)
    result = []
    for m in msgs:
        result.append(MessageResponse(
            id=m.get("id") or str(uuid.uuid4()),
            room_id=room.id,
            sender_id=m.get("sender_id") or "system",
            sender_name=m.get("sender_name") or "User",
            message=m.get("message") or "",
            created_at=datetime.fromisoformat(m["timestamp"]) if isinstance(m.get("timestamp"), str) else datetime.now(timezone.utc)
        ))
    return result
