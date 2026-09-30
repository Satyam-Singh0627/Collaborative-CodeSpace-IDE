"""
AI Agent Service — Tool-use mode for workspace operations.

The agent can list, read, create, update, delete, and rename files,
run code, inspect execution output, and debug files.
Every file operation goes through the same DB/file service so all
WebSocket collaborators see changes in real-time.
"""
import json
import logging
import re
from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Room
from ..websocket_manager import manager

logger = logging.getLogger("ai_agent")

# Extension -> language key mapping (same as rooms.py)
_EXT_LANG_MAP = {
    "py": "python", "pyw": "python",
    "js": "javascript", "jsx": "javascript", "mjs": "javascript",
    "ts": "typescript", "tsx": "typescript",
    "c": "c", "h": "c",
    "cpp": "cpp", "cc": "cpp", "cxx": "cpp", "hpp": "cpp",
    "java": "java", "go": "go", "rs": "rust",
    "php": "php", "rb": "ruby", "cs": "csharp",
    "kt": "kotlin", "kts": "kotlin",
    "sh": "bash", "bash": "bash",
    "html": "html", "htm": "html",
    "css": "css", "scss": "css",
    "json": "json", "md": "markdown",
    "sql": "sql", "yaml": "yaml", "yml": "yaml",
    "xml": "xml", "svg": "xml",
}


def _detect_language(filename: str) -> str:
    parts = filename.rsplit(".", 1)
    if len(parts) < 2:
        return "plaintext"
    return _EXT_LANG_MAP.get(parts[-1].lower(), "plaintext")


def _resolve_room_code(room_id: str, db: Session, room_code: str = "") -> str:
    if room_code:
        return room_code.upper().strip()
    room = db.query(Room).filter((Room.id == room_id) | (Room.room_code == room_id)).first()
    if room:
        return room.room_code
    return room_id.upper().strip()


# ---------------------------------------------------------------------------
# Tool implementations — each receives db session + room context
# ---------------------------------------------------------------------------

def tool_list_files(room_id: str, db: Session, room_code: str = "", **kwargs) -> str:
    """List all files in the room."""
    code = _resolve_room_code(room_id, db, room_code)
    files = manager.get_room_files(code)
    if not files:
        return "No files found in this room."
    lines = [f"- {f['name']} ({f.get('language', 'plaintext')}, v{f.get('version', 1)})" for f in files]
    return "Files in room:\n" + "\n".join(lines)


def tool_read_file(room_id: str, db: Session, *, filename: str, room_code: str = "", **kwargs) -> str:
    """Read the content of a specific file."""
    code = _resolve_room_code(room_id, db, room_code)
    f = manager.get_room_file_by_name(code, filename)
    if not f:
        return f"Error: File '{filename}' not found."
    return f"=== {f['name']} (v{f.get('version', 1)}, {f.get('language', 'plaintext')}) ===\n{f.get('content', '')}"


def tool_create_file(room_id: str, db: Session, *, filename: str, content: str = "",
                     user_id: str = "", room_code: str = "", **kwargs) -> str:
    """Create a new file in the room."""
    code = _resolve_room_code(room_id, db, room_code)
    existing = manager.get_room_file_by_name(code, filename)
    if existing:
        return f"Error: File '{filename}' already exists. Use update_file to modify it."

    language = _detect_language(filename)
    new_file = manager.add_room_file(code, {
        "name": filename,
        "language": language,
        "content": content,
    })

    # Broadcast via WebSocket
    if code:
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(manager.broadcast_to_room(code, {
                    "type": "file_created",
                    "file": new_file,
                    "sender_id": "ai-agent",
                    "sender_name": "AI Agent",
                    "event_id": manager.generate_event_id(),
                }))
        except Exception as e:
            logger.warning(f"Failed to broadcast file_created: {e}")

    return f"Created file '{filename}' ({language}, v1)"


def tool_update_file(room_id: str, db: Session, *, filename: str, content: str,
                     user_id: str = "", room_code: str = "", **kwargs) -> str:
    """Update the content of an existing file."""
    code = _resolve_room_code(room_id, db, room_code)
    f = manager.get_room_file_by_name(code, filename)
    if not f:
        return f"Error: File '{filename}' not found. Use create_file to create it first."

    updated = manager.update_room_file(code, f["id"], content=content)
    new_version = updated["version"]

    # Broadcast via WebSocket
    if code:
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(manager.broadcast_to_room(code, {
                    "type": "code_change",
                    "event_id": manager.generate_event_id(),
                    "file_id": f["id"],
                    "content": content,
                    "version": new_version,
                    "sender_id": "ai-agent",
                    "sender_name": "AI Agent",
                }))
        except Exception as e:
            logger.warning(f"Failed to broadcast code_change: {e}")

    return f"Updated file '{filename}' to v{new_version}"


def tool_delete_file(room_id: str, db: Session, *, filename: str,
                     room_code: str = "", **kwargs) -> str:
    """Delete a file from the room."""
    code = _resolve_room_code(room_id, db, room_code)
    f = manager.get_room_file_by_name(code, filename)
    if not f:
        return f"Error: File '{filename}' not found."

    file_id = f["id"]
    manager.delete_room_file(code, file_id)

    if code:
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(manager.broadcast_to_room(code, {
                    "type": "file_deleted",
                    "file": {"fileId": file_id, "name": filename},
                    "sender_id": "ai-agent",
                    "sender_name": "AI Agent",
                    "event_id": manager.generate_event_id(),
                }))
        except Exception as e:
            logger.warning(f"Failed to broadcast file_deleted: {e}")

    return f"Deleted file '{filename}'"


def tool_rename_file(room_id: str, db: Session, *, old_name: str, new_name: str,
                     user_id: str = "", room_code: str = "", **kwargs) -> str:
    """Rename a file."""
    code = _resolve_room_code(room_id, db, room_code)
    f = manager.get_room_file_by_name(code, old_name)
    if not f:
        return f"Error: File '{old_name}' not found."

    # Check if new name already exists
    existing = manager.get_room_file_by_name(code, new_name)
    if existing:
        return f"Error: File '{new_name}' already exists."

    lang = _detect_language(new_name)
    updated = manager.update_room_file(code, f["id"], name=new_name, language=lang)

    if code:
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(manager.broadcast_to_room(code, {
                    "type": "file_renamed",
                    "file": updated,
                    "sender_id": "ai-agent",
                    "sender_name": "AI Agent",
                    "event_id": manager.generate_event_id(),
                }))
        except Exception as e:
            logger.warning(f"Failed to broadcast file_renamed: {e}")

    return f"Renamed '{old_name}' to '{new_name}' ({lang})"


# ---------------------------------------------------------------------------
# Tool registry
# ---------------------------------------------------------------------------

TOOL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "list_files": {
        "fn": tool_list_files,
        "description": "List all files in the current room workspace.",
        "params": {},
    },
    "read_file": {
        "fn": tool_read_file,
        "description": "Read the content of a specific file.",
        "params": {"filename": "The name/path of the file to read."},
    },
    "create_file": {
        "fn": tool_create_file,
        "description": "Create a new file with the given content.",
        "params": {
            "filename": "The name/path of the file to create (e.g. 'calculator.py').",
            "content": "The full content of the new file.",
        },
    },
    "update_file": {
        "fn": tool_update_file,
        "description": "Update/overwrite an existing file with new content.",
        "params": {
            "filename": "The name/path of the file to update.",
            "content": "The new full content for the file.",
        },
    },
    "delete_file": {
        "fn": tool_delete_file,
        "description": "Delete a file from the workspace.",
        "params": {"filename": "The name/path of the file to delete."},
    },
    "rename_file": {
        "fn": tool_rename_file,
        "description": "Rename a file.",
        "params": {
            "old_name": "Current file name/path.",
            "new_name": "New file name/path.",
        },
    },
    "run_code": {
        "fn": None,  # Handled specially via execution provider
        "description": "Execute a file in the sandbox and get the output.",
        "params": {"filename": "The name of the file to execute."},
    },
    "debug_file": {
        "fn": None,  # Multi-step: read -> run -> analyze -> fix -> rerun
        "description": "Debug a file: read it, run it, analyze errors, fix the code, and rerun.",
        "params": {"filename": "The name of the file to debug."},
    },
}


def build_tool_descriptions() -> str:
    """Build tool descriptions for the system prompt."""
    lines = []
    for name, info in TOOL_REGISTRY.items():
        params_desc = ", ".join(f"{k}: {v}" for k, v in info["params"].items())
        lines.append(f"- {name}({params_desc}): {info['description']}")
    return "\n".join(lines)


def build_agent_system_prompt(room_files: List[str]) -> str:
    """Build the system prompt for the AI agent."""
    tools_desc = build_tool_descriptions()
    file_list = "\n".join(f"  - {f}" for f in room_files) if room_files else "  (no files yet)"

    return f"""You are an expert AI coding agent integrated into a collaborative IDE workspace.
You have access to tools that can operate on the workspace files. When the user asks you to create,
modify, debug, or analyze code, you MUST use the appropriate tools.

AVAILABLE TOOLS:
{tools_desc}

CURRENT WORKSPACE FILES:
{file_list}

RESPONSE FORMAT:
You must respond with a JSON object containing:
{{
  "thoughts": "Your reasoning about what to do",
  "tool_calls": [
    {{"tool": "tool_name", "args": {{"param1": "value1", ...}}}},
    ...
  ],
  "response": "Your natural language response to the user after performing actions"
}}

If you don't need to call any tools, set tool_calls to an empty array [].

IMPORTANT RULES:
1. When asked to "create a Python calculator", you MUST call create_file with appropriate code.
2. When asked to "debug this code", you MUST: read the file, run it, analyze the error, fix it via update_file, then run again.
3. Always provide COMPLETE file content in create_file and update_file — no partial snippets.
4. For debugging, follow this sequence: read_file -> run_code -> analyze error -> update_file -> run_code -> report result.
5. Return clean, working code. Don't include markdown fences inside file content.
"""


def parse_agent_response(text: str) -> Dict[str, Any]:
    """Parse the agent's JSON response, with fallback for malformed output."""
    # Try to extract JSON from the response
    text = text.strip()

    # Try direct JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON block in markdown
    json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try to find anything that looks like a JSON object
    brace_match = re.search(r'\{.*\}', text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    # Fallback: treat entire text as a chat response with no tool calls
    return {
        "thoughts": "",
        "tool_calls": [],
        "response": text,
    }


async def execute_agent_tools(
    parsed: Dict[str, Any],
    room_id: str,
    room_code: str,
    user_id: str,
    execution_fn=None,
) -> tuple[List[Dict[str, Any]], List[str]]:
    """Execute parsed tool calls and return results + list of modified files."""
    tool_calls = parsed.get("tool_calls", [])
    results = []
    files_modified = []

    db: Session = SessionLocal()
    try:
        for call in tool_calls:
            tool_name = call.get("tool", "")
            args = call.get("args", {})

            if tool_name in ("list_files", "read_file", "create_file", "update_file",
                             "delete_file", "rename_file"):
                tool_info = TOOL_REGISTRY.get(tool_name)
                if tool_info and tool_info["fn"]:
                    result = tool_info["fn"](
                        room_id, db,
                        user_id=user_id,
                        room_code=room_code,
                        **args,
                    )
                    results.append({"tool": tool_name, "args": args, "result": result})

                    # Track modified files
                    if tool_name in ("create_file", "update_file"):
                        files_modified.append(args.get("filename", ""))
                    elif tool_name == "rename_file":
                        files_modified.append(args.get("new_name", ""))
                    elif tool_name == "delete_file":
                        files_modified.append(args.get("filename", ""))

            elif tool_name == "run_code":
                filename = args.get("filename", "")
                if execution_fn and filename:
                    code = _resolve_room_code(room_id, db, room_code)
                    f = manager.get_room_file_by_name(code, filename)
                    if f:
                        exec_result = await execution_fn(f.get("language", "python"), f["name"], f.get("content", ""))
                        results.append({
                            "tool": "run_code",
                            "args": args,
                            "result": f"Execution result ({exec_result.get('status', 'unknown')}):\n{exec_result.get('output', '')}",
                        })
                    else:
                        results.append({
                            "tool": "run_code",
                            "args": args,
                            "result": f"Error: File '{filename}' not found.",
                        })
                else:
                    results.append({
                        "tool": "run_code",
                        "args": args,
                        "result": "Error: Execution not available.",
                    })

            elif tool_name == "debug_file":
                # Multi-step debug: handled by the outer agent loop
                results.append({
                    "tool": "debug_file",
                    "args": args,
                    "result": "Debug flow initiated — agent will use read_file, run_code, update_file sequentially.",
                })

            else:
                results.append({
                    "tool": tool_name,
                    "args": args,
                    "result": f"Unknown tool: {tool_name}",
                })
    finally:
        db.close()

    return results, files_modified


def execute_tool(
    tool_name: str,
    room_id: str,
    db: Session,
    user_id: str = "",
    room_code: str = "",
    **kwargs
) -> str:
    """Execute a single workspace tool by name with exception resilience."""
    tool_info = TOOL_REGISTRY.get(tool_name)
    if not tool_info or not tool_info.get("fn"):
        return f"Unknown tool: {tool_name}"
    try:
        return tool_info["fn"](room_id, db, user_id=user_id, room_code=room_code, **kwargs)
    except Exception as exc:
        logger.error(f"Error executing tool {tool_name}: {exc}", exc_info=True)
        return f"Error executing {tool_name}: {str(exc)}"
