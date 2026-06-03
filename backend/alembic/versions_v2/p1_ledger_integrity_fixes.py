"""Fix ledger integrity: backfill tenant_id, replace NULL-trap constraint, add reversal_of_id."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "p1_ledger_integrity_fixes"
down_revision = "o1_backfill_dist_return_empties"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1a — Backfill correct tenant_id from source tables.
    # All existing rows were stamped with DEFAULT_TENANT_ID regardless of source tenant.
    op.execute("""
        UPDATE ledger_entries
        SET tenant_id = (
            SELECT tenant_id FROM customer_transactions
            WHERE id = ledger_entries.source_id
        )
        WHERE source_type = 'customer_txn'
    """)
    op.execute("""
        UPDATE ledger_entries
        SET tenant_id = (
            SELECT tenant_id FROM company_transactions
            WHERE id = ledger_entries.source_id
        )
        WHERE source_type = 'company_txn'
    """)
    op.execute("""
        UPDATE ledger_entries
        SET tenant_id = (
            SELECT tenant_id FROM inventory_adjustments
            WHERE id = ledger_entries.source_id
        )
        WHERE source_type = 'inventory_adjust'
    """)
    op.execute("""
        UPDATE ledger_entries
        SET tenant_id = (
            SELECT tenant_id FROM expenses
            WHERE id = ledger_entries.source_id
        )
        WHERE source_type = 'expense'
    """)
    op.execute("""
        UPDATE ledger_entries
        SET tenant_id = (
            SELECT tenant_id FROM cash_adjustments
            WHERE id = ledger_entries.source_id
        )
        WHERE source_type = 'cash_adjust'
    """)
    # system_init rows have no source table to join.
    # They remain at DEFAULT_TENANT_ID, which is correct —
    # system initialization is always performed for the default tenant.

    # 1c — Replace the NULL-trap unique constraint with two partial unique indexes.
    # The original constraint allowed duplicate money rows because NULL != NULL in SQL,
    # meaning two rows with gas_type=NULL and state=NULL could bypass it.
    op.drop_constraint("uq_ledger_source_account", "ledger_entries", type_="unique")
    op.execute("""
        CREATE UNIQUE INDEX uq_ledger_money_entries
        ON ledger_entries (source_type, source_id, account, unit)
        WHERE gas_type IS NULL AND state IS NULL
    """)
    op.execute("""
        CREATE UNIQUE INDEX uq_ledger_gas_entries
        ON ledger_entries (source_type, source_id, account, gas_type, state, unit)
        WHERE gas_type IS NOT NULL OR state IS NOT NULL
    """)

    # 1d — Add reversal linkage column.
    op.add_column(
        "ledger_entries",
        sa.Column("reversal_of_id", sa.String, nullable=True),
    )
    op.create_foreign_key(
        "fk_ledger_reversal_of",
        "ledger_entries",
        "ledger_entries",
        ["reversal_of_id"],
        ["id"],
        use_alter=True,
    )


def downgrade() -> None:
    op.drop_constraint("fk_ledger_reversal_of", "ledger_entries", type_="foreignkey")
    op.drop_column("ledger_entries", "reversal_of_id")
    op.drop_index("uq_ledger_gas_entries", table_name="ledger_entries")
    op.drop_index("uq_ledger_money_entries", table_name="ledger_entries")
    op.create_unique_constraint(
        "uq_ledger_source_account",
        "ledger_entries",
        ["source_type", "source_id", "account", "gas_type", "state", "unit"],
    )
    # downgrade does not restore backfilled tenant_id values
