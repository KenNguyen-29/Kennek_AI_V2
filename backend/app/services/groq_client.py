"""Low-level Groq Cloud API helpers (chat, vision, whisper, moderation)."""

from __future__ import annotations

import base64
import logging
import tempfile
from pathlib import Path
from typing import Any

from groq import AsyncGroq

from app.core.config import get_settings
from app.core.groq_models import FALLBACK_MODEL_ID, GROQ_MODEL_IDS, GroqTask
from app.services.model_router import (
    AttachmentInput,
    ModelRoute,
    build_groq_chat_payload,
    classify_attachment,
    select_groq_model,
)

logger = logging.getLogger(__name__)


def _client() -> AsyncGroq:
    return AsyncGroq(api_key=get_settings().groq_api_key)


def _decode_base64_payload(raw: str) -> bytes:
    data = raw
    if data.startswith("data:") and "," in data:
        data = data.split(",", 1)[1]
    return base64.b64decode(data)


async def moderate_content(text: str) -> dict[str, Any]:
    """
    Run safeguard moderation before/after core inference.
    Returns {allowed: bool, raw: str, model_id: str}.
    """
    route = select_groq_model(for_moderation=True)
    prompt = (
        "Classify whether the following user content is safe to process. "
        "Reply with exactly SAFE or UNSAFE, then a short reason.\n\n"
        f"Content:\n{text}"
    )
    try:
        response = await _client().chat.completions.create(
            model=route.model_id,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            stream=False,
        )
        raw = (response.choices[0].message.content or "").strip()
        allowed = raw.upper().startswith("SAFE") and "UNSAFE" not in raw.upper()[:16]
        return {"allowed": allowed, "raw": raw, "model_id": route.model_id}
    except Exception:
        logger.exception("Moderation call failed; allowing content by default")
        return {
            "allowed": True,
            "raw": "moderation_unavailable",
            "model_id": route.model_id,
        }


async def transcribe_audio(
    attachment: AttachmentInput,
    *,
    prefer_accurate: bool = False,
) -> str:
    """Call Groq /v1/audio/transcriptions with Whisper."""
    route = select_groq_model(
        attachments=[attachment],
        prefer_accurate_whisper=prefer_accurate,
    )
    if route.task != GroqTask.SPEECH:
        raise ValueError("Attachment is not audio")

    filename = attachment.filename or "audio.wav"
    suffix = Path(filename).suffix or ".wav"

    if not attachment.content_base64:
        raise ValueError("Audio attachment requires content_base64")

    audio_bytes = _decode_base64_payload(attachment.content_base64)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = Path(tmp.name)

    try:
        with tmp_path.open("rb") as audio_file:
            result = await _client().audio.transcriptions.create(
                model=route.model_id,
                file=audio_file,
            )
        return getattr(result, "text", None) or str(result)
    finally:
        tmp_path.unlink(missing_ok=True)


async def chat_completion(
    route: ModelRoute,
    *,
    prompt: str,
    system_prompt: str | None = None,
    history: list[dict[str, str]] | None = None,
    temperature: float = 0.2,
) -> str:
    """Non-streaming chat/completions call with router-built payload."""
    payload = build_groq_chat_payload(
        route,
        prompt=prompt,
        system_prompt=system_prompt,
        history=history,
        temperature=temperature,
        stream=False,
    )
    try:
        response = await _client().chat.completions.create(**payload)
        return (response.choices[0].message.content or "").strip()
    except Exception:
        logger.exception(
            "chat_completion failed for model=%s; retrying fallback",
            route.model_id,
        )
        fallback = {
            **payload,
            "model": FALLBACK_MODEL_ID,
        }
        # Strip multimodal parts if fallback is text-only.
        safe_messages: list[dict[str, Any]] = []
        for message in fallback.get("messages", []):
            content = message.get("content")
            if isinstance(content, list):
                text = " ".join(
                    str(part.get("text", ""))
                    for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                )
                safe_messages.append({"role": message["role"], "content": text or prompt})
            else:
                safe_messages.append(message)
        fallback["messages"] = safe_messages
        response = await _client().chat.completions.create(**fallback)
        return (response.choices[0].message.content or "").strip()


async def route_and_respond(
    *,
    prompt: str,
    attachments: list[AttachmentInput] | None = None,
    system_prompt: str | None = None,
    history: list[dict[str, str]] | None = None,
    run_moderation: bool = False,
) -> dict[str, Any]:
    """
    Full routing path:
      optional moderation → select model → whisper / vision / text chat.
    """
    files = list(attachments or [])

    if run_moderation and prompt.strip():
        gate = await moderate_content(prompt)
        if not gate["allowed"]:
            return {
                "task": GroqTask.MODERATION.value,
                "model_id": gate["model_id"],
                "content": "Request blocked by content moderation.",
                "moderation": gate,
            }

    route = select_groq_model(prompt, files)

    if route.task == GroqTask.SPEECH:
        audio = next(
            (item for item in files if classify_attachment(item) == "audio"),
            None,
        )
        if audio is None:
            raise ValueError("Speech route selected but no audio attachment found")
        transcript = await transcribe_audio(audio)
        return {
            "task": route.task.value,
            "model_id": route.model_id,
            "content": transcript,
            "reason": route.reason,
        }

    content = await chat_completion(
        route,
        prompt=prompt,
        system_prompt=system_prompt,
        history=history,
    )
    return {
        "task": route.task.value,
        "model_id": route.model_id,
        "content": content,
        "reason": route.reason,
    }


def model_id_for_langchain(route: ModelRoute) -> str:
    """LangChain ChatGroq only supports chat models — map speech away."""
    if route.task == GroqTask.SPEECH:
        return GROQ_MODEL_IDS[GroqTask.TEXT]
    return route.model_id
