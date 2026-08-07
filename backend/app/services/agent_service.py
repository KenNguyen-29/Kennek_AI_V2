import asyncio
import json
import logging
from collections.abc import AsyncIterator, Sequence
from typing import Any

from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_community.utilities.tavily_search import TavilySearchAPIWrapper
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from app.agent.system_prompt import DOCUMENT_PROCESSOR_SYSTEM_PROMPT
from app.core.config import get_settings
from app.core.groq_models import FALLBACK_MODEL_ID, GroqTask
from app.services.groq_client import moderate_content, transcribe_audio
from app.services.model_router import (
    AttachmentInput,
    ModelRoute,
    build_vision_messages,
    select_groq_model,
)
from app.services.vector_service import query_vector_store

logger = logging.getLogger(__name__)
TAVILY_MAX_RESULTS = 6


def _format_sse(payload: dict[str, str]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _normalize_history(
    chat_history: Sequence[dict[str, Any]],
) -> list[dict[str, str]]:
    history = [
        {"role": message["role"], "content": message["content"]}
        for message in chat_history
        if message.get("role") in {"user", "assistant", "system"}
        and isinstance(message.get("content"), str)
        and message["content"].strip()
    ]
    return [
        message
        for message in history
        if not (
            message["role"] == "assistant"
            and (
                message["content"].startswith("Đã tiếp nhận")
                or message["content"].startswith("**Lỗi")
            )
        )
    ]


def _build_chat_model(model_id: str, *, temperature: float = 0.2) -> ChatGroq:
    settings = get_settings()
    try:
        return ChatGroq(
            api_key=settings.groq_api_key,
            model=model_id,
            streaming=True,
            temperature=temperature,
        )
    except Exception:
        logger.exception(
            "Failed to init ChatGroq(%s); falling back to %s",
            model_id,
            FALLBACK_MODEL_ID,
        )
        return ChatGroq(
            api_key=settings.groq_api_key,
            model=FALLBACK_MODEL_ID,
            streaming=True,
            temperature=temperature,
        )


def _run_tavily_search(query: str, *, max_results: int = TAVILY_MAX_RESULTS) -> str:
    """Always-on web search; returns a readable block for the LLM."""
    settings = get_settings()
    if not settings.tavily_api_key:
        logger.warning("TAVILY_API_KEY missing; skipping auto web search")
        return ""

    search = TavilySearchResults(
        max_results=max_results,
        api_wrapper=TavilySearchAPIWrapper(
            tavily_api_key=settings.tavily_api_key,
        ),
    )
    try:
        raw = search.invoke({"query": query})
    except Exception:
        logger.exception("Auto Tavily search failed")
        return ""

    items: list[Any]
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            items = parsed if isinstance(parsed, list) else [{"content": raw}]
        except json.JSONDecodeError:
            return raw.strip()
    else:
        items = [raw]

    lines: list[str] = []
    for index, item in enumerate(items, start=1):
        if isinstance(item, dict):
            title = str(item.get("title") or item.get("url") or f"Result {index}")
            url = str(item.get("url") or "").strip()
            content = str(
                item.get("content")
                or item.get("snippet")
                or item.get("raw_content")
                or "",
            ).strip()
            header = f"[{index}] {title}"
            if url:
                header = f"{header}\nURL: {url}"
            body = content or "(no snippet)"
            lines.append(f"{header}\n{body}")
        else:
            lines.append(f"[{index}] {item}")

    return "\n\n".join(lines).strip()


def _extract_plain_text(chunk: Any) -> str:
    content = getattr(chunk, "content", "")
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text") or ""))
        return "".join(parts)
    return content if isinstance(content, str) else ""


def _history_to_lc_messages(history: list[dict[str, str]]) -> list[Any]:
    lc_messages: list[Any] = []
    for message in history[-8:]:
        role = message["role"]
        content = message["content"]
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
        elif role == "system":
            lc_messages.append(SystemMessage(content=content))
    return lc_messages


async def _stream_research_answer(
    *,
    query: str,
    history: list[dict[str, str]],
    model_id: str,
    temperature: float = 0.2,
    system_prompt: str | None = None,
) -> AsyncIterator[str]:
    """Always search Tavily (+ optional KB), then synthesize a full final answer."""
    yield _format_sse(
        {"type": "status", "content": "Searching web via Tavily..."},
    )
    web_block = await asyncio.to_thread(_run_tavily_search, query)

    kb_contexts = await asyncio.to_thread(query_vector_store, query)
    if kb_contexts:
        yield _format_sse(
            {"type": "status", "content": "Reading uploaded documents..."},
        )

    yield _format_sse(
        {"type": "status", "content": "Synthesizing detailed answer..."},
    )

    prompt = system_prompt or DOCUMENT_PROCESSOR_SYSTEM_PROMPT
    research_rules = (
        f"{prompt}\n\n"
        "Bạn ĐÃ được cung cấp kết quả tìm kiếm web (Tavily) và có thể có kho tri thức. "
        "Hãy tổng hợp thành một câu trả lời cuối **đầy đủ, chi tiết, cập nhật nhất**. "
        "Ưu tiên nguồn web khi thông tin thay đổi theo thời gian. "
        "Trích dẫn URL quan trọng. Không trả lời quá ngắn."
    )

    parts = [f"Câu hỏi của người dùng:\n{query}"]
    if web_block:
        parts.append(f"Kết quả tìm kiếm web (Tavily):\n{web_block}")
    else:
        parts.append(
            "Kết quả tìm kiếm web (Tavily): (không có / lỗi). "
            "Hãy trả lời dựa trên kiến thức của bạn và ghi rõ phần nào có thể đã cũ.",
        )
    if kb_contexts:
        parts.append(
            "Nội dung tài liệu từ kho tri thức:\n"
            + "\n\n---\n\n".join(kb_contexts),
        )

    user_content = "\n\n".join(parts)
    lc_messages: list[Any] = [SystemMessage(content=research_rules)]
    lc_messages.extend(_history_to_lc_messages(history))
    lc_messages.append(HumanMessage(content=user_content))

    async for chunk in _build_chat_model(model_id, temperature=temperature).astream(
        lc_messages,
    ):
        text = _extract_plain_text(chunk)
        if text:
            yield _format_sse({"type": "token", "content": text})


async def _stream_vision_answer(
    *,
    query: str,
    history: list[dict[str, str]],
    route: ModelRoute,
    temperature: float = 0.2,
) -> AsyncIterator[str]:
    yield _format_sse(
        {"type": "status", "content": "Analyzing image (vision / OCR)..."},
    )
    messages = build_vision_messages(
        prompt=query,
        attachments=route.attachments,
        system_prompt=DOCUMENT_PROCESSOR_SYSTEM_PROMPT,
        history=history,
    )
    # LangChain HumanMessage accepts multimodal content lists.
    lc_messages: list[Any] = []
    for message in messages:
        role = message["role"]
        content = message["content"]
        if role == "system":
            lc_messages.append(SystemMessage(content=content if isinstance(content, str) else str(content)))
        elif role == "assistant":
            lc_messages.append(
                AIMessage(content=content if isinstance(content, str) else str(content)),
            )
        else:
            lc_messages.append(HumanMessage(content=content))

    async for chunk in _build_chat_model(
        route.model_id,
        temperature=temperature,
    ).astream(lc_messages):
        text = _extract_plain_text(chunk)
        if text:
            yield _format_sse({"type": "token", "content": text})


async def stream_agent_response(
    query: str,
    chat_history: Sequence[dict[str, Any]],
    attachments: Sequence[AttachmentInput] | None = None,
    *,
    temperature: float = 0.2,
    active_command: str | None = None,
    prompt_mode: str | None = "auto",
) -> AsyncIterator[str]:
    history = _normalize_history(chat_history)
    files = list(attachments or [])
    settings = get_settings()
    temperature = max(0.0, min(1.0, float(temperature)))
    command = (active_command or "").strip().lower() or None
    mode = (prompt_mode or "auto").strip().lower() or "auto"

    command_system_prompts = {
        "pdf": (
            f"{DOCUMENT_PROCESSOR_SYSTEM_PROMPT}\n\n"
            "Mode @pdf: prioritize reading and analyzing PDF/Word documents. "
            "Summarize structure, extract key points, tables, and figures. "
            "Use the knowledge base when uploaded docs are available."
        ),
        "excel": (
            f"{DOCUMENT_PROCESSOR_SYSTEM_PROMPT}\n\n"
            "Mode @excel: focus on spreadsheets, CSV, formulas, and structured tables. "
            "Propose columns, aggregations, and clear tabular layouts."
        ),
        "code": (
            f"{DOCUMENT_PROCESSOR_SYSTEM_PROMPT}\n\n"
            "Mode code: act as a senior engineer. Write correct, idiomatic code, "
            "debug carefully, and explain trade-offs briefly."
        ),
        "vision": (
            f"{DOCUMENT_PROCESSOR_SYSTEM_PROMPT}\n\n"
            "Mode @vision: describe images, OCR on-screen text, and highlight UI issues."
        ),
        "reasoning": (
            f"{DOCUMENT_PROCESSOR_SYSTEM_PROMPT}\n\n"
            "Mode reasoning: use careful chain-of-thought for math, logic, "
            "and hard debugging problems."
        ),
        "fast": (
            f"{DOCUMENT_PROCESSOR_SYSTEM_PROMPT}\n\n"
            "Mode fast: answer briefly and directly. Prefer short, actionable replies."
        ),
        "balanced": DOCUMENT_PROCESSOR_SYSTEM_PROMPT,
    }

    try:
        if settings.enable_content_moderation and query.strip():
            gate = await moderate_content(query)
            if not gate["allowed"]:
                yield _format_sse(
                    {
                        "type": "error",
                        "content": "Request blocked by content moderation.",
                    },
                )
                return

        route = select_groq_model(
            query,
            files,
            active_command=command,
            prompt_mode=mode,
        )
        yield _format_sse(
            {
                "type": "status",
                "content": f"Routing → {route.model_id} ({route.task.value})",
            },
        )

        # Speech-to-text first, then continue as text analysis on transcript.
        if route.task == GroqTask.SPEECH:
            yield _format_sse(
                {"type": "status", "content": "Transcribing audio..."},
            )
            audio = next(
                (
                    item
                    for item in files
                    if (item.kind == "audio")
                    or (item.filename and item.filename.lower().endswith(
                        (".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"),
                    ))
                    or (item.mime_type or "").startswith("audio/")
                ),
                files[0] if files else None,
            )
            if audio is None:
                raise ValueError("Speech route selected but no audio attachment found")

            transcript = await transcribe_audio(audio)
            yield _format_sse(
                {
                    "type": "status",
                    "content": "Transcription complete. Analyzing text...",
                },
            )
            query = (
                f"{query.strip()}\n\n[Transcript]\n{transcript}".strip()
                if query.strip()
                else transcript
            )
            route = select_groq_model(
                query,
                attachments=None,
                active_command=command,
                prompt_mode=mode,
            )

        if route.task == GroqTask.VISION:
            has_image = any(
                (item.kind == "image")
                or (item.mime_type or "").startswith("image/")
                or (
                    item.filename
                    and item.filename.lower().endswith(
                        (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"),
                    )
                )
                for item in files
            )
            if has_image:
                async for chunk in _stream_vision_answer(
                    query=query,
                    history=history,
                    route=route,
                    temperature=temperature,
                ):
                    yield chunk
                return

            # Vision mode without image → auto Tavily + KB synthesis.
            async for chunk in _stream_research_answer(
                query=query,
                history=history,
                model_id=route.model_id,
                temperature=temperature,
                system_prompt=command_system_prompts.get(
                    "vision",
                    DOCUMENT_PROCESSOR_SYSTEM_PROMPT,
                ),
            ):
                yield chunk
            return

        # All text modes: always Tavily (+ KB if any), then full synthesized answer.
        prompt_key = command or (
            "reasoning" if route.task == GroqTask.REASONING else mode
        )
        system_prompt = command_system_prompts.get(
            prompt_key,
            DOCUMENT_PROCESSOR_SYSTEM_PROMPT,
        )
        agent_temperature = 0.1 if mode == "fast" else temperature

        async for chunk in _stream_research_answer(
            query=query,
            history=history,
            model_id=route.model_id,
            temperature=agent_temperature,
            system_prompt=system_prompt,
        ):
            yield chunk
    except Exception:
        logger.exception("Agent streaming failed")
        yield _format_sse(
            {"type": "error", "content": "Unable to generate a response."},
        )
