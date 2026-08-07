import json
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from datetime import timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import SessionLocal, get_db
from app.models.chat import ChatMessage, ChatSession
from app.services.agent_service import stream_agent_response
from app.services.chat_history_service import (
    delete_session_for_user,
    get_session_messages,
    list_sessions_for_user,
    save_chat_turn,
)
from app.services.model_router import AttachmentInput

router = APIRouter()
logger = logging.getLogger(__name__)


class StreamChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatAttachment(BaseModel):
    """Optional multimodal attachment used by the Groq model router."""

    filename: str | None = None
    mime_type: str | None = None
    content_base64: str | None = None
    url: str | None = None
    kind: Literal["image", "audio", "text", "unknown"] | None = None


class ChatRequest(BaseModel):
    message: str = Field(default="", min_length=0)
    session_id: uuid.UUID | None = None
    history: list[StreamChatMessage] = Field(default_factory=list)
    attachments: list[ChatAttachment] = Field(default_factory=list)
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    active_command: (
        Literal["pdf", "excel", "vision", "code", "reasoning"] | None
    ) = None
    prompt_mode: Literal["auto", "fast", "balanced", "reasoning", "code"] = (
        "auto"
    )


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


def _format_sse(payload: dict[str, str]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _stream_and_persist(
    *,
    query: str,
    history: list[dict[str, str]],
    session_id: uuid.UUID | None,
    attachments: list[AttachmentInput] | None = None,
    temperature: float = 0.2,
    active_command: str | None = None,
    prompt_mode: str = "auto",
) -> AsyncIterator[str]:
    assistant_parts: list[str] = []
    stream_failed = False

    async for chunk in stream_agent_response(
        query,
        history,
        attachments,
        temperature=temperature,
        active_command=active_command,
        prompt_mode=prompt_mode,
    ):
        try:
            payload = json.loads(chunk.removeprefix("data: ").strip())
            if payload.get("type") == "token":
                assistant_parts.append(payload.get("content", ""))
            elif payload.get("type") == "error":
                stream_failed = True
        except (json.JSONDecodeError, AttributeError):
            logger.warning("Received an invalid SSE payload from the agent")

        yield chunk

    assistant_content = "".join(assistant_parts).strip()
    if session_id is None or stream_failed or not assistant_content:
        return

    try:
        async with SessionLocal() as db:
            chat_session = await db.get(ChatSession, session_id)
            if chat_session is None:
                raise LookupError(f"Chat session {session_id} no longer exists")

            db.add_all(
                [
                    ChatMessage(
                        session_id=session_id,
                        role="user",
                        content=query,
                    ),
                    ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=assistant_content,
                    ),
                ],
            )
            chat_session.updated_at = datetime.now(timezone.utc)
            await db.commit()
    except Exception:
        logger.exception("Failed to persist streamed chat messages")
        yield _format_sse(
            {
                "type": "error",
                "content": "Response generated but could not be saved.",
            },
        )


@router.post("/api/chat/stream", response_class=StreamingResponse)
async def stream_chat(request: ChatRequest) -> StreamingResponse:
    if not request.message.strip() and not request.attachments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="message or attachments is required",
        )

    history = [message.model_dump() for message in request.history]
    attachments = [
        AttachmentInput(
            filename=item.filename,
            mime_type=item.mime_type,
            content_base64=item.content_base64,
            url=item.url,
            kind=item.kind,
        )
        for item in request.attachments
    ]

    if request.session_id is not None:
        async with SessionLocal() as db:
            result = await db.execute(
                select(ChatSession)
                .options(selectinload(ChatSession.messages))
                .where(ChatSession.id == request.session_id),
            )
            chat_session = result.scalar_one_or_none()
        if chat_session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat session not found",
            )

        history = [
            {"role": message.role, "content": message.content}
            for message in chat_session.messages
        ]

    return StreamingResponse(
        _stream_and_persist(
            query=request.message,
            history=history,
            session_id=request.session_id,
            attachments=attachments,
            temperature=request.temperature,
            active_command=request.active_command,
            prompt_mode=request.prompt_mode,
        ),
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


@router.delete(
    "/api/chat/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_chat_session(
    session_id: uuid.UUID,
    user_email: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    deleted = await delete_session_for_user(
        db,
        user_email=user_email,
        session_id=session_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found",
        )
