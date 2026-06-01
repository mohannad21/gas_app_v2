"""backfill dist_return_empties for misclassified refill rows

Revision ID: o1_backfill_dist_return_empties
Revises: n2_repair_ledger_source_types
Create Date: 2026-06-01
"""
from alembic import op

revision = "o1_backfill_dist_return_empties"
down_revision = "n2_repair_ledger_source_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE company_transactions
        SET kind = 'dist_return_empties'
        WHERE kind = 'refill'
          AND COALESCE(buy12, 0) = 0
          AND COALESCE(buy48, 0) = 0
          AND (COALESCE(return12, 0) > 0 OR COALESCE(return48, 0) > 0)
    """)


def downgrade() -> None:
    # No-op: cannot safely distinguish backfilled rows from legitimate
    # dist_return_empties rows written after this migration.
    pass
