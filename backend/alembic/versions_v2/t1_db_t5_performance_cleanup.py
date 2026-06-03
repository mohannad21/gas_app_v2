"""DB-T5: rename cash_adjustments->wallet_adjustments, drop unused group_id columns,
create transaction_groups table, add composite indexes."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "t1_db_t5_performance_cleanup"
down_revision = "s1_db_t4_tenant_isolation"
branch_labels = None
depends_on = None

_OPERATIONAL_TABLES = [
    "customer_transactions",
    "company_transactions",
    "expenses",
    "inventory_adjustments",
    "wallet_adjustments",
]


def upgrade() -> None:
    # 5e: Rename cash_adjustments -> wallet_adjustments
    op.execute("ALTER TABLE cash_adjustments RENAME TO wallet_adjustments")
    # Rename all indexes that reference the old table name in their name.
    for old_suffix in [
        "day", "happened_at", "id", "is_reversed", "tenant_id",
        "deleted_at", "reversed_id", "reversal_source_id", "group_id",
    ]:
        old = f"ix_cash_adjustments_{old_suffix}"
        new = f"ix_wallet_adjustments_{old_suffix}"
        op.execute(f"ALTER INDEX IF EXISTS {old} RENAME TO {new}")

    # 5g: Drop unused group_id columns
    op.drop_index("ix_wallet_adjustments_group_id", table_name="wallet_adjustments", if_exists=True)
    op.drop_column("wallet_adjustments", "group_id")
    op.drop_index("ix_expenses_group_id", table_name="expenses", if_exists=True)
    op.drop_column("expenses", "group_id")

    # 5d: Create transaction_groups parent table
    op.create_table(
        "transaction_groups",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("tenant_id", sa.String, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("kind", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String, nullable=True),
    )
    op.create_index("ix_transaction_groups_tenant_id", "transaction_groups", ["tenant_id"])
    op.create_index("ix_transaction_groups_kind", "transaction_groups", ["kind"])

    # 5d: Backfill transaction_groups from customer_transactions
    op.execute("""
        INSERT INTO transaction_groups (id, tenant_id, kind, created_at, created_by)
        SELECT DISTINCT ON (group_id)
            group_id, tenant_id, kind, created_at, created_by
        FROM customer_transactions
        WHERE group_id IS NOT NULL AND group_id <> ''
        ORDER BY group_id, created_at ASC
        ON CONFLICT (id) DO NOTHING
    """)

    # 5d: Backfill from company_transactions
    op.execute("""
        INSERT INTO transaction_groups (id, tenant_id, kind, created_at, created_by)
        SELECT DISTINCT ON (group_id)
            group_id, tenant_id, kind, created_at, created_by
        FROM company_transactions
        WHERE group_id IS NOT NULL AND group_id <> ''
        ORDER BY group_id, created_at ASC
        ON CONFLICT (id) DO NOTHING
    """)

    # 5d: Backfill from inventory_adjustments (no kind column; use 'inventory_adjust')
    op.execute("""
        INSERT INTO transaction_groups (id, tenant_id, kind, created_at, created_by)
        SELECT DISTINCT ON (group_id)
            group_id, tenant_id, 'inventory_adjust', created_at, created_by
        FROM inventory_adjustments
        WHERE group_id IS NOT NULL AND group_id <> ''
        ORDER BY group_id, created_at ASC
        ON CONFLICT (id) DO NOTHING
    """)

    # 5d: Add NOT VALID FKs so only new rows are constrained.
    op.execute("""
        ALTER TABLE customer_transactions
        ADD CONSTRAINT fk_customer_txn_group
        FOREIGN KEY (group_id) REFERENCES transaction_groups(id)
        NOT VALID
    """)
    op.execute("""
        ALTER TABLE company_transactions
        ADD CONSTRAINT fk_company_txn_group
        FOREIGN KEY (group_id) REFERENCES transaction_groups(id)
        NOT VALID
    """)
    op.execute("""
        ALTER TABLE inventory_adjustments
        ADD CONSTRAINT fk_inventory_adj_group
        FOREIGN KEY (group_id) REFERENCES transaction_groups(id)
        NOT VALID
    """)

    # 5b: Composite indexes for report queries (operational tables)
    for table in _OPERATIONAL_TABLES:
        op.create_index(
            f"ix_{table}_tenant_day_deleted_happened",
            table,
            ["tenant_id", "day", "deleted_at", "happened_at"],
        )

    # 5b: Composite indexes for ledger_entries
    op.create_index(
        "ix_ledger_entries_tenant_day_happened",
        "ledger_entries",
        ["tenant_id", "day", "happened_at"],
    )
    op.create_index(
        "ix_ledger_entries_tenant_source",
        "ledger_entries",
        ["tenant_id", "source_type", "source_id"],
    )
    op.create_index(
        "ix_ledger_entries_tenant_account_cust_gas_happened",
        "ledger_entries",
        ["tenant_id", "account", "customer_id", "gas_type", "happened_at"],
    )


def downgrade() -> None:
    # Remove ledger composite indexes
    op.drop_index("ix_ledger_entries_tenant_account_cust_gas_happened", table_name="ledger_entries")
    op.drop_index("ix_ledger_entries_tenant_source", table_name="ledger_entries")
    op.drop_index("ix_ledger_entries_tenant_day_happened", table_name="ledger_entries")

    # Remove operational composite indexes
    for table in reversed(_OPERATIONAL_TABLES):
        op.drop_index(f"ix_{table}_tenant_day_deleted_happened", table_name=table)

    # Remove FKs
    op.drop_constraint("fk_inventory_adj_group", "inventory_adjustments", type_="foreignkey")
    op.drop_constraint("fk_company_txn_group", "company_transactions", type_="foreignkey")
    op.drop_constraint("fk_customer_txn_group", "customer_transactions", type_="foreignkey")

    # Drop transaction_groups
    op.drop_index("ix_transaction_groups_kind", table_name="transaction_groups")
    op.drop_index("ix_transaction_groups_tenant_id", table_name="transaction_groups")
    op.drop_table("transaction_groups")

    # Restore group_id columns
    op.add_column("expenses", sa.Column("group_id", sa.String, nullable=True))
    op.create_index("ix_expenses_group_id", "expenses", ["group_id"])
    op.add_column("wallet_adjustments", sa.Column("group_id", sa.String, nullable=True))
    op.create_index("ix_wallet_adjustments_group_id", "wallet_adjustments", ["group_id"])

    # Rename wallet_adjustments -> cash_adjustments
    for new_suffix in [
        "day", "happened_at", "id", "is_reversed", "tenant_id",
        "deleted_at", "reversed_id", "reversal_source_id",
    ]:
        old = f"ix_wallet_adjustments_{new_suffix}"
        new = f"ix_cash_adjustments_{new_suffix}"
        op.execute(f"ALTER INDEX IF EXISTS {old} RENAME TO {new}")
    op.execute("ALTER TABLE wallet_adjustments RENAME TO cash_adjustments")
