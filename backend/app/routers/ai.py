import httpx
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends
from ..models import User
from ..auth import get_current_user
from ..config import AI_API_KEY, AI_MODEL
from ..schemas import AIRequest, AIResponse, AICompletionRequest, AICompletionResponse, AIChatMessage

logger = logging.getLogger("ai")
router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])

FALLBACK_MODELS = [AI_MODEL, "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
# Remove duplicates while preserving order
UNIQUE_MODELS = list(dict.fromkeys(m for m in FALLBACK_MODELS if m))


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
        for msg in chat_history[-6:]:  # include up to last 6 messages
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


async def _call_gemini_api(system: str, user: str, max_tokens: int = 2048, temperature: float = 0.2) -> tuple[Optional[str], Optional[str]]:
    """Call Google Gemini API with fallback models."""
    if not AI_API_KEY or not AI_API_KEY.strip():
        return None, None

    for model in UNIQUE_MODELS:
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
                "Add `GEMINI_API_KEY` to backend `.env` to enable AI features.\n\n"
                "**Setup Instructions:**\n"
                "1. Get a free API key at [Google AI Studio](https://aistudio.google.com/).\n"
                "2. Add `GEMINI_API_KEY=your_actual_key_here` to `backend/.env`.\n"
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

    text, used_model = await _call_gemini_api(sys_prompt, usr_prompt, max_tokens=3000, temperature=0.3)
    if text:
        return AIResponse(action=action, result=text.strip(), model_used=used_model or AI_MODEL)

    return AIResponse(
        action=action,
        result="⚠️ The AI service did not return a response. Please check your network connection or API quota.",
        model_used="service-unavailable",
    )


@router.post("/complete", response_model=AICompletionResponse)
async def ai_complete(req: AICompletionRequest, current_user: User = Depends(get_current_user)):
    """Monaco inline code completion powered by Gemini with debounce."""
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

    text, used_model = await _call_gemini_api(sys_prompt, usr_prompt, max_tokens=128, temperature=0.1)
    if text:
        clean = text.strip()
        # Clean off any accidental markdown code fences
        if clean.startswith("```"):
            lines = clean.split("\n")
            if len(lines) > 1:
                clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            else:
                clean = clean.replace("```", "").strip()
        return AICompletionResponse(completion=clean.rstrip(), model_used=used_model or AI_MODEL)

    return AICompletionResponse(completion="", model_used="none")
