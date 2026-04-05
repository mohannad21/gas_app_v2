"""Add workers, roles, and permissions tables."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "j1_add_workers_roles_tables"
down_revision = "i1_add_plan_billing_tables"
branch_labels = None
depends_on = None


ROLE_OWNER_ID = "00000000-0000-0000-role-000000000001"
ROLE_DRIVER_ID = "00000000-0000-0000-role-000000000002"
ROLE_CASHIER_ID = "00000000-0000-0000-role-000000000003"
ROLE_ACCOUNTANT_ID = "00000000-0000-0000-role-000000000004"

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"

OWNER_PERMISSIONS = [
  "orders:write", "orders:read",
  "collections:write", "collections:read",
  "inventory:write", "inventory:read",
  "reports:read",
  "company:write", "company:read",
  "expenses:write", "expenses:read",
  "customers:write", "customers:read",
  "workers:manage",
  "prices:write",
  "settings:write",
]
DRIVER_PERMISSIONS = [
  "orders:write", "orders:read",
  "collections:write", "collections:read",
  "inventory:read",
  "customers:read",
]
CASHIER_PERMISSIONS = [
  "orders:read",
  "collections:write", "collections:read",
  "expenses:write", "expenses:read",
  "customers:read",
  "reports:read",
]
ACCOUNTANT_PERMISSIONS = [
  "orders:read",
  "collections:read",
  "expenses:read",
  "company:read",
  "inventory:read",
  "reports:read",
  "customers:read",
]


def upgrade() -> None:
  op.create_table(
    "roles",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("name", sa.String(), nullable=False),
    sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("description", sa.String(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_roles_name", "roles", ["name"], unique=False)

  op.create_table(
    "permissions",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("code", sa.String(), nullable=False),
    sa.Column("description", sa.String(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.PrimaryKeyConstraint("id"),
    sa.UniqueConstraint("code", name="uq_permissions_code"),
  )
  op.create_index("ix_permissions_code", "permissions", ["code"], unique=True)

  op.create_table(
    "role_permissions",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("role_id", sa.String(), nullable=False),
    sa.Column("permission_code", sa.String(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_role_permissions_role_id", "role_permissions", ["role_id"], unique=False)

  op.create_table(
    "tenant_memberships",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("tenant_id", sa.String(), nullable=False),
    sa.Column("user_id", sa.String(), nullable=False),
    sa.Column("role_id", sa.String(), nullable=False),
    sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
    sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_tm_tenant_id", "tenant_memberships", ["tenant_id"], unique=False)
  op.create_index("ix_tm_user_id", "tenant_memberships", ["user_id"], unique=False)
  op.create_index("ix_tm_is_active", "tenant_memberships", ["is_active"], unique=False)

  op.create_table(
    "invites",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("tenant_id", sa.String(), nullable=False),
    sa.Column("phone", sa.String(), nullable=False),
    sa.Column("role_id", sa.String(), nullable=False),
    sa.Column("code_hash", sa.String(), nullable=False),
    sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'pending'")),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("created_by", sa.String(), nullable=True),
    sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
    sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
    sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_invites_tenant_id", "invites", ["tenant_id"], unique=False)
  op.create_index("ix_invites_phone", "invites", ["phone"], unique=False)
  op.create_index("ix_invites_status", "invites", ["status"], unique=False)

  op.execute(
    f"""
    INSERT INTO roles (id, name, is_system, description, created_at) VALUES
        ('{ROLE_OWNER_ID}',      'distributor_owner', true, 'Full access. Tenant owner.', now()),
        ('{ROLE_DRIVER_ID}',     'driver',            true, 'Create orders and collections.', now()),
        ('{ROLE_CASHIER_ID}',    'cashier',           true, 'Manage collections and expenses.', now()),
        ('{ROLE_ACCOUNTANT_ID}', 'accountant',        true, 'Read-only access to all reports and data.', now())
    ON CONFLICT (id) DO NOTHING
    """
  )

  all_codes = list(dict.fromkeys(
    OWNER_PERMISSIONS + DRIVER_PERMISSIONS + CASHIER_PERMISSIONS + ACCOUNTANT_PERMISSIONS
  ))
  for code in all_codes:
    op.execute(
      f"""
      INSERT INTO permissions (id, code, created_at)
      VALUES (gen_random_uuid()::text, '{code}', now())
      ON CONFLICT (code) DO NOTHING
      """
    )

  role_perm_map = [
    (ROLE_OWNER_ID, OWNER_PERMISSIONS),
    (ROLE_DRIVER_ID, DRIVER_PERMISSIONS),
    (ROLE_CASHIER_ID, CASHIER_PERMISSIONS),
    (ROLE_ACCOUNTANT_ID, ACCOUNTANT_PERMISSIONS),
  ]
  for role_id, perms in role_perm_map:
    for perm in perms:
      op.execute(
        f"""
        INSERT INTO role_permissions (id, role_id, permission_code, created_at)
        VALUES (gen_random_uuid()::text, '{role_id}', '{perm}', now())
        """
      )

  op.execute(
    f"""
    INSERT INTO tenant_memberships (id, tenant_id, user_id, role_id, is_active, joined_at, created_at)
    SELECT
        gen_random_uuid()::text,
        t.id,
        t.owner_user_id,
        '{ROLE_OWNER_ID}',
        true,
        now(),
        now()
    FROM tenants t
    WHERE t.id = '{DEFAULT_TENANT_ID}'
      AND t.owner_user_id IS NOT NULL
    ON CONFLICT DO NOTHING
    """
  )


def downgrade() -> None:
  op.drop_table("invites")
  op.drop_table("tenant_memberships")
  op.drop_table("role_permissions")
  op.drop_table("permissions")
  op.drop_table("roles")
