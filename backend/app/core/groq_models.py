"""Canonical Groq Cloud model IDs used by the request router."""

from enum import Enum


class GroqTask(str, Enum):
    TEXT = "text"
    REASONING = "reasoning"
    VISION = "vision"
    SPEECH = "speech"
    MODERATION = "moderation"


# Routing matrix — keep IDs exact to Groq Cloud catalog.
GROQ_MODEL_IDS: dict[GroqTask, str] = {
    GroqTask.TEXT: "llama-3.3-70b-versatile",
    GroqTask.REASONING: "deepseek-r1-distill-llama-70b",
    GroqTask.VISION: "qwen/qwen3.6-27b",
    GroqTask.SPEECH: "whisper-large-v3-turbo",
    GroqTask.MODERATION: "openai/gpt-oss-safeguard-20b",
}

# Higher-accuracy Whisper fallback when turbo quality is insufficient.
WHISPER_ACCURATE_MODEL = "whisper-large-v3"

FALLBACK_MODEL_ID = GROQ_MODEL_IDS[GroqTask.TEXT]

CHAT_COMPLETIONS_ENDPOINT = "/v1/chat/completions"
AUDIO_TRANSCRIPTIONS_ENDPOINT = "/v1/audio/transcriptions"
