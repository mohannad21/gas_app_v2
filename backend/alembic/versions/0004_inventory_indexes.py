"""add inventory indexes for snapshots

Revision ID: 0004_inventory_indexes
Revises: 0003_add_activity_metadata
Create Date: 2025-12-19
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0004_inventory_indexes"
down_revision = "0003_add_activity_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.create_index(
    "ix_inventory_versions_gas_effective_created",
    "inventory_versions",
    ["gas_type", "effective_at", "created_at"],
    unique=False,
  )


def downgrade() -> None:
  op.drop_index("ix_inventory_versions_gas_effective_created", table_name="inventory_versions")
