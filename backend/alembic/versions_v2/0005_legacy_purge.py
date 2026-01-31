"""purge legacy columns and tables

Revision ID: 0005_legacy_purge
Revises: 0004_ledger_unique_coalesce
Create Date: 2026-01-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0005_legacy_purge"
down_revision = "0004_ledger_unique_coalesce"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    legacy_columns = {"money_received", "before_balance", "after_balance"}
    for table in ("orders", "collection_events"):
        if table not in tables:
            continue
        cols = {col["name"] for col in inspector.get_columns(table)}
        drop_cols = sorted(legacy_columns.intersection(cols))
        if drop_cols:
            with op.batch_alter_table(table) as batch:
                for col in drop_cols:
                    batch.drop_column(col)

    # Legacy delta tables (safe if they no longer exist)
    op.execute("DROP TABLE IF EXISTS cash_deltas")
    op.execute("DROP TABLE IF EXISTS inventory_deltas")


def downgrade() -> None:
    # Irreversible cleanup; no downgrade.
    pass
