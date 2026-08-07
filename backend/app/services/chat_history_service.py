import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat import ChatMessage, ChatSession, User


async def get_or_create_user(
    db: AsyncSession,
    *,
    email: str,
    name: str | None = None,
    avatar_url: str | None = None,
) -> User:
    result = await db.execute(
        select(User).where(User.email == email),
    )
    user = result.scalar_one_or_none()
    if user is not None:
        if name and user.name != name:
            user.name = name
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
        return user

    user = User(email=email, name=name, avatar_url=avatar_url)
    db.add(user)
    await db.flush()
    return user


async def save_chat_turn(
    db: AsyncSession,
    *,
    user_email: str,
    name: str | None,
    avatar_url: str | None,
    session_id: uuid.UUID | None,
    title: str | None,
    messages: list[dict[str, str]],
) -> ChatSession:
    user = await get_or_create_user(
        db,
        email=user_email,
        name=name,
        avatar_url=avatar_url,
    )

    session: ChatSession | None = None
    if session_id is not None:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user.id,
            ),
        )
        session = result.scalar_one_or_none()

    if session is None:
        session_title = (title or "New chat").strip()[:255] or "New chat"
        session = ChatSession(user_id=user.id, title=session_title)
        db.add(session)
        await db.flush()
    elif title and session.title in {"New chat", "Cuộc trò chuyện mới"}:
        session.title = title.strip()[:255]

    session.updated_at = datetime.now(timezone.utc)

    for message in messages:
        db.add(
            ChatMessage(
                session_id=session.id,
                role=message["role"],
                content=message["content"],
            ),
        )

    await db.commit()
    await db.refresh(session)
    return session


async def list_sessions_for_user(
    db: AsyncSession,
    *,
    user_email: str,
) -> list[ChatSession]:
    result = await db.execute(
        select(ChatSession)
        .join(User)
        .where(User.email == user_email)
        .order_by(ChatSession.updated_at.desc()),
    )
    return list(result.scalars().all())


async def get_session_messages(
    db: AsyncSession,
    *,
    user_email: str,
    session_id: uuid.UUID,
) -> ChatSession | None:
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .join(User)
        .where(
            ChatSession.id == session_id,
            User.email == user_email,
        ),
    )
    return result.scalar_one_or_none()


async def delete_session_for_user(
    db: AsyncSession,
    *,
    user_email: str,
    session_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        select(ChatSession)
        .join(User)
        .where(
            ChatSession.id == session_id,
            User.email == user_email,
        ),
    )
    session = result.scalar_one_or_none()
    if session is None:
        return False

    await db.delete(session)
    await db.commit()
    return True
