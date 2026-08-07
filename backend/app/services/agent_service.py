import json
import logging
from collections.abc import AsyncIterator, Sequence
from typing import Any

from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_community.utilities.tavily_search import TavilySearchAPIWrapper
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent

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
TAVILY_TOOL_NAME = "tavily_search_results_json"
KNOWLEDGE_TOOL_NAME = "retrieve_knowledge_base"


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


@tool
def retrieve_knowledge_base(query: str) -> str:
    """Retrieve relevant context from uploaded documents in the knowledge base."""
    contexts = query_vector_store(query)
    if not contexts:
        return "No relevant context was found in the knowledge base."

    return "\n\n".join(
        f"[Context {index}] {context}"
        for index, context in enumerate(contexts, start=1)
    )


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


def _build_react_agent(model_id: str, *, temperature: float = 0.2) -> Any:
    settings = get_settings()
    model = _build_chat_model(model_id, temperature=temperature)
    search_tool = TavilySearchResults(
        api_wrapper=TavilySearchAPIWrapper(
            tavily_api_key=settings.tavily_api_key,
        ),
    )
    return create_react_agent(
        model=model,
        tools=[search_tool, retrieve_knowledge_base],
        prompt=DOCUMENT_PROCESSOR_SYSTEM_PROMPT,
    )


def _chunk_has_tool_calls(chunk: Any) -> bool:
    if getattr(chunk, "tool_call_chunks", None):
        return True
    additional_kwargs = getattr(chunk, "additional_kwargs", None) or {}
    if additional_kwargs.get("tool_calls") or additional_kwargs.get("function_call"):
        return True
    if getattr(chunk, "tool_calls", None):
        return True
    return False


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


async def _stream_rag_answer(
    *,
    query: str,
    history: list[dict[str, str]],
    contexts: list[str],
    model_id: str,
    temperature: float = 0.2,
) -> AsyncIterator[str]:
    yield _format_sse(
        {"type": "status", "content": "Reading uploaded documents..."},
    )

    context_block = "\n\n---\n\n".join(contexts)
    prompt = (
        f"{DOCUMENT_PROCESSOR_SYSTEM_PROMPT}\n\n"
        "Bạn ĐÃ nhận được nội dung tài liệu bên dưới. "
        "Hãy phân tích trực tiếp, không nói rằng chưa có file. "
        "Trích dẫn nguồn/file khi có thể."
    )
    user_content = (
        f"Câu hỏi của người dùng:\n{query}\n\n"
        f"Nội dung tài liệu từ kho tri thức:\n{context_block}"
    )

    lc_messages: list[Any] = [SystemMessage(content=prompt)]
    lc_messages.extend(_history_to_lc_messages(history))
    lc_messages.append(HumanMessage(content=user_content))

    async for chunk in _build_chat_model(model_id, temperature=temperature).astream(
        lc_messages,
    ):
        text = _extract_plain_text(chunk)
        if text:
            yield _format_sse({"type": "token", "content": text})


async def _stream_agent_answer(
    *,
    query: str,
    history: list[dict[str, str]],
    model_id: str,
    temperature: float = 0.2,
) -> AsyncIterator[str]:
    messages = [*history, {"role": "user", "content": query}]
    suppress_text = False
    agent = _build_react_agent(model_id, temperature=temperature)

    async for event in agent.astream_events(
        {"messages": messages},
        version="v2",
    ):
        event_type = event["event"]
        event_name = event.get("name")

        if event_type == "on_chat_model_start":
            suppress_text = False
            continue

        if event_type == "on_tool_start":
            suppress_text = True
            if event_name == TAVILY_TOOL_NAME:
                yield _format_sse(
                    {"type": "status", "content": "Searching web..."},
                )
            elif event_name == KNOWLEDGE_TOOL_NAME:
                yield _format_sse(
                    {
                        "type": "status",
                        "content": "Reading uploaded documents...",
                    },
                )
            continue

        if event_type == "on_tool_end":
            suppress_text = True
            continue

        if event_type == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if _chunk_has_tool_calls(chunk):
                suppress_text = True
                continue
            if suppress_text:
                continue
            text = _extract_plain_text(chunk)
            if text:
                yield _format_sse({"type": "token", "content": text})
            continue

        if event_type == "on_chat_model_end":
            output = event["data"].get("output")
            tool_calls = getattr(output, "tool_calls", None) or []
            suppress_text = bool(tool_calls)


async def _stream_direct_chat(
    *,
    query: str,
    history: list[dict[str, str]],
    model_id: str,
    system_prompt: str | None = None,
    temperature: float = 0.2,
) -> AsyncIterator[str]:
    """Stream plain chat (reasoning / fallback) without tool calling."""
    lc_messages: list[Any] = []
    if system_prompt:
        lc_messages.append(SystemMessage(content=system_prompt))
    lc_messages.extend(_history_to_lc_messages(history))
    lc_messages.append(HumanMessage(content=query))

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

            async for chunk in _stream_direct_chat(
                query=query,
                history=history,
                model_id=route.model_id,
                system_prompt=command_system_prompts.get(
                    "vision",
                    DOCUMENT_PROCESSOR_SYSTEM_PROMPT,
                ),
                temperature=temperature,
            ):
                yield chunk
            return

        if route.task == GroqTask.REASONING:
            async for chunk in _stream_direct_chat(
                query=query,
                history=history,
                model_id=route.model_id,
                system_prompt=command_system_prompts.get(
                    "reasoning",
                    (
                        f"{DOCUMENT_PROCESSOR_SYSTEM_PROMPT}\n\n"
                        "Use careful chain-of-thought. Show step-by-step reasoning "
                        "for math, logic, and hard debugging problems."
                    ),
                ),
                temperature=temperature,
            ):
                yield chunk
            return

        # Fast / code / balanced: direct chat (skip ReAct tools for speed & focus).
        if mode in {"fast", "code", "balanced"} and command is None:
            async for chunk in _stream_direct_chat(
                query=query,
                history=history,
                model_id=route.model_id,
                system_prompt=command_system_prompts.get(
                    mode,
                    DOCUMENT_PROCESSOR_SYSTEM_PROMPT,
                ),
                temperature=0.1 if mode == "fast" else temperature,
            ):
                yield chunk
            return

        # Default text path: RAG-first, then ReAct agent with tools.
        # Prefer RAG for document/spreadsheet commands.
        contexts = query_vector_store(query)
        if contexts or command in {"pdf", "excel"}:
            if not contexts and command in {"pdf", "excel"}:
                async for chunk in _stream_direct_chat(
                    query=query,
                    history=history,
                    model_id=route.model_id,
                    system_prompt=command_system_prompts.get(
                        command,
                        DOCUMENT_PROCESSOR_SYSTEM_PROMPT,
                    ),
                    temperature=temperature,
                ):
                    yield chunk
                return

            if contexts:
                async for chunk in _stream_rag_answer(
                    query=query,
                    history=history,
                    contexts=contexts,
                    model_id=route.model_id,
                    temperature=temperature,
                ):
                    yield chunk
                return

        if command in {"code", "pdf", "excel"}:
            async for chunk in _stream_direct_chat(
                query=query,
                history=history,
                model_id=route.model_id,
                system_prompt=command_system_prompts.get(
                    command,
                    DOCUMENT_PROCESSOR_SYSTEM_PROMPT,
                ),
                temperature=temperature,
            ):
                yield chunk
            return

        async for chunk in _stream_agent_answer(
            query=query,
            history=history,
            model_id=route.model_id,
            temperature=temperature,
        ):
            yield chunk
    except Exception:
        logger.exception("Agent streaming failed")
        yield _format_sse(
            {"type": "error", "content": "Unable to generate a response."},
        )
