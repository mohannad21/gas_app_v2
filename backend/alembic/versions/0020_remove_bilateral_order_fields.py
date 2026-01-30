"""remove bilateral order fields

Revision ID: 0020_remove_bilateral_order_fields
Revises: bdba764a24e1, 0019_add_order_mode
Create Date: 2026-01-28
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision = "0020_remove_bilateral_order_fields"
down_revision = ("bdba764a24e1", "0019_add_order_mode")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("orders", "money_given")
    op.drop_column("orders", "money_received")


def downgrade() -> None:
    op.add_column("orders", sa.Column("money_received", sa.Float(), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("money_given", sa.Float(), nullable=False, server_default="0"))
