"""add order price snapshot fields

Revision ID: 0002_order_price_snapshot
Revises: 0001_init
Create Date: 2025-12-15
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0002_order_price_snapshot"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column("orders", sa.Column("price_setting_id", sa.String(), nullable=True))
  op.add_column("orders", sa.Column("unit_price_sell", sa.Float(), nullable=True))
  op.add_column("orders", sa.Column("unit_price_buy", sa.Float(), nullable=True))
  op.create_index("ix_orders_price_setting_id", "orders", ["price_setting_id"], unique=False)


def downgrade() -> None:
  op.drop_index("ix_orders_price_setting_id", table_name="orders")
  op.drop_column("orders", "unit_price_buy")
  op.drop_column("orders", "unit_price_sell")
  op.drop_column("orders", "price_setting_id")
