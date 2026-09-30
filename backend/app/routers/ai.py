import httpx
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models import User, Room, ProjectFile
from ..auth import get_current_user
from ..database import get_db, SessionLocal
from ..config import AI_API_KEY, AI_MODEL, AI_PROVIDER
from ..schemas import (
    AIRequest, AIResponse, AICompletionRequest, AICompletionResponse,
    AIChatMessage, AIAgentRequest, AIAgentResponse, AIAgentStep, AIToolCall,
)
from ..services.ai_agent import (
    build_agent_system_prompt, parse_agent_response, execute_agent_tools,
)

logger = logging.getLogger("ai")
router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])

GEMINI_FALLBACK_MODELS = [AI_MODEL, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro"]
UNIQUE_GEMINI_MODELS = list(dict.fromkeys(m for m in GEMINI_FALLBACK_MODELS if m))

OPENROUTER_FALLBACK_MODELS = [AI_MODEL, "openai/gpt-4o-mini", "deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct"]
UNIQUE_OPENROUTER_MODELS = list(dict.fromkeys(m for m in OPENROUTER_FALLBACK_MODELS if m))


def _system_prompt(action: str, language: str) -> str:
    base = (
        f"You are a world-class {language} software engineer, architect, and pair-programming assistant "
        f"integrated into a modern collaborative web IDE. "
        f"Provide direct, high-quality, practical advice with clean markdown and concise, runnable code examples.\n"
        f"- Always be helpful, precise, and polite.\n"
        f"- Format code using standard markdown code blocks with language identifiers.\n"
        f"- When modifying or generating code, output the cleanest idiomatic code.\n"
        f"- When explaining errors or bugs, identify the exact root cause first, then provide the step-by-step fix."
    )
    extras = {
        "explain": "\nFocus: Explain the logic, data flow, algorithm, and architecture of the provided code clearly.",
        "bug_detect": "\nFocus: Perform rigorous static code analysis. Identify syntax errors, runtime exceptions, logic bugs, off-by-one errors, infinite loops, and security vulnerabilities. Show the exact line and corrected code.",
        "improve": "\nFocus: Suggest concrete improvements for readability, modern idiomatic standards, performance, clean architecture, and type safety.",
        "generate": "\nFocus: Generate clean, correct, well-structured, production-ready code fulfilling the user request.",
        "chat": "\nFocus: Answer the developer's question directly with complete awareness of their open file, active code, and project context.",
    }
    return base + extras.get(action, extras["chat"])


def _build_user_prompt(
    action: str,
    code: str,
    language: str,
    prompt: str,
    error_output: str,
    file_name: Optional[str] = None,
    project_files: Optional[List[str]] = None,
    chat_history: Optional[List[AIChatMessage]] = None,
) -> str:
    parts: list[str] = []
    
    if file_name:
        parts.append(f"**Active File:** `{file_name}` ({language})")
    
    if project_files and len(project_files) > 0:
        parts.append(f"**Project File Tree:**\n" + "\n".join(f"- {f}" for f in project_files[:20]))

    if code and code.strip():
        parts.append(f"**Current Code in Editor ({language}):**\n```{language}\n{code.strip()}\n```")

    if error_output and error_output.strip():
        parts.append(f"**Recent Compiler / Runtime Error Console Output:**\n```\n{error_output.strip()}\n```")

    if chat_history and len(chat_history) > 0:
        parts.append("**Previous Conversation Context:**")
        for msg in chat_history[-6:]:
            speaker = "Developer" if msg.role == "user" else "AI Assistant"
            parts.append(f"*{speaker}*: {msg.content}")

    if prompt and prompt.strip():
        parts.append(f"\n**User Question / Request:**\n{prompt.strip()}")
    elif action == "explain":
        parts.append("\n**User Request:** Please explain the logic and flow of the active code.")
    elif action == "bug_detect":
        parts.append("\n**User Request:** Please identify any bugs, errors, or potential pitfalls in this code and show how to fix them.")
    elif action == "improve":
        parts.append("\n**User Request:** Please suggest actionable improvements and best practices for this code.")
    elif action == "generate":
        parts.append("\n**User Request:** Please generate the requested code.")

    return "\n\n".join(parts)


async def _call_openrouter_api(system: str, user: str, max_tokens: int = 2048, temperature: float = 0.2) -> tuple[Optional[str], Optional[str]]:
    """Call OpenRouter chat completions API with fallback models."""
    if not AI_API_KEY or not AI_API_KEY.strip():
        return None, None

    for model in UNIQUE_OPENROUTER_MODELS:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {AI_API_KEY.strip()}",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Collaborative CodeSpace IDE",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                res = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        msg = choices[0].get("message", {})
                        if "content" in msg and msg["content"]:
                            return msg["content"], model
                else:
                    logger.warning(f"OpenRouter model {model} returned status {res.status_code}: {res.text[:200]}")
        except httpx.TimeoutException:
            logger.warning(f"OpenRouter timeout with model {model}")
        except Exception as exc:
            logger.error(f"OpenRouter error with model {model}: {exc}")

    return None, None


async def _call_gemini_api(system: str, user: str, max_tokens: int = 2048, temperature: float = 0.2) -> tuple[Optional[str], Optional[str]]:
    """Call Google Gemini API with fallback models."""
    if not AI_API_KEY or not AI_API_KEY.strip():
        return None, None

    for model in UNIQUE_GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={AI_API_KEY.strip()}"
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    cands = data.get("candidates", [])
                    if cands:
                        parts = cands[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            return parts[0]["text"], model
                else:
                    logger.warning(f"Gemini API model {model} returned status {res.status_code}: {res.text[:200]}")
        except httpx.TimeoutException:
            logger.warning(f"Gemini API timeout with model {model}")
        except Exception as exc:
            logger.error(f"Gemini API error with model {model}: {exc}")

    return None, None


async def _call_ai_service(system: str, user: str, max_tokens: int = 2048, temperature: float = 0.2) -> tuple[Optional[str], Optional[str]]:
    """Route request to OpenRouter or Google Gemini based on API key format and provider config."""
    key = (AI_API_KEY or "").strip()
    if not key:
        return None, None

    # Detect OpenRouter key (sk-or-v1-... or sk-...)
    if key.startswith("sk-or-") or key.startswith("sk-") or AI_PROVIDER == "openrouter":
        text, model = await _call_openrouter_api(system, user, max_tokens=max_tokens, temperature=temperature)
        if text:
            return text, model

    # Otherwise try Gemini
    text, model = await _call_gemini_api(system, user, max_tokens=max_tokens, temperature=temperature)
    if text:
        return text, model

    # Fallback to OpenRouter if not already attempted
    if not key.startswith("sk-or-") and not key.startswith("sk-"):
        text, model = await _call_openrouter_api(system, user, max_tokens=max_tokens, temperature=temperature)
        if text:
            return text, model

    return None, None


@router.post("", response_model=AIResponse)
async def ai_assistant(req: AIRequest, current_user: User = Depends(get_current_user)):
    """Handle dynamic AI Assistant requests (explain, bug_detect, improve, generate, chat)."""
    action = req.action.lower().strip()
    if action not in {"explain", "bug_detect", "improve", "generate", "chat"}:
        action = "chat"

    # Graceful handling when AI API key is missing
    if not AI_API_KEY or not AI_API_KEY.strip():
        return AIResponse(
            action=action,
            result=(
                "⚠️ **AI service is not configured.**\n\n"
                "Add `GEMINI_API_KEY` or `OPENROUTER_API_KEY` to backend `.env` to enable AI features.\n\n"
                "**Setup Instructions:**\n"
                "1. Get an API key from [OpenRouter](https://openrouter.ai/) or [Google AI Studio](https://aistudio.google.com/).\n"
                "2. Add your key to `backend/.env`.\n"
                "3. Restart the backend server."
            ),
            model_used="unconfigured",
        )

    language = req.language or "python"
    sys_prompt = _system_prompt(action, language)
    usr_prompt = _build_user_prompt(
        action=action,
        code=req.code,
        language=language,
        prompt=req.prompt or "",
        error_output=req.error_output or "",
        file_name=req.file_name,
        project_files=req.project_files,
        chat_history=req.chat_history,
    )

    text, used_model = await _call_ai_service(sys_prompt, usr_prompt, max_tokens=3000, temperature=0.3)
    if text:
        return AIResponse(action=action, result=text.strip(), model_used=used_model or AI_MODEL or "llm")

    return AIResponse(
        action=action,
        result="⚠️ The AI service did not return a response. Please check your network connection or API quota.",
        model_used="service-unavailable",
    )


@router.post("/complete", response_model=AICompletionResponse)
async def ai_complete(req: AICompletionRequest, current_user: User = Depends(get_current_user)):
    """Monaco inline code completion powered by LLM with debounce."""
    if not AI_API_KEY or not AI_API_KEY.strip():
        return AICompletionResponse(completion="", model_used="unconfigured")

    if not req.code_before.strip():
        return AICompletionResponse(completion="", model_used="none")

    sys_prompt = (
        f"You are a lightning-fast, high-accuracy inline code completion engine for {req.language}. "
        f"Given the code preceding the cursor and trailing the cursor, output ONLY the exact 1 to 4 lines "
        f"of code that immediately continues at the cursor position.\n"
        f"Rules:\n"
        f"1. Output ONLY the raw continuous code snippet.\n"
        f"2. Do NOT output markdown fences (no ```).\n"
        f"3. Do NOT output explanations or comments.\n"
        f"4. If no single high-probability completion fits, return an empty response."
    )
    usr_prompt = (
        f"File: {req.file_name or 'unnamed'}\n\n"
        f"--- CODE BEFORE CURSOR ---\n{req.code_before}\n"
        f"--- CODE AFTER CURSOR ---\n{req.code_after}\n"
    )

    text, used_model = await _call_ai_service(sys_prompt, usr_prompt, max_tokens=128, temperature=0.1)
    if text:
        clean = text.strip()
        # Clean off any accidental markdown code fences
        if clean.startswith("```"):
            lines = clean.split("\n")
            if len(lines) > 1:
                clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            else:
                clean = clean.replace("```", "").strip()
        return AICompletionResponse(completion=clean.rstrip(), model_used=used_model or AI_MODEL or "llm")

    return AICompletionResponse(completion="", model_used="none")


@router.post("/agent", response_model=AIAgentResponse)
async def ai_agent_endpoint(
    req: AIAgentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """AI Agent endpoint — can operate on workspace files via tool calls."""
    if not AI_API_KEY or not AI_API_KEY.strip():
        return AIAgentResponse(
            steps=[],
            final_response=(
                "⚠️ **AI service is not configured.**\n\n"
                "Add `GEMINI_API_KEY` or `OPENROUTER_API_KEY` to backend `.env` to enable AI agent."
            ),
            model_used="unconfigured",
            files_modified=[],
        )

    code_normalized = req.room_code.upper().strip()
    room = db.query(Room).filter(Room.room_code == code_normalized).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    # Get current file list
    files = db.query(ProjectFile).filter(ProjectFile.room_id == room.id).all()
    file_names = [f.name for f in files]

    # Build agent system prompt
    sys_prompt = build_agent_system_prompt(file_names)

    # Build user prompt with context
    user_parts = [f"User request: {req.prompt}"]
    if req.active_file:
        active = next((f for f in files if f.name == req.active_file), None)
        if active:
            user_parts.append(f"\nActive file: {active.name}\n```{active.language}\n{active.content}\n```")

    if req.chat_history:
        user_parts.append("\nPrevious conversation:")
        for msg in req.chat_history[-4:]:
            speaker = "User" if msg.role == "user" else "AI"
            user_parts.append(f"{speaker}: {msg.content}")

    user_prompt = "\n".join(user_parts)

    # Helper to execute code via the execution provider
    async def run_code_fn(language: str, filename: str, content: str) -> dict:
        from .execution import local_provider, piston_provider, judge0_provider, _normalise, _can_run_locally, LANGUAGE_REGISTRY
        lang_key = _normalise(language)
        if lang_key not in LANGUAGE_REGISTRY:
            return {"status": "error", "output": f"Language '{language}' not supported."}
        files_payload = [{"name": filename, "content": content}]
        if _can_run_locally(lang_key):
            result = await local_provider.execute(lang_key, files_payload, filename, "")
        else:
            result = await judge0_provider.execute(lang_key, files_payload, filename, "")
        return {"status": result.status, "output": result.output}

    all_steps = []
    all_files_modified = []
    max_iterations = 3  # Prevent infinite loops

    for iteration in range(max_iterations):
        # Call AI
        text, used_model = await _call_ai_service(
            sys_prompt, user_prompt,
            max_tokens=4000, temperature=0.3
        )

        if not text:
            return AIAgentResponse(
                steps=all_steps,
                final_response="⚠️ AI service did not return a response.",
                model_used="service-unavailable",
                files_modified=all_files_modified,
            )

        # Parse response
        parsed = parse_agent_response(text)
        tool_calls_raw = parsed.get("tool_calls", [])

        if not tool_calls_raw:
            # No tool calls — just a chat response
            step = AIAgentStep(
                thought=parsed.get("thoughts", ""),
                tool_calls=[],
                response=parsed.get("response", text),
            )
            all_steps.append(step)
            break

        # Execute tools
        results, modified = await execute_agent_tools(
            parsed, room.id, code_normalized, current_user.id,
            execution_fn=run_code_fn,
        )
        all_files_modified.extend(modified)

        step = AIAgentStep(
            thought=parsed.get("thoughts", ""),
            tool_calls=[
                AIToolCall(tool=r["tool"], args=r["args"], result=r["result"])
                for r in results
            ],
            response=parsed.get("response", ""),
        )
        all_steps.append(step)

        # If we have a final response, we're done
        if parsed.get("response") and parsed["response"].strip():
            break

        # Otherwise, build follow-up prompt with tool results
        results_text = "\n".join(
            f"Tool {r['tool']}({r['args']}): {r['result']}" for r in results
        )
        user_prompt = f"Tool execution results:\n{results_text}\n\nProvide your final response to the user based on these results."

    final_response = ""
    if all_steps:
        final_response = all_steps[-1].response or ""
        if not final_response:
            # Fallback: concatenate tool results
            for step in all_steps:
                for tc in step.tool_calls:
                    if tc.result:
                        final_response += tc.result + "\n"

    return AIAgentResponse(
        steps=all_steps,
        final_response=final_response.strip() or "Agent completed with no response.",
        model_used=used_model or AI_MODEL or "llm",
        files_modified=list(set(all_files_modified)),
    )
