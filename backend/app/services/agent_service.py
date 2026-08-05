import json
import logging
from collections.abc import AsyncIterator, Sequence
from functools import lru_cache
from typing import Any

from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_community.utilities.tavily_search import TavilySearchAPIWrapper
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent

from app.core.config import get_settings
from app.services.vector_service import query_vector_store

logger = logging.getLogger(__name__)
TAVILY_TOOL_NAME = "tavily_search_results_json"


def _format_sse(payload: dict[str, str]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@tool
def retrieve_knowledge_base(query: str) -> str:
    """Retrieve relevant context from the user's local knowledge base."""
    contexts = query_vector_store(query)
    if not contexts:
        return "No relevant context was found in the knowledge base."

    return "\n\n".join(
        f"[Context {index}] {context}"
        for index, context in enumerate(contexts, start=1)
    )


@lru_cache
def _get_agent() -> Any:
    settings = get_settings()
    model = ChatGroq(
        api_key=settings.groq_api_key,
        model=settings.model_name,
        streaming=True,
    )
    search_tool = TavilySearchResults(
        api_wrapper=TavilySearchAPIWrapper(
            tavily_api_key=settings.tavily_api_key,
        ),
    )
    return create_react_agent(
        model=model,
        tools=[search_tool, retrieve_knowledge_base],
    )


async def stream_agent_response(
    query: str,
    chat_history: Sequence[dict[str, Any]],
) -> AsyncIterator[str]:
    messages = [*chat_history, {"role": "user", "content": query}]

    try:
        async for event in _get_agent().astream_events(
            {"messages": messages},
            version="v2",
        ):
            event_type = event["event"]

            if (
                event_type == "on_tool_start"
                and event.get("name") == TAVILY_TOOL_NAME
            ):
                yield _format_sse(
                    {"type": "status", "content": "Searching web..."},
                )
                continue

            if event_type == "on_chat_model_stream":
                content = event["data"]["chunk"].content
                if isinstance(content, str) and content:
                    yield _format_sse({"type": "token", "content": content})
    except Exception:
        logger.exception("Agent streaming failed")
        yield _format_sse(
            {"type": "error", "content": "Unable to generate a response."},
        )
