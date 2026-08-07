"""Add user auto_delete_chats_after_days preference.

Revision ID: 20260807_0002
Revises: 20260805_0001
Create Date: 2026-08-07
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260807_0002"
down_revision: str | Sequence[str] | None = "20260805_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("auto_delete_chats_after_days", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "auto_delete_chats_after_days")
