"""Add plan and billing tables."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "i1_add_plan_billing_tables"
down_revision = "h1_add_auth_tables"
branch_labels = None
depends_on = None


DEFAULT_PLAN_ID = "00000000-0000-0000-0000-000000000002"
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
  op.create_table(
    "plans",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("name", sa.String(), nullable=False),
    sa.Column("description", sa.String(), nullable=True),
    sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_plans_name", "plans", ["name"], unique=False)

  op.create_table(
    "plan_entitlements",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("plan_id", sa.String(), nullable=False),
    sa.Column("key", sa.String(), nullable=False),
    sa.Column("value", sa.String(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_plan_entitlements_plan_id", "plan_entitlements", ["plan_id"], unique=False)
  op.create_index("ix_plan_entitlements_key", "plan_entitlements", ["key"], unique=False)

  op.create_table(
    "tenant_plan_subscriptions",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("tenant_id", sa.String(), nullable=False),
    sa.Column("plan_id", sa.String(), nullable=False),
    sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'active'")),
    sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("current_period_start", sa.Date(), nullable=True),
    sa.Column("current_period_end", sa.Date(), nullable=True),
    sa.Column("grace_period_end", sa.Date(), nullable=True),
    sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
    sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_tps_tenant_id", "tenant_plan_subscriptions", ["tenant_id"], unique=False)
  op.create_index("ix_tps_status", "tenant_plan_subscriptions", ["status"], unique=False)

  op.create_table(
    "tenant_plan_overrides",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("tenant_id", sa.String(), nullable=False),
    sa.Column("key", sa.String(), nullable=False),
    sa.Column("value", sa.String(), nullable=False),
    sa.Column("note", sa.String(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("created_by", sa.String(), nullable=True),
    sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_tpo_tenant_id", "tenant_plan_overrides", ["tenant_id"], unique=False)

  op.create_table(
    "billing_events",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("tenant_id", sa.String(), nullable=False),
    sa.Column("kind", sa.String(), nullable=False),
    sa.Column("amount", sa.Integer(), nullable=False),
    sa.Column("note", sa.String(), nullable=True),
    sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("created_by", sa.String(), nullable=True),
    sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_billing_events_tenant_id", "billing_events", ["tenant_id"], unique=False)
  op.create_index("ix_billing_events_kind", "billing_events", ["kind"], unique=False)
  op.create_index("ix_billing_events_effective_at", "billing_events", ["effective_at"], unique=False)

  op.execute(
    f"""
    INSERT INTO plans (id, name, description, is_active, created_at)
    VALUES (
        '{DEFAULT_PLAN_ID}',
        'Starter',
        'Default plan for all distributors',
        true,
        now()
    )
    ON CONFLICT (id) DO NOTHING
    """
  )

  op.execute(
    f"""
    INSERT INTO plan_entitlements (id, plan_id, key, value, created_at) VALUES
        (gen_random_uuid()::text, '{DEFAULT_PLAN_ID}', 'max_workers', '5', now()),
        (gen_random_uuid()::text, '{DEFAULT_PLAN_ID}', 'max_customers', '500', now())
    """
    )

  op.execute(
    f"""
    INSERT INTO tenant_plan_subscriptions
        (id, tenant_id, plan_id, status, started_at, created_at)
    VALUES (
        gen_random_uuid()::text,
        '{DEFAULT_TENANT_ID}',
        '{DEFAULT_PLAN_ID}',
        'active',
        now(),
        now()
    )
    ON CONFLICT DO NOTHING
    """
  )


def downgrade() -> None:
  op.drop_table("billing_events")
  op.drop_table("tenant_plan_overrides")
  op.drop_table("tenant_plan_subscriptions")
  op.drop_table("plan_entitlements")
  op.drop_table("plans")
