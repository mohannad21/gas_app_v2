"""add coalesce-based unique index for ledger entries

Revision ID: 0004_ledger_unique_coalesce
Revises: 0003_cash_adjustments
Create Date: 2026-01-30
"""
from alembic import op

revision = "0004_ledger_unique_coalesce"
down_revision = "0003_cash_adjustments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure uniqueness even when gas_type/state/customer_id are NULL by normalizing to "N/A".
    op.execute("DROP INDEX IF EXISTS ux_ledger_source_account_coalesce")
    op.execute("DROP INDEX IF EXISTS ix_ledger_unique_lines")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_ledger_unique_lines ON ledger_entries (
          source_type,
          source_id,
          account,
          unit,
          COALESCE(gas_type, 'N/A'),
          COALESCE(state, 'N/A'),
          COALESCE(customer_id, 'N/A')
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_ledger_unique_lines")
