from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

# User Schemas
class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=6, max_length=100)

class UserLogin(BaseModel):
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Room Schemas
class RoomCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None

class RoomMemberResponse(BaseModel):
    user_id: str
    name: str
    email: str
    role: str
    joined_at: datetime

class RoomResponse(BaseModel):
    id: str
    room_code: str
    name: str
    owner_id: str
    created_at: datetime
    member_count: Optional[int] = 0
    members: Optional[List[RoomMemberResponse]] = []

    class Config:
        from_attributes = True

class RoomJoin(BaseModel):
    room_code: str = Field(..., min_length=4, max_length=20)

# File Schemas
class FileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    language: Optional[str] = None  # Auto-detected from extension if None
    content: Optional[str] = ""

class FileUpdate(BaseModel):
    name: Optional[str] = None
    language: Optional[str] = None
    content: Optional[str] = None
    version: Optional[int] = None  # For optimistic concurrency — client sends its version

class FileResponse(BaseModel):
    id: str
    room_id: str
    name: str
    language: str
    content: str
    version: int
    updated_at: datetime

    class Config:
        from_attributes = True

# Message Schemas
class MessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)

class MessageResponse(BaseModel):
    id: str
    room_id: str
    sender_id: str
    sender_name: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True

# Code Execution Schemas
class ProjectFilePayload(BaseModel):
    name: str
    content: str

class CodeRunRequest(BaseModel):
    code: Optional[str] = Field(None, max_length=50000)
    language: str = "python"
    stdin: Optional[str] = ""
    files: Optional[List[ProjectFilePayload]] = None
    entry_file: Optional[str] = None

class CodeRunResponse(BaseModel):
    status: str  # "success", "error", "timeout", "compile_error"
    output: str
    execution_time: float  # seconds

# AI Assistant Schemas
class AIChatMessage(BaseModel):
    role: str = "user"  # "user" or "assistant"
    content: str

class AIRequest(BaseModel):
    action: str = Field(..., description="'explain', 'bug_detect', 'improve', 'generate', or 'chat'")
    code: str = Field("", max_length=50000)
    language: Optional[str] = "python"
    file_name: Optional[str] = None
    prompt: Optional[str] = ""
    error_output: Optional[str] = ""
    project_files: Optional[List[str]] = None
    chat_history: Optional[List[AIChatMessage]] = None

class AIResponse(BaseModel):
    action: str
    result: str
    model_used: str

class AICompletionRequest(BaseModel):
    code_before: str = Field(..., max_length=12000)
    code_after: str = Field("", max_length=6000)
    language: str = "python"
    file_name: str = ""

class AICompletionResponse(BaseModel):
    completion: str
    model_used: str

# AI Agent Schemas (tool-use / agentic mode)
class AIAgentRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=5000)
    room_code: str = Field(..., min_length=4, max_length=20)
    active_file: Optional[str] = None
    chat_history: Optional[List[AIChatMessage]] = None

class AIToolCall(BaseModel):
    tool: str
    args: dict
    result: Optional[str] = None

class AIAgentStep(BaseModel):
    thought: Optional[str] = None
    tool_calls: List[AIToolCall] = []
    response: Optional[str] = None

class AIAgentResponse(BaseModel):
    steps: List[AIAgentStep]
    final_response: str
    model_used: str
    files_modified: List[str] = []
