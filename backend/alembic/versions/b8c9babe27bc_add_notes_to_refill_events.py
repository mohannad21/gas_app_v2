"""add notes to refill events

Revision ID: b8c9babe27bc
Revises: 644fd69abc6c
Create Date: 2026-01-22 15:30:03.967323

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8c9babe27bc'
down_revision = '644fd69abc6c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("refill_events", sa.Column("notes", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("refill_events", "notes")
