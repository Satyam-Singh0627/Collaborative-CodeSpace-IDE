import httpx
import logging
from typing import Optional
from fastapi import APIRouter, Depends
from ..models import User
from ..auth import get_current_user
from ..config import AI_API_KEY, AI_MODEL
from ..schemas import AIRequest, AIResponse, AICompletionRequest, AICompletionResponse

logger = logging.getLogger("ai")
router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])


def _system_prompt(action: str, language: str) -> str:
    base = (
        f"You are an expert {language} software engineer and coding assistant in "
        f"a real-time collaborative development environment. "
        f"Provide direct, high-quality, practical advice with clean markdown and concise code examples."
    )
    extras = {
        "explain": " Clearly explain the logic, architecture, and purpose of the provided code snippet.",
        "bug_detect": " Identify runtime errors, logic bugs, edge cases, and performance anti-patterns. For each issue, provide the exact cause and the concrete fix.",
        "improve": " Suggest actionable improvements for clean code, type safety, performance, and best practices with code examples.",
        "generate": " Generate clean, correct, well-structured, and idiomatic code matching the user's prompt.",
        "chat": " Answer the developer's question accurately with full awareness of their active file, code context, and recent runtime errors.",
    }
    return base + extras.get(action, extras["chat"])


def _user_prompt(action: str, code: str, language: str, prompt: str, error_output: str, file_name: Optional[str] = None) -> str:
    parts: list[str] = []
    if file_name:
        parts.append(f"**File:** `{file_name}`")
    if prompt:
        parts.append(f"**Question / Instruction:** {prompt}")
    if code and code.strip():
        parts.append(f"\n**Code Context ({language}):**\n```{language}\n{code}\n```")
    if error_output and error_output.strip():
        parts.append(f"\n**Recent Execution Error / Console Output:**\n```\n{error_output.strip()}\n```")
    return "\n".join(parts) if parts else "No specific code context provided."


async def _call_gemini(system: str, user: str, max_tokens: int = 2048, temperature: float = 0.2) -> Optional[str]:
    if not AI_API_KEY or not AI_API_KEY.strip():
        return None
    try:
        async with httpx.AsyncClient(timeout=18.0) as client:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{AI_MODEL}:generateContent?key={AI_API_KEY}"
            payload = {
                "system_instruction": {"parts": [{"text": system}]},
                "contents": [{"parts": [{"text": user}]}],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens
                },
            }
            res = await client.post(url, json=payload)
            if res.status_code == 200:
                cands = res.json().get("candidates", [])
                if cands:
                    return cands[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            else:
                logger.warning(f"Gemini API returned status {res.status_code}: {res.text[:200]}")
    except Exception as exc:
        logger.error(f"Gemini API error: {exc}")
    return None


@router.post("", response_model=AIResponse)
async def ai_assistant(req: AIRequest, current_user: User = Depends(get_current_user)):
    """Handle AI Assistant requests (explain, bug_detect, improve, generate, chat)."""
    action = req.action.lower().strip()
    if action not in {"explain", "bug_detect", "improve", "generate", "chat"}:
        action = "chat"

    # If AI API key is not configured, explicitly inform the user without faking responses
    if not AI_API_KEY or not AI_API_KEY.strip():
        return AIResponse(
            action=action,
            result=(
                "⚠️ **AI Assistant is not configured.**\n\n"
                "To enable real-time AI code analysis, bug detection, and generation, "
                "set a valid `AI_API_KEY` (such as a Google Gemini API key) in the backend `.env` file."
            ),
            model_used="unconfigured",
        )

    language = req.language or "python"
    sys_prompt = _system_prompt(action, language)
    usr_prompt = _user_prompt(action, req.code, language, req.prompt or "", req.error_output or "")

    text = await _call_gemini(sys_prompt, usr_prompt)
    if text:
        return AIResponse(action=action, result=text.strip(), model_used=AI_MODEL)

    return AIResponse(
        action=action,
        result="⚠️ The AI service did not return a response. Please check your network connection or API quota.",
        model_used="service-unavailable",
    )


@router.post("/complete", response_model=AICompletionResponse)
async def ai_complete(req: AICompletionRequest, current_user: User = Depends(get_current_user)):
    """Monaco inline code completion powered by real LLM with debounce."""
    if not AI_API_KEY or not AI_API_KEY.strip():
        return AICompletionResponse(completion="", model_used="none")

    sys = (
        f"You are a fast inline code-completion engine for {req.language}. "
        f"Given the code before and after the cursor, generate the exact 1-3 lines of code to continue. "
        f"Output ONLY the raw code completion. Do NOT include markdown code blocks, backticks, or conversational text. "
        f"If no confident completion exists, return nothing."
    )
    usr = f"Code Before Cursor:\n{req.code_before}\n\nCode After Cursor:\n{req.code_after}"

    text = await _call_gemini(sys, usr, max_tokens=128, temperature=0.1)
    if text:
        clean = text.strip()
        # Clean off any accidental markdown fences
        if clean.startswith("```"):
            lines = clean.split("\n")
            clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return AICompletionResponse(completion=clean.strip(), model_used=AI_MODEL)

    return AICompletionResponse(completion="", model_used="none")
