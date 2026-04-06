"""Add company_iron_price to price_catalog."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "l1_add_company_iron_price"
down_revision = "k1_add_tenant_profile_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column(
    "price_catalog",
    sa.Column("company_iron_price", sa.Integer(), nullable=False, server_default="0"),
  )
  op.alter_column("price_catalog", "company_iron_price", server_default=None)


def downgrade() -> None:
  op.drop_column("price_catalog", "company_iron_price")
