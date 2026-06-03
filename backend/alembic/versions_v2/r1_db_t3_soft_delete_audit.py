"""DB-T3: Soft delete on core entities; fill missing audit trail columns; currency on billing_events."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "r1_db_t3_soft_delete_audit"
down_revision = "q1_db_t2_constraints"
branch_labels = None
depends_on = None

_DATETIME = sa.DateTime(timezone=True)


def upgrade() -> None:
    # ── 3a: Soft-delete columns on core entities ──
    for table in ("customers", "users", "tenants", "systems"):
        op.add_column(table, sa.Column("deleted_at", _DATETIME, nullable=True))
        op.add_column(table, sa.Column("deleted_by", sa.String, nullable=True))
        op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"])

    # ── 3a: Missing audit columns on core entities ──
    op.add_column("customers", sa.Column("created_by", sa.String, nullable=True))
    op.add_column("users", sa.Column("updated_by", sa.String, nullable=True))
    op.add_column("tenants", sa.Column("created_by", sa.String, nullable=True))
    op.add_column("tenants", sa.Column("updated_by", sa.String, nullable=True))
    op.add_column("systems", sa.Column("created_by", sa.String, nullable=True))

    # ── 3b: Missing audit columns on supporting tables ──
    op.add_column("price_catalog", sa.Column("created_by", sa.String, nullable=True))
    op.add_column("price_catalog", sa.Column("updated_at", _DATETIME, nullable=True))
    op.add_column("price_catalog", sa.Column("updated_by", sa.String, nullable=True))

    op.add_column("expense_categories", sa.Column("updated_at", _DATETIME, nullable=True))
    op.add_column("expense_categories", sa.Column("updated_by", sa.String, nullable=True))

    op.add_column("system_type_options", sa.Column("updated_at", _DATETIME, nullable=True))
    op.add_column("system_type_options", sa.Column("updated_by", sa.String, nullable=True))

    op.add_column("system_settings", sa.Column("updated_at", _DATETIME, nullable=True))
    op.add_column("system_settings", sa.Column("updated_by", sa.String, nullable=True))

    op.add_column("tenant_memberships", sa.Column("updated_at", _DATETIME, nullable=True))
    op.add_column("tenant_memberships", sa.Column("updated_by", sa.String, nullable=True))

    op.add_column("plan_entitlements", sa.Column("updated_at", _DATETIME, nullable=True))
    op.add_column("plan_entitlements", sa.Column("updated_by", sa.String, nullable=True))

    op.add_column("billing_events", sa.Column("updated_at", _DATETIME, nullable=True))
    op.add_column("billing_events", sa.Column("updated_by", sa.String, nullable=True))

    op.add_column("tenant_plan_overrides", sa.Column("updated_at", _DATETIME, nullable=True))
    op.add_column("tenant_plan_overrides", sa.Column("updated_by", sa.String, nullable=True))

    op.add_column("tenant_plan_subscriptions", sa.Column("cancelled_by", sa.String, nullable=True))

    # ── 3c: Currency code on billing_events ──
    op.add_column(
        "billing_events",
        sa.Column("currency_code", sa.String, nullable=False, server_default="ILS"),
    )


def downgrade() -> None:
    # 3c
    op.drop_column("billing_events", "currency_code")

    # 3b
    op.drop_column("tenant_plan_subscriptions", "cancelled_by")
    for col in ("updated_at", "updated_by"):
        op.drop_column("tenant_plan_overrides", col)
        op.drop_column("billing_events", col)
        op.drop_column("plan_entitlements", col)
        op.drop_column("tenant_memberships", col)
        op.drop_column("system_settings", col)
        op.drop_column("system_type_options", col)
        op.drop_column("expense_categories", col)
    for col in ("created_by", "updated_at", "updated_by"):
        op.drop_column("price_catalog", col)

    # 3a audit cols
    op.drop_column("systems", "created_by")
    op.drop_column("tenants", "updated_by")
    op.drop_column("tenants", "created_by")
    op.drop_column("users", "updated_by")
    op.drop_column("customers", "created_by")

    # 3a soft-delete cols
    for table in ("customers", "users", "tenants", "systems"):
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_column(table, "deleted_by")
        op.drop_column(table, "deleted_at")
