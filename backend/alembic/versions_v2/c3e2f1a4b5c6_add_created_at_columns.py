"""add created_at to activity tables"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c3e2f1a4b5c6"
down_revision = "b7a4d1c3e9f0"
branch_labels = None
depends_on = None


def _add_created_at(table: str) -> None:
    op.add_column(table, sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(sa.text(f"UPDATE {table} SET created_at = happened_at WHERE created_at IS NULL"))
    op.alter_column(
        table,
        "created_at",
        nullable=False,
        server_default=sa.text("now()"),
    )


def upgrade() -> None:
    _add_created_at("customer_transactions")
    _add_created_at("company_transactions")
    _add_created_at("inventory_adjustments")
    _add_created_at("cash_adjustments")
    _add_created_at("expenses")


def downgrade() -> None:
    op.drop_column("expenses", "created_at")
    op.drop_column("cash_adjustments", "created_at")
    op.drop_column("inventory_adjustments", "created_at")
    op.drop_column("company_transactions", "created_at")
    op.drop_column("customer_transactions", "created_at")

