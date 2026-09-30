import sys
import os
import re
import time
import json
import asyncio
import base64
import tempfile
import subprocess
import shutil
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
import httpx

from ..models import User
from ..schemas import CodeRunRequest, CodeRunResponse
from ..auth import get_current_user, decode_access_token
from ..config import PISTON_API_URL, JUDGE0_API_URL, EXECUTION_PROVIDER

logger = logging.getLogger("execution")
router = APIRouter(prefix="/api/execute", tags=["Code Execution"])

TIMEOUT_SECONDS = 10
INTERACTIVE_TIMEOUT_SECONDS = 300
MAX_OUTPUT_LENGTH = 15000

# ---------------------------------------------------------------------------
# Centralized Language Registry
# ---------------------------------------------------------------------------
LANGUAGE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "python": {
        "name": "Python",
        "ext": ".py",
        "piston_lang": "python",
        "piston_version": "3.10.0",
        "judge0_id": 71,  # Python 3
        "entry_default": "main.py",
        "local_cmd": lambda p: [sys.executable, str(p)],
    },
    "javascript": {
        "name": "JavaScript",
        "ext": ".js",
        "piston_lang": "javascript",
        "piston_version": "18.15.0",
        "judge0_id": 63,  # Node.js
        "entry_default": "index.js",
        "local_cmd": lambda p: ["node", str(p)] if shutil.which("node") else None,
    },
    "typescript": {
        "name": "TypeScript",
        "ext": ".ts",
        "piston_lang": "typescript",
        "piston_version": "5.0.3",
        "judge0_id": 74,  # TypeScript
        "entry_default": "index.ts",
    },
    "c": {
        "name": "C",
        "ext": ".c",
        "piston_lang": "c",
        "piston_version": "10.2.0",
        "judge0_id": 50,  # GCC
        "entry_default": "main.c",
    },
    "cpp": {
        "name": "C++",
        "ext": ".cpp",
        "piston_lang": "cpp",
        "piston_version": "10.2.0",
        "judge0_id": 54,  # GCC C++
        "entry_default": "main.cpp",
    },
    "java": {
        "name": "Java",
        "ext": ".java",
        "piston_lang": "java",
        "piston_version": "15.0.2",
        "judge0_id": 62,  # OpenJDK
        "entry_default": "Main.java",
    },
    "go": {
        "name": "Go",
        "ext": ".go",
        "piston_lang": "go",
        "piston_version": "1.16.2",
        "judge0_id": 60,  # Go
        "entry_default": "main.go",
    },
    "rust": {
        "name": "Rust",
        "ext": ".rs",
        "piston_lang": "rust",
        "piston_version": "1.68.2",
        "judge0_id": 73,  # Rust
        "entry_default": "main.rs",
    },
    "php": {
        "name": "PHP",
        "ext": ".php",
        "piston_lang": "php",
        "piston_version": "8.2.3",
        "judge0_id": 68,  # PHP
        "entry_default": "index.php",
    },
    "ruby": {
        "name": "Ruby",
        "ext": ".rb",
        "piston_lang": "ruby",
        "piston_version": "3.0.1",
        "judge0_id": 72,  # Ruby
        "entry_default": "main.rb",
    },
    "csharp": {
        "name": "C#",
        "ext": ".cs",
        "piston_lang": "csharp",
        "piston_version": "6.12.0",
        "judge0_id": 51,  # Mono
        "entry_default": "Main.cs",
    },
    "kotlin": {
        "name": "Kotlin",
        "ext": ".kt",
        "piston_lang": "kotlin",
        "piston_version": "1.8.20",
        "judge0_id": 78,  # Kotlin
        "entry_default": "Main.kt",
    },
    "bash": {
        "name": "Bash",
        "ext": ".sh",
        "piston_lang": "bash",
        "piston_version": "5.2.0",
        "judge0_id": 46,  # Bash
        "entry_default": "script.sh",
    },
}

LANGUAGE_ALIASES: Dict[str, str] = {
    "py": "python", "python3": "python",
    "js": "javascript", "node": "javascript", "jsx": "javascript",
    "ts": "typescript", "tsx": "typescript",
    "c++": "cpp", "cxx": "cpp", "cc": "cpp", "hpp": "cpp", "h": "c",
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
    """Strip server paths and temp directories from output."""
    if not text:
        return text

    if tmp_dir:
        text = text.replace(tmp_dir + "\\", "").replace(tmp_dir + "/", "").replace(tmp_dir, "")
        # Also handle unresolved / resolved variants
        try:
            resolved_tmp = str(Path(tmp_dir).resolve())
            text = text.replace(resolved_tmp + "\\", "").replace(resolved_tmp + "/", "").replace(resolved_tmp, "")
        except Exception:
            pass

    # Match Windows & Unix paths containing codespace_ or AppData or /tmp/
    text = re.sub(r'[A-Za-z]:\\[^\n\r"\'<>|]*?codespace_[a-zA-Z0-9_\-]+[\\/]', '', text)
    text = re.sub(r'[A-Za-z]:\\[^\n\r"\'<>|]*?AppData\\[^\n\r"\'<>|]*?[\\/]', '', text)
    text = re.sub(r'/tmp/codespace_[^/ \n\r\t:"<>|]*/', '', text)
    text = re.sub(r'/tmp/submission_[^/ \n\r\t:"<>|]*/', '', text)
    text = re.sub(r'/tmp/[a-zA-Z0-9_\-]+/', '', text)
    text = re.sub(r'/usercode/[a-zA-Z0-9_\-]+/', '', text)
    text = re.sub(r'codespace_[a-zA-Z0-9_\-]+[\\/]', '', text)

    return text


def _truncate(text: str) -> str:
    if len(text) > MAX_OUTPUT_LENGTH:
        return text[:MAX_OUTPUT_LENGTH] + "\n… [Output truncated]"
    return text


# ---------------------------------------------------------------------------
# Execution Provider Interface & Concrete Providers
# ---------------------------------------------------------------------------
class ExecutionProvider(ABC):
    @abstractmethod
    async def execute(
        self,
        lang_key: str,
        files: List[Dict[str, str]],
        entry_file: str,
        stdin: str,
    ) -> CodeRunResponse:
        pass


class LocalExecutionProvider(ExecutionProvider):
    """Low-latency local isolated execution for supported environments (Python/Node)."""
    async def execute(
        self,
        lang_key: str,
        files: List[Dict[str, str]],
        entry_file: str,
        stdin: str,
    ) -> CodeRunResponse:
        info = LANGUAGE_REGISTRY.get(lang_key, {})
        cmd_fn = info.get("local_cmd")
        if not cmd_fn:
            return CodeRunResponse(
                status="error",
                output=f"No local runtime executable found for '{info.get('name', lang_key)}'.",
                execution_time=0.0,
            )

        start = time.time()
        tmp = tempfile.mkdtemp(prefix="codespace_")
        try:
            for f in files:
                p = (Path(tmp) / f["name"]).resolve()
                if not str(p).startswith(str(Path(tmp).resolve())):
                    continue
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(f["content"], encoding="utf-8")

            entry_path = (Path(tmp) / entry_file).resolve()
            if not entry_path.exists():
                matching = list(Path(tmp).glob(f"*{info.get('ext', '')}"))
                if matching:
                    entry_path = matching[0]
                else:
                    return CodeRunResponse(
                        status="error",
                        output=f"Entry file '{entry_file}' not found in project files.",
                        execution_time=round(time.time() - start, 3),
                    )

            cmd = cmd_fn(entry_path)
            env = os.environ.copy()
            env["PYTHONPATH"] = str(tmp)
            env["NODE_PATH"] = str(tmp)
            env["PYTHONDONTWRITEBYTECODE"] = "1"
            env["PYTHONUNBUFFERED"] = "1"
            env["NODE_OPTIONS"] = "--max-old-space-size=256"

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

            # Check if execution failed due to EOFError (e.g. input() called with empty or exhausted stdin)
            raw_err = proc.stderr or ""
            raw_out = proc.stdout or ""
            is_eof_error = "EOFError: EOF when reading a line" in raw_err or "EOFError" in raw_err

            if proc.returncode != 0 and is_eof_error:
                clean_prompt = _sanitize_output(raw_out.strip(), tmp_dir=tmp)
                if not stdin.strip():
                    graceful_msg = (
                        f"{clean_prompt}\n\n" if clean_prompt else ""
                    ) + "[EOFError: Program requested standard input (input()), but no stdin was provided in the 'Input (stdin)' panel. Provide input in the Input tab and run again.]"
                else:
                    graceful_msg = (
                        f"{clean_prompt}\n\n" if clean_prompt else ""
                    ) + "[EOFError: Program requested additional standard input via input(), but provided stdin was exhausted.]"
                return CodeRunResponse(
                    status="error",
                    output=_truncate(graceful_msg),
                    execution_time=elapsed,
                )

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
        except Exception as exc:
            return CodeRunResponse(
                status="error",
                output=f"Local execution error: {exc}",
                execution_time=round(time.time() - start, 3),
            )
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class PistonExecutionProvider(ExecutionProvider):
    """Piston sandbox execution supporting multi-file project structures."""
    async def execute(
        self,
        lang_key: str,
        files: List[Dict[str, str]],
        entry_file: str,
        stdin: str,
    ) -> CodeRunResponse:
        info = LANGUAGE_REGISTRY.get(lang_key, {})
        piston_lang = info.get("piston_lang")
        if not piston_lang:
            return CodeRunResponse(
                status="error",
                output=f"Language '{info.get('name', lang_key)}' is not configured for Piston.",
                execution_time=0.0,
            )

        start = time.time()
        # Order files so entry_file is first
        piston_files = []
        for f in files:
            if f["name"] == entry_file:
                piston_files.insert(0, {"name": f["name"], "content": f["content"]})
            else:
                piston_files.append({"name": f["name"], "content": f["content"]})

        payload = {
            "language": piston_lang,
            "version": "*",
            "files": piston_files,
            "stdin": stdin,
            "run_timeout": TIMEOUT_SECONDS * 1000,
        }

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS + 5) as client:
                res = await client.post(f"{PISTON_API_URL}/execute", json=payload)
                elapsed = round(time.time() - start, 3)

                if res.status_code != 200:
                    return CodeRunResponse(
                        status="error",
                        output=f"Piston sandbox error (HTTP {res.status_code}): {res.text[:200]}",
                        execution_time=elapsed,
                    )

                data = res.json()
                run_data = data.get("run", {})
                compile_data = data.get("compile", {})

                # Check compile errors first
                if compile_data and compile_data.get("code", 0) != 0:
                    err_out = compile_data.get("stderr") or compile_data.get("stdout") or "Compilation failed"
                    return CodeRunResponse(
                        status="error",
                        output=f"Compilation Error:\n{_truncate(_sanitize_output(err_out.strip()))}",
                        execution_time=elapsed,
                    )

                stdout = run_data.get("stdout", "")
                stderr = run_data.get("stderr", "")
                output = run_data.get("output", stdout + ("\n" + stderr if stderr else ""))
                exit_code = run_data.get("code", 0)
                signal = run_data.get("signal")

                sanitized = _sanitize_output(output.strip())
                if signal == "SIGKILL" or "timed out" in sanitized.lower():
                    return CodeRunResponse(
                        status="timeout",
                        output=f"Execution timed out ({TIMEOUT_SECONDS}s limit).",
                        execution_time=elapsed,
                    )

                # Graceful EOFError handling in Piston
                is_eof_error = "EOFError: EOF when reading a line" in (stderr or "") or "EOFError" in (stderr or "")
                if exit_code != 0 and is_eof_error:
                    clean_prompt = _sanitize_output(stdout.strip())
                    if not stdin.strip():
                        graceful_msg = (
                            f"{clean_prompt}\n\n" if clean_prompt else ""
                        ) + "[EOFError: Program requested standard input (input()), but no stdin was provided in the 'Input (stdin)' panel. Provide input in the Input tab and run again.]"
                    else:
                        graceful_msg = (
                            f"{clean_prompt}\n\n" if clean_prompt else ""
                        ) + "[EOFError: Program requested additional standard input via input(), but provided stdin was exhausted.]"
                    return CodeRunResponse(
                        status="error",
                        output=_truncate(graceful_msg),
                        execution_time=elapsed,
                    )

                if not sanitized:
                    sanitized = "[Process completed with no output]"

                return CodeRunResponse(
                    status="success" if exit_code == 0 else "error",
                    output=_truncate(sanitized),
                    execution_time=elapsed,
                )
        except httpx.TimeoutException:
            return CodeRunResponse(
                status="timeout",
                output=f"Piston execution timed out ({TIMEOUT_SECONDS}s limit).",
                execution_time=round(time.time() - start, 3),
            )
        except Exception as exc:
            logger.error(f"Piston error: {exc}")
            return CodeRunResponse(
                status="error",
                output=f"Piston sandbox error: {exc}",
                execution_time=round(time.time() - start, 3),
            )


class Judge0ExecutionProvider(ExecutionProvider):
    """Judge0 CE remote sandbox execution provider."""
    async def execute(
        self,
        lang_key: str,
        files: List[Dict[str, str]],
        entry_file: str,
        stdin: str,
    ) -> CodeRunResponse:
        info = LANGUAGE_REGISTRY.get(lang_key, {})
        judge0_id = info.get("judge0_id")
        if not judge0_id:
            return CodeRunResponse(
                status="error",
                output=f"Language '{info.get('name', lang_key)}' is not configured for Judge0.",
                execution_time=0.0,
            )

        # Find entry code
        entry_code = ""
        for f in files:
            if f["name"] == entry_file:
                entry_code = f["content"]
                break
        if not entry_code and files:
            entry_code = files[0]["content"]

        start = time.time()
        payload = {
            "language_id": judge0_id,
            "source_code": _b64_encode(entry_code),
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
                        output=f"Judge0 returned HTTP {res.status_code}: {res.text[:200]}",
                        execution_time=elapsed,
                    )

                data = res.json()
                status_id = data.get("status", {}).get("id", 0)

                compile_output_raw = data.get("compile_output")
                compile_output = _b64_decode(compile_output_raw)
                if compile_output and compile_output.strip():
                    sanitized_compile = _sanitize_output(compile_output.strip())
                    return CodeRunResponse(
                        status="error",
                        output=f"Compilation Error:\n{_truncate(sanitized_compile)}",
                        execution_time=elapsed,
                    )

                if status_id == 5:
                    return CodeRunResponse(
                        status="timeout",
                        output=f"Execution timed out ({TIMEOUT_SECONDS}s limit).",
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

                is_success = status_id == 3

                # Graceful EOFError handling in Judge0
                is_eof_error = "EOFError: EOF when reading a line" in (stderr or "") or "EOFError" in (combined or "")
                if not is_success and is_eof_error:
                    clean_prompt = _sanitize_output(stdout.strip())
                    if not stdin.strip():
                        graceful_msg = (
                            f"{clean_prompt}\n\n" if clean_prompt else ""
                        ) + "[EOFError: Program requested standard input (input()), but no stdin was provided in the 'Input (stdin)' panel. Provide input in the Input tab and run again.]"
                    else:
                        graceful_msg = (
                            f"{clean_prompt}\n\n" if clean_prompt else ""
                        ) + "[EOFError: Program requested additional standard input via input(), but provided stdin was exhausted.]"
                    return CodeRunResponse(
                        status="error",
                        output=_truncate(graceful_msg),
                        execution_time=elapsed,
                    )

                return CodeRunResponse(
                    status="success" if is_success else "error",
                    output=_truncate(sanitized.strip()),
                    execution_time=elapsed,
                )
        except httpx.TimeoutException:
            return CodeRunResponse(
                status="timeout",
                output=f"Judge0 timed out ({TIMEOUT_SECONDS}s limit).",
                execution_time=round(time.time() - start, 3),
            )
        except Exception as exc:
            return CodeRunResponse(
                status="error",
                output=f"Judge0 sandbox error: {exc}",
                execution_time=round(time.time() - start, 3),
            )


# Provider factory
local_provider = LocalExecutionProvider()
piston_provider = PistonExecutionProvider()
judge0_provider = Judge0ExecutionProvider()


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
        supported = ", ".join(info["name"] for info in LANGUAGE_REGISTRY.values())
        return CodeRunResponse(
            status="error",
            output=f"Language '{payload.language}' is not supported.\nSupported: {supported}",
            execution_time=0.0,
        )

    info = LANGUAGE_REGISTRY[lang_key]

    # Build file list
    if payload.files:
        files = [{"name": f.name, "content": f.content} for f in payload.files]
    elif payload.code is not None:
        entry_name = payload.entry_file or info["entry_default"]
        files = [{"name": entry_name, "content": payload.code}]
    else:
        return CodeRunResponse(status="error", output="No code provided for execution.", execution_time=0.0)

    entry_file = payload.entry_file or files[0]["name"]
    stdin = payload.stdin or ""
    if stdin and not stdin.endswith("\n"):
        stdin = stdin + "\n"

    # Provider Resolution Strategy:
    # 1. If explicit EXECUTION_PROVIDER configured (piston/judge0)
    if EXECUTION_PROVIDER == "piston":
        return await piston_provider.execute(lang_key, files, entry_file, stdin)
    elif EXECUTION_PROVIDER == "judge0":
        return await judge0_provider.execute(lang_key, files, entry_file, stdin)

    # 2. Local runner if available (for 'local' or 'auto')
    if _can_run_locally(lang_key):
        try:
            return await local_provider.execute(lang_key, files, entry_file, stdin)
        except Exception as exc:
            logger.warning(f"Local runner failed for {lang_key}: {exc}; falling back to remote sandbox")

    # 3. Remote sandbox fallback (Judge0 -> Piston)
    res = await judge0_provider.execute(lang_key, files, entry_file, stdin)
    if res.status == "error" and ("not supported" in res.output.lower() or "not configured" in res.output.lower()):
        return await piston_provider.execute(lang_key, files, entry_file, stdin)
    return res


@router.get("/languages")
def get_supported_languages():
    """Return validated supported programming languages."""
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


@router.websocket("/ws")
async def execute_interactive_ws(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """
    Interactive Real-Time Terminal Execution WebSocket.
    Supports real-time stdout/stderr chunk streaming and live bidirectional stdin piping.
    """
    await websocket.accept()

    current_proc: Optional[asyncio.subprocess.Process] = None
    current_tmp: Optional[str] = None
    stream_tasks: List[asyncio.Task] = []

    async def cleanup_proc():
        nonlocal current_proc, current_tmp, stream_tasks
        for t in stream_tasks:
            t.cancel()
        stream_tasks = []
        if current_proc and current_proc.returncode is None:
            try:
                current_proc.terminate()
                await asyncio.sleep(0.05)
                if current_proc.returncode is None:
                    current_proc.kill()
            except Exception:
                pass
            current_proc = None
        if current_tmp:
            shutil.rmtree(current_tmp, ignore_errors=True)
            current_tmp = None

    try:
        while True:
            msg_text = await websocket.receive_text()
            try:
                msg = json.loads(msg_text)
            except Exception:
                continue

            msg_type = msg.get("type")

            # 1. START EXECUTION
            if msg_type == "start":
                await cleanup_proc()

                language = msg.get("language", "python")
                files = msg.get("files", [])
                entry_file = msg.get("entry_file", "main.py")

                lang_key = _normalise(language)
                if lang_key not in LANGUAGE_REGISTRY:
                    supported = ", ".join(info["name"] for info in LANGUAGE_REGISTRY.values())
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Language '{language}' is not supported.\nSupported: {supported}\n"
                    })
                    continue

                info = LANGUAGE_REGISTRY[lang_key]

                if not files:
                    code = msg.get("code", "")
                    files = [{"name": entry_file or info["entry_default"], "content": code}]

                entry_file = entry_file or files[0]["name"]
                start_time = time.time()

                if _can_run_locally(lang_key) and (EXECUTION_PROVIDER in ("local", "auto")):
                    cmd_fn = info.get("local_cmd")
                    current_tmp = tempfile.mkdtemp(prefix="codespace_")
                    tmp_path = Path(current_tmp)

                    for f in files:
                        p = (tmp_path / f["name"]).resolve()
                        if not str(p).startswith(str(tmp_path.resolve())):
                            continue
                        p.parent.mkdir(parents=True, exist_ok=True)
                        p.write_text(f["content"], encoding="utf-8")

                    entry_path = (tmp_path / entry_file).resolve()
                    if not entry_path.exists():
                        matching = list(tmp_path.glob(f"*{info.get('ext', '')}"))
                        if matching:
                            entry_path = matching[0]
                        else:
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Entry file '{entry_file}' not found.\n"
                            })
                            await cleanup_proc()
                            continue

                    cmd = cmd_fn(entry_path)
                    if lang_key == "python":
                        cmd = [sys.executable, "-u", str(entry_path)]

                    env = os.environ.copy()
                    env["PYTHONPATH"] = str(tmp_path)
                    env["NODE_PATH"] = str(tmp_path)
                    env["PYTHONUNBUFFERED"] = "1"
                    env["PYTHONIOENCODING"] = "utf-8"
                    env["PYTHONDONTWRITEBYTECODE"] = "1"
                    env["NODE_OPTIONS"] = "--max-old-space-size=256"

                    try:
                        current_proc = await asyncio.create_subprocess_exec(
                            *cmd,
                            stdin=asyncio.subprocess.PIPE,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                            cwd=current_tmp,
                            env=env,
                        )
                    except Exception as e:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Failed to start execution process: {e}\n"
                        })
                        await cleanup_proc()
                        continue

                    cmd_display = f"{info['name'].lower()} {entry_file}"
                    await websocket.send_json({
                        "type": "started",
                        "command": f"$ {cmd_display}",
                        "language": lang_key,
                    })

                    active_tmp = current_tmp

                    async def stream_stdout(proc: asyncio.subprocess.Process, tmp_dir: str):
                        try:
                            while True:
                                chunk = await proc.stdout.read(1024)
                                if not chunk:
                                    break
                                text = chunk.decode("utf-8", errors="replace")
                                sanitized = _sanitize_output(text, tmp_dir=tmp_dir)
                                await websocket.send_json({
                                    "type": "stdout",
                                    "data": sanitized
                                })
                        except Exception:
                            pass

                    async def stream_stderr(proc: asyncio.subprocess.Process, tmp_dir: str):
                        try:
                            while True:
                                chunk = await proc.stderr.read(1024)
                                if not chunk:
                                    break
                                text = chunk.decode("utf-8", errors="replace")
                                sanitized = _sanitize_output(text, tmp_dir=tmp_dir)
                                await websocket.send_json({
                                    "type": "stderr",
                                    "data": sanitized
                                })
                        except Exception:
                            pass

                    t_out = asyncio.create_task(stream_stdout(current_proc, active_tmp))
                    t_err = asyncio.create_task(stream_stderr(current_proc, active_tmp))
                    stream_tasks = [t_out, t_err]

                    async def monitor_completion(proc: asyncio.subprocess.Process, tmp_dir: str, start_t: float):
                        try:
                            await asyncio.wait_for(proc.wait(), timeout=INTERACTIVE_TIMEOUT_SECONDS)
                            await asyncio.gather(t_out, t_err, return_exceptions=True)
                            elapsed = round(time.time() - start_t, 3)
                            exit_code = proc.returncode
                            await websocket.send_json({
                                "type": "done",
                                "status": "success" if exit_code == 0 else "error",
                                "exit_code": exit_code,
                                "execution_time": elapsed,
                            })
                        except asyncio.TimeoutError:
                            try:
                                proc.kill()
                            except Exception:
                                pass
                            await websocket.send_json({
                                "type": "done",
                                "status": "timeout",
                                "exit_code": -1,
                                "execution_time": INTERACTIVE_TIMEOUT_SECONDS,
                                "message": f"\n[Execution timed out ({INTERACTIVE_TIMEOUT_SECONDS}s limit)]\n"
                            })
                        finally:
                            shutil.rmtree(tmp_dir, ignore_errors=True)

                    asyncio.create_task(monitor_completion(current_proc, active_tmp, start_time))

                else:
                    cmd_display = f"{info['name'].lower()} {entry_file}"
                    await websocket.send_json({
                        "type": "started",
                        "command": f"$ {cmd_display}",
                        "language": lang_key,
                    })
                    stdin_init = msg.get("stdin", "")
                    if EXECUTION_PROVIDER == "piston":
                        res = await piston_provider.execute(lang_key, files, entry_file, stdin_init)
                    elif EXECUTION_PROVIDER == "judge0":
                        res = await judge0_provider.execute(lang_key, files, entry_file, stdin_init)
                    else:
                        res = await judge0_provider.execute(lang_key, files, entry_file, stdin_init)
                        if res.status == "error" and ("not supported" in res.output.lower() or "not configured" in res.output.lower()):
                            res = await piston_provider.execute(lang_key, files, entry_file, stdin_init)

                    if res.output:
                        await websocket.send_json({
                            "type": "stdout" if res.status == "success" else "stderr",
                            "data": res.output + "\n"
                        })
                    await websocket.send_json({
                        "type": "done",
                        "status": res.status,
                        "exit_code": 0 if res.status == "success" else 1,
                        "execution_time": res.execution_time,
                    })

            # 2. STDIN INPUT
            elif msg_type == "stdin":
                if current_proc and current_proc.returncode is None and current_proc.stdin:
                    input_data = msg.get("data", "")
                    if not input_data.endswith("\n"):
                        input_data += "\n"
                    try:
                        current_proc.stdin.write(input_data.encode("utf-8"))
                        await current_proc.stdin.drain()
                    except Exception as e:
                        logger.warning(f"Failed to write stdin to process: {e}")

            # 3. STOP PROCESS
            elif msg_type == "stop":
                if current_proc and current_proc.returncode is None:
                    try:
                        current_proc.terminate()
                        await asyncio.sleep(0.05)
                        if current_proc.returncode is None:
                            current_proc.kill()
                    except Exception:
                        pass
                    await websocket.send_json({
                        "type": "stopped",
                        "message": "\n[Process terminated by user]\n"
                    })
                await cleanup_proc()

    except WebSocketDisconnect:
        await cleanup_proc()
    except Exception as exc:
        logger.error(f"Interactive execution websocket error: {exc}", exc_info=True)
        await cleanup_proc()

