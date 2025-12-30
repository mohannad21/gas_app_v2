"""remove legacy system security fields

Revision ID: 0005_remove_legacy_security_fields
Revises: 0004_inventory_indexes
Create Date: 2025-12-20
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0005_remove_legacy_security_fields"
down_revision = "0004_inventory_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
  with op.batch_alter_table("systems") as batch_op:
    batch_op.drop_column("security_required")
    batch_op.drop_column("last_security_check_at")
    batch_op.drop_column("next_security_due_at")
    batch_op.drop_column("security_status")


def downgrade() -> None:
  with op.batch_alter_table("systems") as batch_op:
    batch_op.add_column(
      sa.Column("security_required", sa.Boolean(), nullable=False, server_default=sa.text("false"))
    )
    batch_op.add_column(sa.Column("last_security_check_at", sa.DateTime(timezone=True), nullable=True))
    batch_op.add_column(sa.Column("next_security_due_at", sa.DateTime(timezone=True), nullable=True))
    batch_op.add_column(sa.Column("security_status", sa.String(), nullable=True))
