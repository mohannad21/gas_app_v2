"""add order mode

Revision ID: 0019_add_order_mode
Revises: 0018_add_gross_relationship_fields
Create Date: 2026-01-15
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision = "0019_add_order_mode"
down_revision = "0018_add_gross_relationship_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("order_mode", sa.String(), nullable=False, server_default="replacement"),
    )


def downgrade() -> None:
    op.drop_column("orders", "order_mode")
