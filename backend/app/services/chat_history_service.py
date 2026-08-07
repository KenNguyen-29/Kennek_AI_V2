import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
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


async def get_user_preferences(
    db: AsyncSession,
    *,
    user_email: str,
) -> User:
    return await get_or_create_user(db, email=user_email)


async def set_user_chat_retention(
    db: AsyncSession,
    *,
    user_email: str,
    auto_delete_chats_after_days: int | None,
) -> User:
    settings = get_settings()
    if auto_delete_chats_after_days is not None and (
        auto_delete_chats_after_days != settings.chat_retention_days
    ):
        raise ValueError(
            f"auto_delete_chats_after_days must be null or {settings.chat_retention_days}",
        )

    user = await get_or_create_user(db, email=user_email)
    user.auto_delete_chats_after_days = auto_delete_chats_after_days
    await db.commit()
    await db.refresh(user)
    return user


async def purge_expired_sessions_for_user(
    db: AsyncSession,
    *,
    user_email: str,
    commit: bool = True,
) -> int:
    result = await db.execute(select(User).where(User.email == user_email))
    user = result.scalar_one_or_none()
    if user is None or user.auto_delete_chats_after_days is None:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(
        days=user.auto_delete_chats_after_days,
    )
    delete_result = await db.execute(
        delete(ChatSession).where(
            ChatSession.user_id == user.id,
            ChatSession.updated_at < cutoff,
        ),
    )
    if commit:
        await db.commit()
    return int(delete_result.rowcount or 0)


async def purge_all_expired_sessions(db: AsyncSession) -> int:
    result = await db.execute(
        select(User).where(User.auto_delete_chats_after_days.is_not(None)),
    )
    users = list(result.scalars().all())
    total = 0
    now = datetime.now(timezone.utc)

    for user in users:
        days = user.auto_delete_chats_after_days
        if days is None or days <= 0:
            continue
        cutoff = now - timedelta(days=days)
        delete_result = await db.execute(
            delete(ChatSession).where(
                ChatSession.user_id == user.id,
                ChatSession.updated_at < cutoff,
            ),
        )
        total += int(delete_result.rowcount or 0)

    await db.commit()
    return total


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
    await purge_expired_sessions_for_user(db, user_email=user_email)

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
