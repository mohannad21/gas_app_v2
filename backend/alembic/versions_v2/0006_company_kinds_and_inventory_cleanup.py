"""add company transaction kind + drop legacy inventory tables

Revision ID: 0006_company_kinds_cleanup
Revises: 0005_legacy_purge
Create Date: 2026-01-30
"""

import sqlalchemy as sa
from alembic import op

revision = "0006_company_kinds_cleanup"
down_revision = "0005_legacy_purge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "company_transactions" in tables:
        cols = {col["name"] for col in inspector.get_columns("company_transactions")}
        if "kind" not in cols:
            with op.batch_alter_table("company_transactions") as batch:
                batch.add_column(
                    sa.Column("kind", sa.String(), nullable=False, server_default="refill")
                )
            with op.batch_alter_table("company_transactions") as batch:
                batch.alter_column("kind", server_default=None)

        existing_indexes = {idx["name"] for idx in inspector.get_indexes("company_transactions")}
        if "ix_company_transactions_kind" not in existing_indexes:
            op.create_index("ix_company_transactions_kind", "company_transactions", ["kind"])

    op.execute("DROP TABLE IF EXISTS inventory_daily_summary")
    op.execute("DROP TABLE IF EXISTS inventory_recalc_queue")
    op.execute("DROP TABLE IF EXISTS inventory_versions")


def downgrade() -> None:
    # Irreversible cleanup; no downgrade.
    pass
