"""Groq model router: classify request/attachment → model_id + API payload."""

from __future__ import annotations

import logging
import mimetypes
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from app.core.groq_models import (
    AUDIO_TRANSCRIPTIONS_ENDPOINT,
    BALANCED_MODEL_ID,
    CHAT_COMPLETIONS_ENDPOINT,
    FALLBACK_MODEL_ID,
    FAST_MODEL_ID,
    GROQ_MODEL_IDS,
    WHISPER_ACCURATE_MODEL,
    GroqTask,
)

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".mpeg"}
TEXT_EXTENSIONS = {
    ".txt",
    ".csv",
    ".json",
    ".md",
    ".log",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".html",
    ".xml",
    ".yaml",
    ".yml",
    ".sql",
    ".toml",
    ".ini",
    ".cfg",
    ".c",
    ".cpp",
    ".h",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".sh",
    ".pdf",
    ".docx",
    ".doc",
    ".xlsx",
    ".xls",
}

IMAGE_MIME_PREFIXES = ("image/",)
AUDIO_MIME_PREFIXES = ("audio/",)

# Deep reasoning / complex math / hard debug signals (VI + EN, with/without diacritics).
_REASONING_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE | re.UNICODE)
    for pattern in (
        r"\bgiai\s+toan\b",
        r"\bgiải\s+toán\b",
        r"\bchung\s+minh\b",
        r"\bchứng\s+minh\b",
        r"\bsuy\s+luan\b",
        r"\bsuy\s+luận\b",
        r"\btung\s+buoc\b",
        r"\btừng\s+bước\b",
        r"\bphuong\s+trinh\b",
        r"\bphương\s+trình\b",
        r"\bthuat\s+toan\b",
        r"\bthuật\s+toán\b",
        r"\bdo\s+phuc\s+tap\b",
        r"\bđộ\s+phức\s+tạp\b",
        r"\bdebug\s+(loi|lỗi|bug|he\s+thong|hệ\s+thống)\b",
        r"\breason(ing)?\b",
        r"\bchain[- ]of[- ]thought\b",
        r"\bstep[- ]by[- ]step\b",
        r"\bprove\b",
        r"\btheorem\b",
        r"\balgorithm(ic)?\b",
        r"\b(complex|advanced)\s+(math|logic|proof)\b",
        r"\b(dynamic|leverage)\s+programming\b",
        r"\b(big[- ]?o|time\s+complexity)\b",
        r"\b(integral|derivative|differential|matrix|eigen)\b",
        r"∫|∑|√|≥|≤|≠",
        r"\bn!\b",
        r"\bO\([^)]+\)",
        r"\bquy\s+nap\b",
        r"\bquy\s+nạp\b",
    )
)


AttachmentKind = Literal["image", "audio", "text", "unknown"]


@dataclass(slots=True)
class AttachmentInput:
    """Client attachment metadata used for routing."""

    filename: str | None = None
    mime_type: str | None = None
    content_base64: str | None = None
    url: str | None = None
    kind: AttachmentKind | None = None


@dataclass(slots=True)
class ModelRoute:
    task: GroqTask
    model_id: str
    endpoint: str
    reason: str
    attachments: list[AttachmentInput] = field(default_factory=list)


def _extension_of(filename: str | None) -> str:
    if not filename:
        return ""
    return Path(filename).suffix.lower()


def _guess_mime(filename: str | None, mime_type: str | None) -> str | None:
    if mime_type and mime_type.strip():
        return mime_type.strip().lower()
    if filename:
        guessed, _ = mimetypes.guess_type(filename)
        return guessed.lower() if guessed else None
    return None


def classify_attachment(attachment: AttachmentInput) -> AttachmentKind:
    if attachment.kind in {"image", "audio", "text"}:
        return attachment.kind

    mime = _guess_mime(attachment.filename, attachment.mime_type)
    ext = _extension_of(attachment.filename)

    if mime:
        if mime.startswith(IMAGE_MIME_PREFIXES):
            return "image"
        if mime.startswith(AUDIO_MIME_PREFIXES):
            return "audio"
        if mime.startswith("text/") or mime in {
            "application/json",
            "application/xml",
            "application/javascript",
            "application/csv",
            "text/csv",
        }:
            return "text"

    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    if ext in TEXT_EXTENSIONS:
        return "text"
    return "unknown"


def _prompt_needs_reasoning(prompt: str) -> bool:
    text = (prompt or "").strip()
    if not text:
        return False
    return any(pattern.search(text) for pattern in _REASONING_PATTERNS)


def select_groq_model(
    prompt: str = "",
    attachments: list[AttachmentInput] | None = None,
    *,
    for_moderation: bool = False,
    prefer_accurate_whisper: bool = False,
    active_command: str | None = None,
    prompt_mode: str | None = None,
) -> ModelRoute:
    """
    Classify request/attachment and return the Groq model route.

    Priority:
      1. Moderation (explicit gate)
      2. Audio → Whisper
      3. Explicit @ command override (pdf/excel/vision/code/reasoning)
      4. Prompt mode combobox (fast / balanced / reasoning / code)
      5. Image / vision → Qwen
      6. Deep reasoning keywords → DeepSeek R1
      7. Default text / code / CSV / JSON → Llama 3.3 70B
    """
    try:
        if for_moderation:
            return ModelRoute(
                task=GroqTask.MODERATION,
                model_id=GROQ_MODEL_IDS[GroqTask.MODERATION],
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason="Content moderation / safeguard gate",
            )

        files = list(attachments or [])
        kinds = [classify_attachment(item) for item in files]

        if any(kind == "audio" for kind in kinds):
            model_id = (
                WHISPER_ACCURATE_MODEL
                if prefer_accurate_whisper
                else GROQ_MODEL_IDS[GroqTask.SPEECH]
            )
            return ModelRoute(
                task=GroqTask.SPEECH,
                model_id=model_id,
                endpoint=AUDIO_TRANSCRIPTIONS_ENDPOINT,
                reason="Audio attachment detected (speech-to-text)",
                attachments=files,
            )

        command = (active_command or "").strip().lower() or None
        if command == "vision":
            return ModelRoute(
                task=GroqTask.VISION,
                model_id=GROQ_MODEL_IDS[GroqTask.VISION],
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason="Active command @vision",
                attachments=files,
            )
        if command == "reasoning":
            return ModelRoute(
                task=GroqTask.REASONING,
                model_id=GROQ_MODEL_IDS[GroqTask.REASONING],
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason="Active command @reasoning",
                attachments=files,
            )
        if command in {"pdf", "excel", "code"}:
            return ModelRoute(
                task=GroqTask.TEXT,
                model_id=GROQ_MODEL_IDS[GroqTask.TEXT],
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason=f"Active command @{command}",
                attachments=files,
            )

        mode = (prompt_mode or "auto").strip().lower() or "auto"
        if mode == "fast":
            return ModelRoute(
                task=GroqTask.TEXT,
                model_id=FAST_MODEL_ID,
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason="Prompt mode: fast",
                attachments=files,
            )
        if mode == "balanced":
            return ModelRoute(
                task=GroqTask.TEXT,
                model_id=BALANCED_MODEL_ID,
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason="Prompt mode: balanced",
                attachments=files,
            )
        if mode == "reasoning":
            return ModelRoute(
                task=GroqTask.REASONING,
                model_id=GROQ_MODEL_IDS[GroqTask.REASONING],
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason="Prompt mode: reasoning",
                attachments=files,
            )
        if mode == "code":
            return ModelRoute(
                task=GroqTask.TEXT,
                model_id=BALANCED_MODEL_ID,
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason="Prompt mode: code",
                attachments=files,
            )

        if any(kind == "image" for kind in kinds):
            return ModelRoute(
                task=GroqTask.VISION,
                model_id=GROQ_MODEL_IDS[GroqTask.VISION],
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason="Image attachment detected (vision / OCR)",
                attachments=files,
            )

        if _prompt_needs_reasoning(prompt):
            return ModelRoute(
                task=GroqTask.REASONING,
                model_id=GROQ_MODEL_IDS[GroqTask.REASONING],
                endpoint=CHAT_COMPLETIONS_ENDPOINT,
                reason="Deep reasoning / complex math signals in prompt",
                attachments=files,
            )

        return ModelRoute(
            task=GroqTask.TEXT,
            model_id=GROQ_MODEL_IDS[GroqTask.TEXT],
            endpoint=CHAT_COMPLETIONS_ENDPOINT,
            reason="Text / code / tabular string analysis",
            attachments=files,
        )
    except Exception:
        logger.exception("select_groq_model failed; falling back to text model")
        return ModelRoute(
            task=GroqTask.TEXT,
            model_id=FALLBACK_MODEL_ID,
            endpoint=CHAT_COMPLETIONS_ENDPOINT,
            reason="Fallback after router error",
            attachments=list(attachments or []),
        )


def _image_data_url(attachment: AttachmentInput) -> str | None:
    if attachment.url:
        return attachment.url
    if not attachment.content_base64:
        return None
    mime = _guess_mime(attachment.filename, attachment.mime_type) or "image/png"
    raw = attachment.content_base64
    if raw.startswith("data:"):
        return raw
    return f"data:{mime};base64,{raw}"


def build_chat_messages(
    *,
    prompt: str,
    system_prompt: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    for item in history or []:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant", "system"} and isinstance(content, str):
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": prompt})
    return messages


def build_vision_messages(
    *,
    prompt: str,
    attachments: list[AttachmentInput],
    system_prompt: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """OpenAI-compatible multimodal payload for Groq vision models."""
    messages = build_chat_messages(
        prompt="",
        system_prompt=system_prompt,
        history=history,
    )
    # Replace empty trailing user message with multimodal content parts.
    content_parts: list[dict[str, Any]] = [
        {"type": "text", "text": prompt or "Analyze the attached image(s)."},
    ]
    for attachment in attachments:
        if classify_attachment(attachment) != "image":
            continue
        data_url = _image_data_url(attachment)
        if not data_url:
            continue
        content_parts.append(
            {
                "type": "image_url",
                "image_url": {"url": data_url},
            },
        )

    if messages and messages[-1].get("role") == "user" and not messages[-1].get("content"):
        messages[-1] = {"role": "user", "content": content_parts}
    else:
        messages.append({"role": "user", "content": content_parts})
    return messages


def build_groq_chat_payload(
    route: ModelRoute,
    *,
    prompt: str,
    system_prompt: str | None = None,
    history: list[dict[str, str]] | None = None,
    temperature: float = 0.2,
    stream: bool = True,
) -> dict[str, Any]:
    """
    Build a chat/completions body shaped for the selected model.
    Vision routes use image_url parts; text/reasoning use plain content strings.
    """
    if route.task == GroqTask.SPEECH:
        raise ValueError(
            "Speech routes must use /v1/audio/transcriptions, not chat payload builder",
        )

    try:
        if route.task == GroqTask.VISION:
            messages = build_vision_messages(
                prompt=prompt,
                attachments=route.attachments,
                system_prompt=system_prompt,
                history=history,
            )
        else:
            messages = build_chat_messages(
                prompt=prompt,
                system_prompt=system_prompt,
                history=history,
            )

        return {
            "model": route.model_id,
            "messages": messages,
            "temperature": temperature,
            "stream": stream,
        }
    except Exception:
        logger.exception("build_groq_chat_payload failed; using text fallback payload")
        return {
            "model": FALLBACK_MODEL_ID,
            "messages": build_chat_messages(
                prompt=prompt,
                system_prompt=system_prompt,
                history=history,
            ),
            "temperature": temperature,
            "stream": stream,
        }


def resolve_model_id_safe(
    prompt: str = "",
    attachments: list[AttachmentInput] | None = None,
    **kwargs: Any,
) -> str:
    """Convenience helper: always returns a usable Groq model_id."""
    try:
        return select_groq_model(prompt, attachments, **kwargs).model_id
    except Exception:
        logger.exception("resolve_model_id_safe failed")
        return FALLBACK_MODEL_ID
