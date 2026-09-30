import sys
import os
import re
import time
import base64
import tempfile
import subprocess
import shutil
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends
import httpx

from ..models import User
from ..schemas import CodeRunRequest, CodeRunResponse
from ..auth import get_current_user

logger = logging.getLogger("execution")
router = APIRouter(prefix="/api/execute", tags=["Code Execution"])

TIMEOUT_SECONDS = 10
MAX_OUTPUT_LENGTH = 12000

# Judge0 Community Edition endpoint (public, reliable, 70+ languages)
JUDGE0_API_URL = "https://ce.judge0.com/submissions?wait=true&base64_encoded=true"

# ---------------------------------------------------------------------------
# Language Registry — mapping languages to local commands and Judge0 IDs
# ---------------------------------------------------------------------------
LANGUAGE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "python": {
        "name": "Python",
        "ext": ".py",
        "judge0_id": 71,  # Python 3
        "entry_default": "main.py",
        "local_cmd": lambda p: [sys.executable, str(p)],
    },
    "javascript": {
        "name": "JavaScript",
        "ext": ".js",
        "judge0_id": 63,  # Node.js
        "entry_default": "index.js",
        "local_cmd": lambda p: ["node", str(p)] if shutil.which("node") else None,
    },
    "typescript": {
        "name": "TypeScript",
        "ext": ".ts",
        "judge0_id": 74,  # TypeScript
        "entry_default": "index.ts",
    },
    "c": {
        "name": "C",
        "ext": ".c",
        "judge0_id": 50,  # GCC
        "entry_default": "main.c",
    },
    "cpp": {
        "name": "C++",
        "ext": ".cpp",
        "judge0_id": 54,  # GCC C++
        "entry_default": "main.cpp",
    },
    "java": {
        "name": "Java",
        "ext": ".java",
        "judge0_id": 62,  # OpenJDK
        "entry_default": "Main.java",
    },
    "go": {
        "name": "Go",
        "ext": ".go",
        "judge0_id": 60,  # Go
        "entry_default": "main.go",
    },
    "rust": {
        "name": "Rust",
        "ext": ".rs",
        "judge0_id": 73,  # Rust
        "entry_default": "main.rs",
    },
    "php": {
        "name": "PHP",
        "ext": ".php",
        "judge0_id": 68,  # PHP
        "entry_default": "index.php",
    },
    "ruby": {
        "name": "Ruby",
        "ext": ".rb",
        "judge0_id": 72,  # Ruby
        "entry_default": "main.rb",
    },
    "csharp": {
        "name": "C#",
        "ext": ".cs",
        "judge0_id": 51,  # Mono
        "entry_default": "Main.cs",
    },
    "kotlin": {
        "name": "Kotlin",
        "ext": ".kt",
        "judge0_id": 78,  # Kotlin
        "entry_default": "Main.kt",
    },
    "bash": {
        "name": "Bash",
        "ext": ".sh",
        "judge0_id": 46,  # Bash
        "entry_default": "script.sh",
    },
}

LANGUAGE_ALIASES: Dict[str, str] = {
    "py": "python", "python3": "python",
    "js": "javascript", "node": "javascript",
    "ts": "typescript",
    "c++": "cpp", "cxx": "cpp", "cc": "cpp",
    "cs": "csharp", "c#": "csharp",
    "kt": "kotlin",
    "sh": "bash", "shell": "bash",
    "rb": "ruby", "rs": "rust", "golang": "go",
}


def _normalise(lang: str) -> str:
    key = lang.lower().strip()
    return LANGUAGE_ALIASES.get(key, key)


def _b64_encode(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("utf-8")


def _b64_decode(text: Optional[str]) -> str:
    if not text:
        return ""
    try:
        return base64.b64decode(text).decode("utf-8", errors="replace")
    except Exception:
        return text


def _sanitize_output(text: str, tmp_dir: Optional[str] = None) -> str:
    """Strip internal server paths, temporary directories, and system paths from output."""
    if not text:
        return text

    if tmp_dir:
        text = text.replace(tmp_dir + "\\", "").replace(tmp_dir + "/", "").replace(tmp_dir, "")

    # Clean Windows temporary file paths (e.g. C:\...\codespace_xxxx\ or C:\...\Temp\...)
    text = re.sub(r'[A-Za-z]:\\[^ \n\r\t:"<>|]*codespace_[^\\/ \n\r\t:"<>|]*[\\/]', '', text)
    text = re.sub(r'[A-Za-z]:\\[^ \n\r\t:"<>|]*AppData\\[^ \n\r\t:"<>|]*[\\/]', '', text)
    
    # Clean Linux/Unix temporary file paths (e.g. /tmp/codespace_xxxx/ or /tmp/submission_...)
    text = re.sub(r'/tmp/codespace_[^/ \n\r\t:"<>|]*/', '', text)
    text = re.sub(r'/tmp/submission_[^/ \n\r\t:"<>|]*/', '', text)
    text = re.sub(r'/tmp/[a-zA-Z0-9_\-]+/', '', text)
    text = re.sub(r'/usercode/[a-zA-Z0-9_\-]+/', '', text)

    return text


def _truncate(text: str) -> str:
    if len(text) > MAX_OUTPUT_LENGTH:
        return text[:MAX_OUTPUT_LENGTH] + "\n… [Output truncated to 12,000 chars]"
    return text


# ---------------------------------------------------------------------------
# Local Multi-File Sandbox Runner (Python / Node.js)
# ---------------------------------------------------------------------------
def _can_run_locally(lang_key: str) -> bool:
    info = LANGUAGE_REGISTRY.get(lang_key, {})
    cmd_fn = info.get("local_cmd")
    if not cmd_fn:
        return False
    try:
        cmd = cmd_fn(Path("test"))
        return cmd is not None and bool(cmd)
    except Exception:
        return False


def _execute_local(
    lang_key: str, files: List[Dict[str, str]], entry: str, stdin: str
) -> CodeRunResponse:
    info = LANGUAGE_REGISTRY.get(lang_key, {})
    cmd_fn = info.get("local_cmd")
    if not cmd_fn:
        return CodeRunResponse(
            status="error",
            output=f"No local runtime available for '{info.get('name', lang_key)}'.",
            execution_time=0.0,
        )

    start = time.time()
    tmp = tempfile.mkdtemp(prefix="codespace_")
    try:
        # Write all project files into isolated directory so multi-file imports work
        for f in files:
            p = Path(tmp) / f["name"]
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(f["content"], encoding="utf-8")

        entry_path = Path(tmp) / entry
        if not entry_path.exists():
            # If entry file wasn't created, try finding first matching file
            matching = list(Path(tmp).glob(f"*{info.get('ext', '')}"))
            if matching:
                entry_path = matching[0]
            else:
                return CodeRunResponse(
                    status="error",
                    output=f"Entry file '{entry}' not found in project files.",
                    execution_time=round(time.time() - start, 3),
                )

        cmd = cmd_fn(entry_path)
        env = os.environ.copy()
        env["PYTHONPATH"] = str(tmp)
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        proc = subprocess.run(
            cmd,
            input=stdin,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            cwd=tmp,
            env=env,
        )
        elapsed = round(time.time() - start, 3)
        raw_output = proc.stdout + ("\n" + proc.stderr if proc.stderr else "")
        sanitized = _sanitize_output(raw_output, tmp_dir=tmp)

        if not sanitized.strip():
            sanitized = "[Process completed with no output]"

        return CodeRunResponse(
            status="success" if proc.returncode == 0 else "error",
            output=_truncate(sanitized.strip()),
            execution_time=elapsed,
        )

    except subprocess.TimeoutExpired:
        return CodeRunResponse(
            status="timeout",
            output=f"Execution timed out ({TIMEOUT_SECONDS}s limit).",
            execution_time=round(time.time() - start, 3),
        )
    except FileNotFoundError as exc:
        return CodeRunResponse(
            status="error",
            output=f"Local runtime executable not found: {exc}",
            execution_time=round(time.time() - start, 3),
        )
    except Exception as exc:
        return CodeRunResponse(
            status="error",
            output=f"Execution error: {exc}",
            execution_time=round(time.time() - start, 3),
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------------------
# Judge0 Remote Sandbox Execution (C, C++, Java, Rust, Go, PHP, Ruby, etc.)
# ---------------------------------------------------------------------------
async def _execute_judge0(
    lang_key: str, source_code: str, stdin: str
) -> CodeRunResponse:
    info = LANGUAGE_REGISTRY[lang_key]
    judge0_id = info.get("judge0_id")
    if not judge0_id:
        return CodeRunResponse(
            status="error",
            output=f"Language '{info['name']}' is not supported in the sandbox environment.",
            execution_time=0.0,
        )

    start = time.time()
    payload = {
        "language_id": judge0_id,
        "source_code": _b64_encode(source_code),
        "stdin": _b64_encode(stdin),
        "cpu_time_limit": TIMEOUT_SECONDS,
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS + 6) as client:
            res = await client.post(JUDGE0_API_URL, json=payload)
            elapsed = round(time.time() - start, 3)

            if res.status_code not in (200, 201):
                return CodeRunResponse(
                    status="error",
                    output=f"Execution sandbox returned HTTP {res.status_code}: {res.text[:200]}",
                    execution_time=elapsed,
                )

            data = res.json()
            status_obj = data.get("status", {})
            status_id = status_obj.get("id", 0)

            # Compilation Error (Status ID 6 or compile_output present)
            compile_output_raw = data.get("compile_output")
            compile_output = _b64_decode(compile_output_raw)
            if compile_output and compile_output.strip():
                sanitized_compile = _sanitize_output(compile_output.strip())
                return CodeRunResponse(
                    status="error",
                    output=f"Compilation Error:\n{_truncate(sanitized_compile)}",
                    execution_time=elapsed,
                )

            # Time Limit Exceeded (Status ID 5)
            if status_id == 5:
                return CodeRunResponse(
                    status="timeout",
                    output=f"Execution timed out ({TIMEOUT_SECONDS}s limit exceeded).",
                    execution_time=elapsed,
                )

            stdout = _b64_decode(data.get("stdout"))
            stderr = _b64_decode(data.get("stderr"))
            message = _b64_decode(data.get("message"))

            combined = stdout
            if stderr:
                combined += ("\n" if combined else "") + stderr
            if message:
                combined += ("\n" if combined else "") + message

            sanitized = _sanitize_output(combined)
            if not sanitized.strip():
                sanitized = "[Process completed with no output]"

            is_success = status_id == 3  # Accepted

            return CodeRunResponse(
                status="success" if is_success else "error",
                output=_truncate(sanitized.strip()),
                execution_time=elapsed,
            )

    except httpx.TimeoutException:
        return CodeRunResponse(
            status="timeout",
            output=f"Execution sandbox timed out ({TIMEOUT_SECONDS}s limit).",
            execution_time=round(time.time() - start, 3),
        )
    except Exception as exc:
        logger.error(f"Judge0 execution error: {exc}")
        return CodeRunResponse(
            status="error",
            output=f"Execution sandbox error: {exc}",
            execution_time=round(time.time() - start, 3),
        )


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@router.post("", response_model=CodeRunResponse)
async def execute_code(
    payload: CodeRunRequest,
    current_user: User = Depends(get_current_user),
):
    lang_key = _normalise(payload.language)
    if lang_key not in LANGUAGE_REGISTRY:
        return CodeRunResponse(
            status="error",
            output=f"Language '{payload.language}' is not supported.\nSupported: {', '.join(info['name'] for info in LANGUAGE_REGISTRY.values())}",
            execution_time=0.0,
        )

    info = LANGUAGE_REGISTRY[lang_key]

    # Build file list (multi-file or single-file backward compatibility)
    if payload.files:
        files = [{"name": f.name, "content": f.content} for f in payload.files]
    elif payload.code is not None:
        entry_name = payload.entry_file or info["entry_default"]
        files = [{"name": entry_name, "content": payload.code}]
    else:
        return CodeRunResponse(status="error", output="No code provided for execution.", execution_time=0.0)

    entry_file = payload.entry_file or files[0]["name"]
    stdin = payload.stdin or ""

    # Strategy:
    # 1. If local runner is available (e.g. Python, Node.js), use local isolated sandbox.
    #    This provides ultra-fast execution and native multi-file module imports (e.g. main.py -> utils.py).
    if _can_run_locally(lang_key):
        try:
            return _execute_local(lang_key, files, entry_file, stdin)
        except Exception as exc:
            logger.warning(f"Local runner failed for {lang_key}: {exc}; falling back to remote sandbox")

    # 2. Remote sandbox via Judge0 CE (C, C++, Java, Rust, Go, PHP, Ruby, TypeScript, etc.)
    entry_code = ""
    for f in files:
        if f["name"] == entry_file:
            entry_code = f["content"]
            break
    if not entry_code and files:
        entry_code = files[0]["content"]

    return await _execute_judge0(lang_key, entry_code, stdin)


@router.get("/languages")
def get_supported_languages():
    """Return the list of validated supported programming languages."""
    return [
        {
            "key": k,
            "name": v["name"],
            "ext": v["ext"],
            "entry_default": v["entry_default"],
            "has_local": _can_run_locally(k),
        }
        for k, v in LANGUAGE_REGISTRY.items()
    ]
