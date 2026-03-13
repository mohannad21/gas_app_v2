"""add created_at to ledger_entries"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e1c2d3f4a5b6"
down_revision = "d9f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ledger_entries", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(sa.text("UPDATE ledger_entries SET created_at = happened_at WHERE created_at IS NULL"))
    op.alter_column(
        "ledger_entries",
        "created_at",
        nullable=False,
        server_default=sa.text("now()"),
    )
    op.create_index(
        "ix_ledger_entries_happened_created_id",
        "ledger_entries",
        ["happened_at", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_ledger_entries_happened_created_id", table_name="ledger_entries")
    op.drop_column("ledger_entries", "created_at")

