"""DB-T7: Dedicated bank_transfers table; migrate deposits out of expenses."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "v1_db_t7_bank_transfers"
down_revision = "u1_db_t6_fifo_inventory_costing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 7a: Create bank_transfers table
    op.create_table(
        "bank_transfers",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("tenant_id", sa.String, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("direction", sa.String, nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("note", sa.String, nullable=True),
        sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("day", sa.Date, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.String, nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.String, nullable=True),
        sa.Column("reversal_source_id", sa.String, nullable=True),
        sa.Column("reversed_id", sa.String, nullable=True),
        sa.Column("request_id", sa.String, nullable=True),
    )
    op.create_index("ix_bank_transfers_tenant_id", "bank_transfers", ["tenant_id"])
    op.create_index("ix_bank_transfers_happened_at", "bank_transfers", ["happened_at"])
    op.create_index("ix_bank_transfers_day", "bank_transfers", ["day"])
    op.create_index("ix_bank_transfers_deleted_at", "bank_transfers", ["deleted_at"])
    op.create_index("ix_bank_transfers_reversal_source_id", "bank_transfers", ["reversal_source_id"])
    op.create_index("ix_bank_transfers_reversed_id", "bank_transfers", ["reversed_id"])
    op.create_index(
        "ix_bank_transfers_composite",
        "bank_transfers",
        ["tenant_id", "day", "deleted_at", "happened_at"],
    )
    op.create_unique_constraint(
        "uq_bank_transfers_tenant_request",
        "bank_transfers",
        ["tenant_id", "request_id"],
    )

    # 7b: Copy all expense rows with kind='deposit' to bank_transfers.
    # Same ID is preserved so ledger_entries.source_id still points correctly
    # after updating source_type below.
    # Direction: paid_from='bank' -> 'bank_to_wallet'; else -> 'wallet_to_bank'
    op.execute("""
        INSERT INTO bank_transfers
            (id, tenant_id, direction, amount, note, happened_at, day,
             created_at, created_by, updated_at, updated_by,
             deleted_at, deleted_by, reversal_source_id, reversed_id, request_id)
        SELECT
            id,
            tenant_id,
            CASE WHEN paid_from = 'bank' THEN 'bank_to_wallet' ELSE 'wallet_to_bank' END,
            amount,
            note,
            happened_at,
            day,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at,
            deleted_by,
            reversal_source_id,
            reversed_id,
            request_id
        FROM expenses
        WHERE kind = 'deposit'
    """)

    # 7b: Update ledger_entries so bank transfer rows use the new source_type.
    # source_id stays the same (bank_transfer.id == old expense.id).
    op.execute("""
        UPDATE ledger_entries
        SET source_type = 'bank_transfer'
        WHERE source_type = 'expense'
          AND source_id IN (SELECT id FROM expenses WHERE kind = 'deposit')
    """)

    # 7b: Soft-delete the migrated expense rows. Already-deleted rows keep their
    # existing deleted_at; only active deposit rows are newly soft-deleted here.
    op.execute("""
        UPDATE expenses
        SET deleted_at = NOW()
        WHERE kind = 'deposit'
          AND deleted_at IS NULL
    """)

    # 7d: Drop expenses.kind. After migration all active expenses are real
    # business expenses and the column is a constant.
    op.drop_index("ix_expenses_kind", table_name="expenses")
    op.drop_column("expenses", "kind")


def downgrade() -> None:
    # Re-add kind column (nullable during migration, then filled)
    op.add_column("expenses", sa.Column("kind", sa.String, nullable=True))

    # Restore existing migrated deposit rows from bank_transfers.
    op.execute("""
        UPDATE expenses e
        SET
            kind = 'deposit',
            paid_from = CASE WHEN bt.direction = 'bank_to_wallet' THEN 'bank' ELSE 'cash' END,
            deleted_at = bt.deleted_at,
            deleted_by = bt.deleted_by,
            reversal_source_id = bt.reversal_source_id,
            reversed_id = bt.reversed_id
        FROM bank_transfers bt
        WHERE e.id = bt.id
    """)

    # Restore deposit rows created after the upgrade.
    op.execute("""
        INSERT INTO expenses
            (id, tenant_id, request_id, happened_at, created_at, created_by,
             updated_at, updated_by, day, kind, amount,
             paid_from, note, vendor, deleted_at, deleted_by,
             reversal_source_id, reversed_id, is_reversed)
        SELECT
            bt.id,
            bt.tenant_id,
            bt.request_id,
            bt.happened_at,
            bt.created_at,
            bt.created_by,
            bt.updated_at,
            bt.updated_by,
            bt.day,
            'deposit',
            bt.amount,
            CASE WHEN bt.direction = 'bank_to_wallet' THEN 'bank' ELSE 'cash' END,
            bt.note,
            NULL,
            bt.deleted_at,
            bt.deleted_by,
            bt.reversal_source_id,
            bt.reversed_id,
            false
        FROM bank_transfers bt
        WHERE bt.id NOT IN (SELECT id FROM expenses)
    """)

    # Restore ledger entries source_type for former deposit rows
    op.execute("""
        UPDATE ledger_entries
        SET source_type = 'expense'
        WHERE source_type = 'bank_transfer'
    """)

    # Fill kind='expense' for all non-deposit rows
    op.execute("UPDATE expenses SET kind = 'expense' WHERE kind IS NULL")

    # Make kind NOT NULL
    op.alter_column("expenses", "kind", nullable=False)

    # Re-add the index
    op.create_index("ix_expenses_kind", "expenses", ["kind"])

    # Drop bank_transfers table
    op.drop_constraint("uq_bank_transfers_tenant_request", "bank_transfers", type_="unique")
    op.drop_index("ix_bank_transfers_composite", table_name="bank_transfers")
    op.drop_index("ix_bank_transfers_reversed_id", table_name="bank_transfers")
    op.drop_index("ix_bank_transfers_reversal_source_id", table_name="bank_transfers")
    op.drop_index("ix_bank_transfers_deleted_at", table_name="bank_transfers")
    op.drop_index("ix_bank_transfers_day", table_name="bank_transfers")
    op.drop_index("ix_bank_transfers_happened_at", table_name="bank_transfers")
    op.drop_index("ix_bank_transfers_tenant_id", table_name="bank_transfers")
    op.drop_table("bank_transfers")
