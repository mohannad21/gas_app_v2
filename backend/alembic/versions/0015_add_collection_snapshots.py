"""add collection snapshot fields

Revision ID: 0015_add_collection_snapshots
Revises: 0014_add_collection_events
Create Date: 2026-01-04
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0015_add_collection_snapshots"
down_revision = "0014_add_collection_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("collection_events", sa.Column("cash_before", sa.Float(), nullable=True))
    op.add_column("collection_events", sa.Column("cash_after", sa.Float(), nullable=True))
    op.add_column("collection_events", sa.Column("inv12_full_before", sa.Integer(), nullable=True))
    op.add_column("collection_events", sa.Column("inv12_full_after", sa.Integer(), nullable=True))
    op.add_column("collection_events", sa.Column("inv12_empty_before", sa.Integer(), nullable=True))
    op.add_column("collection_events", sa.Column("inv12_empty_after", sa.Integer(), nullable=True))
    op.add_column("collection_events", sa.Column("inv48_full_before", sa.Integer(), nullable=True))
    op.add_column("collection_events", sa.Column("inv48_full_after", sa.Integer(), nullable=True))
    op.add_column("collection_events", sa.Column("inv48_empty_before", sa.Integer(), nullable=True))
    op.add_column("collection_events", sa.Column("inv48_empty_after", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("collection_events", "inv48_empty_after")
    op.drop_column("collection_events", "inv48_empty_before")
    op.drop_column("collection_events", "inv48_full_after")
    op.drop_column("collection_events", "inv48_full_before")
    op.drop_column("collection_events", "inv12_empty_after")
    op.drop_column("collection_events", "inv12_empty_before")
    op.drop_column("collection_events", "inv12_full_after")
    op.drop_column("collection_events", "inv12_full_before")
    op.drop_column("collection_events", "cash_after")
    op.drop_column("collection_events", "cash_before")
