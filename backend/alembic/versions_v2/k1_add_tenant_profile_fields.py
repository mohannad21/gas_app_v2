"""Add business profile fields to tenants table."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "k1_add_tenant_profile_fields"
down_revision = "j1_add_workers_roles_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column("tenants", sa.Column("business_name", sa.String(), nullable=True))
  op.add_column("tenants", sa.Column("owner_name", sa.String(), nullable=True))
  op.add_column("tenants", sa.Column("phone", sa.String(), nullable=True))
  op.add_column("tenants", sa.Column("address", sa.String(), nullable=True))


def downgrade() -> None:
  op.drop_column("tenants", "address")
  op.drop_column("tenants", "phone")
  op.drop_column("tenants", "owner_name")
  op.drop_column("tenants", "business_name")
