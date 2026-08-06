import json
import logging
from collections.abc import AsyncIterator, Sequence
from functools import lru_cache
from typing import Any

from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_community.utilities.tavily_search import TavilySearchAPIWrapper
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent

from app.agent.system_prompt import DOCUMENT_PROCESSOR_SYSTEM_PROMPT
from app.core.config import get_settings
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


@lru_cache
def _get_chat_model() -> ChatGroq:
    settings = get_settings()
    return ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.model_name,
        streaming=True,
        temperature=0.2,
    )


@lru_cache
def _get_agent() -> Any:
    settings = get_settings()
    model = ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.model_name,
        streaming=True,
        temperature=0.2,
    )
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


async def _stream_rag_answer(
    *,
    query: str,
    history: list[dict[str, str]],
    contexts: list[str],
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
    for message in history[-8:]:
        role = message["role"]
        content = message["content"]
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
        elif role == "system":
            lc_messages.append(SystemMessage(content=content))
    lc_messages.append(HumanMessage(content=user_content))

    async for chunk in _get_chat_model().astream(lc_messages):
        text = _extract_plain_text(chunk)
        if text:
            yield _format_sse({"type": "token", "content": text})


async def _stream_agent_answer(
    *,
    query: str,
    history: list[dict[str, str]],
) -> AsyncIterator[str]:
    messages = [*history, {"role": "user", "content": query}]
    suppress_text = False

    async for event in _get_agent().astream_events(
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


async def stream_agent_response(
    query: str,
    chat_history: Sequence[dict[str, Any]],
) -> AsyncIterator[str]:
    history = _normalize_history(chat_history)
    contexts = query_vector_store(query)

    try:
        # Prefer direct RAG when knowledge base has relevant chunks.
        # Avoids Groq tool-call token leakage in the SSE stream.
        if contexts:
            async for chunk in _stream_rag_answer(
                query=query,
                history=history,
                contexts=contexts,
            ):
                yield chunk
            return

        async for chunk in _stream_agent_answer(query=query, history=history):
            yield chunk
    except Exception:
        logger.exception("Agent streaming failed")
        yield _format_sse(
            {"type": "error", "content": "Unable to generate a response."},
        )
