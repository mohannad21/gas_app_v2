"""make customer phone nullable

Revision ID: 0007_make_customer_phone_nullable
Revises: 0006_add_expense_created_by
Create Date: 2025-12-21
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0007_make_customer_phone_nullable"
down_revision = "0006_add_expense_created_by"
branch_labels = None
depends_on = None


def upgrade() -> None:
  with op.batch_alter_table("customers") as batch_op:
    batch_op.alter_column("phone", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
  with op.batch_alter_table("customers") as batch_op:
    batch_op.alter_column("phone", existing_type=sa.String(), nullable=False)
