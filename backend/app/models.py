import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, Boolean, Index
from sqlalchemy.orm import relationship
from .database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    owned_rooms = relationship("Room", back_populates="owner", cascade="all, delete-orphan")
    memberships = relationship("RoomMember", back_populates="user", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="sender", cascade="all, delete-orphan")

class Room(Base):
    __tablename__ = "rooms"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    room_code = Column(String(20), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    owner_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    owner = relationship("User", back_populates="owned_rooms")
    members = relationship("RoomMember", back_populates="room", cascade="all, delete-orphan")
    files = relationship("ProjectFile", back_populates="room", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="room", cascade="all, delete-orphan")
    execution_logs = relationship("ExecutionLog", back_populates="room", cascade="all, delete-orphan")
    ai_conversations = relationship("AIConversation", back_populates="room", cascade="all, delete-orphan")

class RoomMember(Base):
    __tablename__ = "room_members"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), default="member") # "owner", "member", "viewer"
    joined_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    room = relationship("Room", back_populates="members")
    user = relationship("User", back_populates="memberships")

class ProjectFile(Base):
    __tablename__ = "files"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    parent_path = Column(String(500), default="", nullable=False)  # e.g. "src/utils"
    name = Column(String(255), nullable=False) # e.g. "main.py" or "src/utils/helpers.py"
    language = Column(String(50), default="python")
    content = Column(Text, default="")
    version = Column(Integer, default=1, nullable=False)
    is_binary = Column(Boolean, default=False, nullable=False)
    storage_ref = Column(String(500), nullable=True)  # For binary files: external storage path
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    __table_args__ = (
        Index("ix_files_room_name", "room_id", "name", unique=True),
    )

    # Relationships
    room = relationship("Room", back_populates="files")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    room = relationship("Room", back_populates="messages")
    sender = relationship("User", back_populates="messages")

class ExecutionLog(Base):
    __tablename__ = "execution_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_id = Column(String(36), nullable=True)
    status = Column(String(20), default="success") # "success", "error", "timeout"
    output = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    room = relationship("Room", back_populates="execution_logs")

class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), default="AI Chat")
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    room = relationship("Room", back_populates="ai_conversations")
    messages = relationship("AIMessage", back_populates="conversation", cascade="all, delete-orphan",
                            order_by="AIMessage.created_at")

class AIMessage(Base):
    __tablename__ = "ai_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    conversation_id = Column(String(36), ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # "user", "assistant", "tool"
    content = Column(Text, nullable=False)
    action = Column(String(50), nullable=True)  # "explain", "bug_detect", "chat", "agent", etc.
    model_used = Column(String(100), nullable=True)
    tool_calls = Column(Text, nullable=True)  # JSON serialized tool calls
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    conversation = relationship("AIConversation", back_populates="messages")
