"""Add audit columns, group_id, and database constraints."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "g2_add_audit_cols_constraints"
down_revision = "g1_add_tenant_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("customers", sa.Column("updated_by", sa.String(), nullable=True))

    op.add_column("systems", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("systems", sa.Column("updated_by", sa.String(), nullable=True))

    op.add_column("customer_transactions", sa.Column("created_by", sa.String(), nullable=True))
    op.add_column("customer_transactions", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("customer_transactions", sa.Column("updated_by", sa.String(), nullable=True))

    op.add_column("company_transactions", sa.Column("created_by", sa.String(), nullable=True))
    op.add_column("company_transactions", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("company_transactions", sa.Column("updated_by", sa.String(), nullable=True))
    op.add_column("company_transactions", sa.Column("group_id", sa.String(), nullable=True))

    op.add_column("inventory_adjustments", sa.Column("created_by", sa.String(), nullable=True))
    op.add_column("inventory_adjustments", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("inventory_adjustments", sa.Column("updated_by", sa.String(), nullable=True))

    op.add_column("cash_adjustments", sa.Column("created_by", sa.String(), nullable=True))
    op.add_column("cash_adjustments", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cash_adjustments", sa.Column("updated_by", sa.String(), nullable=True))
    op.add_column("cash_adjustments", sa.Column("group_id", sa.String(), nullable=True))

    op.add_column("expenses", sa.Column("created_by", sa.String(), nullable=True))
    op.add_column("expenses", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("expenses", sa.Column("updated_by", sa.String(), nullable=True))
    op.add_column("expenses", sa.Column("group_id", sa.String(), nullable=True))

    op.create_index("ix_company_transactions_group_id", "company_transactions", ["group_id"], unique=False)
    op.create_index("ix_cash_adjustments_group_id", "cash_adjustments", ["group_id"], unique=False)
    op.create_index("ix_expenses_group_id", "expenses", ["group_id"], unique=False)

    op.create_check_constraint(
        "ck_customer_txn_kind",
        "customer_transactions",
        "kind IN ('order', 'payment', 'return', 'payout', 'adjust')",
    )
    op.create_check_constraint(
        "ck_customer_txn_mode",
        "customer_transactions",
        "mode IN ('replacement', 'sell_iron', 'buy_iron') OR mode IS NULL",
    )
    op.create_check_constraint(
        "ck_customer_txn_system_mode",
        "customer_transactions",
        """
        (mode IN ('replacement', 'sell_iron') AND system_id IS NOT NULL)
        OR (mode IS NULL OR mode NOT IN ('replacement', 'sell_iron'))
        """,
    )
    op.create_check_constraint(
        "ck_company_txn_kind",
        "company_transactions",
        "kind IN ('refill', 'buy_iron', 'payment', 'adjust')",
    )
    op.create_check_constraint(
        "ck_expense_kind",
        "expenses",
        "kind IN ('expense', 'deposit')",
    )
    op.create_check_constraint(
        "ck_expense_paid_from",
        "expenses",
        "paid_from IN ('cash', 'bank') OR paid_from IS NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ck_expense_paid_from", "expenses", type_="check")
    op.drop_constraint("ck_expense_kind", "expenses", type_="check")
    op.drop_constraint("ck_company_txn_kind", "company_transactions", type_="check")
    op.drop_constraint("ck_customer_txn_system_mode", "customer_transactions", type_="check")
    op.drop_constraint("ck_customer_txn_mode", "customer_transactions", type_="check")
    op.drop_constraint("ck_customer_txn_kind", "customer_transactions", type_="check")

    op.drop_index("ix_expenses_group_id", table_name="expenses")
    op.drop_index("ix_cash_adjustments_group_id", table_name="cash_adjustments")
    op.drop_index("ix_company_transactions_group_id", table_name="company_transactions")

    op.drop_column("expenses", "group_id")
    op.drop_column("expenses", "updated_by")
    op.drop_column("expenses", "updated_at")
    op.drop_column("expenses", "created_by")

    op.drop_column("cash_adjustments", "group_id")
    op.drop_column("cash_adjustments", "updated_by")
    op.drop_column("cash_adjustments", "updated_at")
    op.drop_column("cash_adjustments", "created_by")

    op.drop_column("inventory_adjustments", "updated_by")
    op.drop_column("inventory_adjustments", "updated_at")
    op.drop_column("inventory_adjustments", "created_by")

    op.drop_column("company_transactions", "group_id")
    op.drop_column("company_transactions", "updated_by")
    op.drop_column("company_transactions", "updated_at")
    op.drop_column("company_transactions", "created_by")

    op.drop_column("customer_transactions", "updated_by")
    op.drop_column("customer_transactions", "updated_at")
    op.drop_column("customer_transactions", "created_by")

    op.drop_column("systems", "updated_by")
    op.drop_column("systems", "updated_at")

    op.drop_column("customers", "updated_by")
    op.drop_column("customers", "updated_at")
