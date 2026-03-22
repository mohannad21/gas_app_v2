"""add group_id to inventory_adjustments"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "f2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventory_adjustments", sa.Column("group_id", sa.String(), nullable=True))
    op.create_index(
        op.f("ix_inventory_adjustments_group_id"),
        "inventory_adjustments",
        ["group_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_inventory_adjustments_group_id"), table_name="inventory_adjustments")
    op.drop_column("inventory_adjustments", "group_id")
