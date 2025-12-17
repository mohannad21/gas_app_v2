"""add system flags

Revision ID: 0002_add_system_flags
Revises: 0001_init
Create Date: 2025-12-07

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0002_add_system_flags"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "systems",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "systems",
        sa.Column(
            "require_security_check",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "systems",
        sa.Column(
            "security_check_exists",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "systems",
        sa.Column("security_check_date", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("systems", "security_check_date")
    op.drop_column("systems", "security_check_exists")
    op.drop_column("systems", "require_security_check")
    op.drop_column("systems", "is_active")
