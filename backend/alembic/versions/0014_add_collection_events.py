"""add collection events

Revision ID: 0014_add_collection_events
Revises: 644fd69abc6c
Create Date: 2026-01-04
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0014_add_collection_events"
down_revision = "644fd69abc6c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "collection_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("customer_id", sa.String(), nullable=False),
        sa.Column("system_id", sa.String(), nullable=True),
        sa.Column("action_type", sa.String(), nullable=False),
        sa.Column("amount_money", sa.Float(), nullable=False, server_default="0"),
        sa.Column("qty_12kg", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("qty_48kg", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("money_balance_before", sa.Float(), nullable=False, server_default="0"),
        sa.Column("money_balance_after", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cyl_balance_before", sa.JSON(), nullable=True),
        sa.Column("cyl_balance_after", sa.JSON(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("effective_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deletion_reason", sa.Text(), nullable=True),
    )
    op.create_index("ix_collection_events_customer_id", "collection_events", ["customer_id"])
    op.create_index("ix_collection_events_system_id", "collection_events", ["system_id"])
    op.create_index("ix_collection_events_action_type", "collection_events", ["action_type"])
    op.create_index("ix_collection_events_effective_at", "collection_events", ["effective_at"])
    op.create_index("ix_collection_events_created_at", "collection_events", ["created_at"])
    op.create_index("ix_collection_events_is_deleted", "collection_events", ["is_deleted"])


def downgrade() -> None:
    op.drop_index("ix_collection_events_is_deleted", table_name="collection_events")
    op.drop_index("ix_collection_events_created_at", table_name="collection_events")
    op.drop_index("ix_collection_events_effective_at", table_name="collection_events")
    op.drop_index("ix_collection_events_action_type", table_name="collection_events")
    op.drop_index("ix_collection_events_system_id", table_name="collection_events")
    op.drop_index("ix_collection_events_customer_id", table_name="collection_events")
    op.drop_table("collection_events")
