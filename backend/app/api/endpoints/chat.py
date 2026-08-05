from typing import Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.agent_service import stream_agent_response

router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatMessage] = Field(default_factory=list)


@router.post("/api/chat/stream", response_class=StreamingResponse)
async def stream_chat(request: ChatRequest) -> StreamingResponse:
    history = [message.model_dump() for message in request.history]
    return StreamingResponse(
        stream_agent_response(request.message, history),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
