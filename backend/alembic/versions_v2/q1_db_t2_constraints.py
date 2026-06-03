"""DB-T2: Constraints and integrity — tenant-scoped request_id, missing uniques, remove kind default, FK, check constraints, gas_type, per-kind column rules."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "q1_db_t2_constraints"
down_revision = "p1_ledger_integrity_fixes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 2a: Replace global UNIQUE(request_id) with UNIQUE(tenant_id, request_id) ──
    # Unnamed unique constraints created by sa.Column(unique=True) are named by
    # PostgreSQL as <table>_request_id_key. Drop each and replace with a named
    # partial index (WHERE request_id IS NOT NULL) so NULL rows remain exempt.
    for table in [
        "customer_transactions",
        "company_transactions",
        "expenses",
        "inventory_adjustments",
        "cash_adjustments",
    ]:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_request_id_key")
        op.execute(f"""
            CREATE UNIQUE INDEX uq_{table}_tenant_request
            ON {table} (tenant_id, request_id)
            WHERE request_id IS NOT NULL
        """)

    # ── 2b: Missing uniqueness constraints ──
    op.create_unique_constraint(
        "uq_tenant_memberships_tenant_user",
        "tenant_memberships",
        ["tenant_id", "user_id"],
    )
    op.create_unique_constraint(
        "uq_role_permissions_role_perm",
        "role_permissions",
        ["role_id", "permission_code"],
    )
    op.create_unique_constraint(
        "uq_plan_entitlements_plan_key",
        "plan_entitlements",
        ["plan_id", "key"],
    )

    # ── 2c: Remove default on company_transactions.kind ──
    op.execute("ALTER TABLE company_transactions ALTER COLUMN kind DROP DEFAULT")

    # ── 2d: FK from role_permissions.permission_code to permissions.code ──
    op.create_foreign_key(
        "fk_role_permissions_permission_code",
        "role_permissions",
        "permissions",
        ["permission_code"],
        ["code"],
    )

    # ── 2e: Check constraints on enum string fields ──
    op.create_check_constraint(
        "ck_invites_status",
        "invites",
        "status IN ('pending', 'accepted', 'expired', 'revoked')",
    )
    op.create_check_constraint(
        "ck_tenant_plan_subscriptions_status",
        "tenant_plan_subscriptions",
        "status IN ('active', 'cancelled', 'suspended')",
    )
    op.create_check_constraint(
        "ck_billing_events_kind",
        "billing_events",
        "kind IN ('payment', 'charge', 'discount', 'plan_change')",
    )
    op.create_check_constraint(
        "ck_ledger_entries_account",
        "ledger_entries",
        "account IN ('cash', 'bank', 'inv', 'cust_money_debts', 'cust_cylinders_debts', "
        "'company_money_debts', 'company_cylinders_debts', 'expense', 'cash_adjustments')",
    )
    op.create_check_constraint(
        "ck_ledger_entries_unit",
        "ledger_entries",
        "unit IN ('money', 'count')",
    )
    op.create_check_constraint(
        "ck_ledger_entries_state",
        "ledger_entries",
        "state IS NULL OR state IN ('full', 'empty')",
    )
    op.create_check_constraint(
        "ck_expenses_paid_from",
        "expenses",
        "paid_from IS NULL OR paid_from IN ('cash', 'bank')",
    )

    # ── 2f: gas_type domain enforcement ──
    # Nullable columns get the IS NULL OR guard; non-nullable do not.
    # company_transactions has no gas_type column — skip.
    for table, nullable in [
        ("systems", False),
        ("customer_transactions", True),
        ("inventory_adjustments", False),
        ("ledger_entries", True),
        ("price_catalog", False),
    ]:
        expr = (
            "gas_type IS NULL OR gas_type IN ('12kg', '48kg')"
            if nullable
            else "gas_type IN ('12kg', '48kg')"
        )
        op.create_check_constraint(f"ck_{table}_gas_type", table, expr)

    # ── 2g: Per-kind column constraints on company_transactions ──
    op.create_check_constraint(
        "ck_company_txn_payment_cols",
        "company_transactions",
        "kind NOT IN ('payment_to_company', 'payment_from_company') OR "
        "(buy12 = 0 AND buy48 = 0 AND return12 = 0 AND return48 = 0)",
    )
    op.create_check_constraint(
        "ck_company_txn_dist_return_cols",
        "company_transactions",
        "kind != 'dist_return_empties' OR (buy12 = 0 AND buy48 = 0)",
    )


def downgrade() -> None:
    # 2g
    op.drop_constraint("ck_company_txn_dist_return_cols", "company_transactions", type_="check")
    op.drop_constraint("ck_company_txn_payment_cols", "company_transactions", type_="check")

    # 2f
    for table in ["systems", "customer_transactions", "inventory_adjustments", "ledger_entries", "price_catalog"]:
        op.drop_constraint(f"ck_{table}_gas_type", table, type_="check")

    # 2e
    op.drop_constraint("ck_expenses_paid_from", "expenses", type_="check")
    op.drop_constraint("ck_ledger_entries_state", "ledger_entries", type_="check")
    op.drop_constraint("ck_ledger_entries_unit", "ledger_entries", type_="check")
    op.drop_constraint("ck_ledger_entries_account", "ledger_entries", type_="check")
    op.drop_constraint("ck_billing_events_kind", "billing_events", type_="check")
    op.drop_constraint("ck_tenant_plan_subscriptions_status", "tenant_plan_subscriptions", type_="check")
    op.drop_constraint("ck_invites_status", "invites", type_="check")

    # 2d
    op.drop_constraint("fk_role_permissions_permission_code", "role_permissions", type_="foreignkey")

    # 2c
    op.execute("ALTER TABLE company_transactions ALTER COLUMN kind SET DEFAULT 'refill'")

    # 2b
    op.drop_constraint("uq_plan_entitlements_plan_key", "plan_entitlements", type_="unique")
    op.drop_constraint("uq_role_permissions_role_perm", "role_permissions", type_="unique")
    op.drop_constraint("uq_tenant_memberships_tenant_user", "tenant_memberships", type_="unique")

    # 2a
    for table in [
        "customer_transactions",
        "company_transactions",
        "expenses",
        "inventory_adjustments",
        "cash_adjustments",
    ]:
        op.execute(f"DROP INDEX IF EXISTS uq_{table}_tenant_request")
        op.create_unique_constraint(f"{table}_request_id_key", table, ["request_id"])
