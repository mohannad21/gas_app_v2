"""add created_by to expenses

Revision ID: 0006_add_expense_created_by
Revises: 0005_remove_legacy_security_fields
Create Date: 2025-12-21
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0006_add_expense_created_by"
down_revision = "0005_remove_legacy_security_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
  with op.batch_alter_table("expenses") as batch_op:
    batch_op.add_column(sa.Column("created_by", sa.String(), nullable=True))


def downgrade() -> None:
  with op.batch_alter_table("expenses") as batch_op:
    batch_op.drop_column("created_by")
