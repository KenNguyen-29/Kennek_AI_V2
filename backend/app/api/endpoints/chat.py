import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.agent_service import stream_agent_response
from app.services.chat_history_service import (
    get_session_messages,
    list_sessions_for_user,
    save_chat_turn,
)

router = APIRouter()


class StreamChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[StreamChatMessage] = Field(default_factory=list)


class PersistMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=1)


class PersistChatRequest(BaseModel):
    user_email: str = Field(min_length=1, description="Authenticated user email")
    name: str | None = None
    avatar_url: str | None = None
    session_id: uuid.UUID | None = None
    title: str | None = None
    messages: list[PersistMessage] = Field(min_length=1)


class ChatSessionResponse(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class PersistChatResponse(BaseModel):
    session_id: uuid.UUID
    title: str


class ChatSessionDetailResponse(BaseModel):
    id: uuid.UUID
    title: str
    messages: list[ChatMessageResponse]


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


@router.post("/api/chat/messages", response_model=PersistChatResponse)
async def persist_chat_messages(
    request: PersistChatRequest,
    db: AsyncSession = Depends(get_db),
) -> PersistChatResponse:
    session = await save_chat_turn(
        db,
        user_email=request.user_email,
        name=request.name,
        avatar_url=request.avatar_url,
        session_id=request.session_id,
        title=request.title,
        messages=[message.model_dump() for message in request.messages],
    )
    return PersistChatResponse(session_id=session.id, title=session.title)


@router.get(
    "/api/chat/history/{user_email}",
    response_model=list[ChatSessionResponse],
)
async def get_chat_history(
    user_email: str,
    db: AsyncSession = Depends(get_db),
) -> list[ChatSessionResponse]:
    sessions = await list_sessions_for_user(db, user_email=user_email)
    return [
        ChatSessionResponse(
            id=session.id,
            title=session.title,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )
        for session in sessions
    ]


@router.get(
    "/api/chat/sessions/{session_id}",
    response_model=ChatSessionDetailResponse,
)
async def get_chat_session(
    session_id: uuid.UUID,
    user_email: str,
    db: AsyncSession = Depends(get_db),
) -> ChatSessionDetailResponse:
    session = await get_session_messages(
        db,
        user_email=user_email,
        session_id=session_id,
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found",
        )

    return ChatSessionDetailResponse(
        id=session.id,
        title=session.title,
        messages=[
            ChatMessageResponse(
                id=message.id,
                role=message.role,
                content=message.content,
                created_at=message.created_at,
            )
            for message in session.messages
        ],
    )
