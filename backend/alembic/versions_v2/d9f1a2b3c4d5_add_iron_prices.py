"""add iron prices to price_catalog"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d9f1a2b3c4d5"
down_revision = "c3e2f1a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "price_catalog",
        sa.Column("sell_iron_price", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "price_catalog",
        sa.Column("buy_iron_price", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("price_catalog", "sell_iron_price", server_default=None)
    op.alter_column("price_catalog", "buy_iron_price", server_default=None)


def downgrade() -> None:
    op.drop_column("price_catalog", "buy_iron_price")
    op.drop_column("price_catalog", "sell_iron_price")

