from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.services.chat_history_service import (
    get_user_preferences,
    set_user_chat_retention,
)

router = APIRouter()


class UserPreferencesResponse(BaseModel):
    auto_delete_chats_after_days: int | None


class UpdateUserPreferencesRequest(BaseModel):
    user_email: str = Field(min_length=1)
    auto_delete_chats_after_days: int | None = None

    @field_validator("auto_delete_chats_after_days")
    @classmethod
    def validate_retention(cls, value: int | None) -> int | None:
        if value is None:
            return None
        allowed = get_settings().chat_retention_days
        if value != allowed:
            raise ValueError(f"Only null or {allowed} is allowed")
        return value


@router.get(
    "/api/user/preferences",
    response_model=UserPreferencesResponse,
)
async def get_preferences(
    user_email: str,
    db: AsyncSession = Depends(get_db),
) -> UserPreferencesResponse:
    user = await get_user_preferences(db, user_email=user_email)
    await db.commit()
    return UserPreferencesResponse(
        auto_delete_chats_after_days=user.auto_delete_chats_after_days,
    )


@router.patch(
    "/api/user/preferences",
    response_model=UserPreferencesResponse,
)
async def update_preferences(
    request: UpdateUserPreferencesRequest,
    db: AsyncSession = Depends(get_db),
) -> UserPreferencesResponse:
    try:
        user = await set_user_chat_retention(
            db,
            user_email=request.user_email,
            auto_delete_chats_after_days=request.auto_delete_chats_after_days,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error

    return UserPreferencesResponse(
        auto_delete_chats_after_days=user.auto_delete_chats_after_days,
    )
