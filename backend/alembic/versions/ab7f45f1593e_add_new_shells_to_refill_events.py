"""add new_shells to refill events

Revision ID: ab7f45f1593e
Revises: b8c9babe27bc
Create Date: 2026-01-22 15:58:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ab7f45f1593e'
down_revision = 'b8c9babe27bc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("refill_events", sa.Column("new_shells_12kg", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("refill_events", sa.Column("new_shells_48kg", sa.Integer(), nullable=True, server_default="0"))


def downgrade() -> None:
    op.drop_column("refill_events", "new_shells_12kg")
    op.drop_column("refill_events", "new_shells_48kg")
