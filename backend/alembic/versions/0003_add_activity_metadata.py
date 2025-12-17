"""add activity metadata

Revision ID: 0003_add_activity_metadata
Revises: 0002_add_system_flags
Create Date: 2025-12-14
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0003_add_activity_metadata"
down_revision = "0002_add_system_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column("activities", sa.Column("metadata", sa.Text(), nullable=True))


def downgrade() -> None:
  op.drop_column("activities", "metadata")
