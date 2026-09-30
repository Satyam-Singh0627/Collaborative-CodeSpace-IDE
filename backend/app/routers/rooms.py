import random
import string
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Room, RoomMember, ProjectFile, Message
from ..schemas import (
    RoomCreate, RoomResponse, RoomMemberResponse,
    FileCreate, FileUpdate, FileResponse,
    MessageResponse
)
from ..auth import get_current_user

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
        code = f"ROOM-{int(datetime.now().timestamp()) % 10000:04d}"

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

    # Seed initial project files
    for item in INITIAL_STARTER_FILES:
        p_file = ProjectFile(
            room_id=room.id,
            name=item["name"],
            language=item["language"],
            content=item["content"],
            version=1,
            created_by=current_user.id,
            updated_by=current_user.id,
        )
        db.add(p_file)

    db.commit()
    db.refresh(room)

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

    # Verify or add membership
    membership = db.query(RoomMember).filter(
        RoomMember.room_id == room.id,
        RoomMember.user_id == current_user.id
    ).first()

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

    # Check if already a member
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

# File Management Endpoints
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

    files = db.query(ProjectFile).filter(ProjectFile.room_id == room.id).all()
    return files

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

    # Check for duplicate file name in same room
    clean_name = file_in.name.strip()
    existing = db.query(ProjectFile).filter(
        ProjectFile.room_id == room.id,
        ProjectFile.name == clean_name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A file with this name already exists in the room.")

    # Auto-detect language from extension if not provided
    language = file_in.language
    if not language:
        language = _detect_language(clean_name)

    # Extract parent path
    parts = clean_name.rsplit("/", 1)
    parent_path = parts[0] if len(parts) > 1 else ""

    new_file = ProjectFile(
        room_id=room.id,
        name=clean_name,
        parent_path=parent_path,
        language=language,
        content=file_in.content or "",
        version=1,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)
    return new_file

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

    p_file = db.query(ProjectFile).filter(
        ProjectFile.id == file_id,
        ProjectFile.room_id == room.id
    ).first()
    if not p_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Optimistic concurrency check
    if file_in.version is not None and file_in.version < p_file.version:
        raise HTTPException(
            status_code=409,
            detail=f"Version conflict: server has v{p_file.version}, you sent v{file_in.version}"
        )

    if file_in.name is not None:
        clean_name = file_in.name.strip()
        p_file.name = clean_name
        # Auto-detect language on rename
        p_file.language = _detect_language(clean_name)
        # Update parent path
        parts = clean_name.rsplit("/", 1)
        p_file.parent_path = parts[0] if len(parts) > 1 else ""

    if file_in.language is not None:
        p_file.language = file_in.language
    if file_in.content is not None:
        p_file.content = file_in.content

    p_file.version += 1
    p_file.updated_by = current_user.id

    db.commit()
    db.refresh(p_file)
    return p_file

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

    p_file = db.query(ProjectFile).filter(
        ProjectFile.id == file_id,
        ProjectFile.room_id == room.id
    ).first()
    if not p_file:
        raise HTTPException(status_code=404, detail="File not found")

    file_name = p_file.name
    db.delete(p_file)
    db.commit()
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

    msgs = (
        db.query(Message)
        .filter(Message.room_id == room.id)
        .order_by(Message.created_at.asc())
        .limit(limit)
        .all()
    )

    result = []
    for m in msgs:
        u = db.query(User).filter(User.id == m.sender_id).first()
        result.append(MessageResponse(
            id=m.id,
            room_id=m.room_id,
            sender_id=m.sender_id,
            sender_name=u.name if u else "Unknown",
            message=m.message,
            created_at=m.created_at
        ))
    return result
