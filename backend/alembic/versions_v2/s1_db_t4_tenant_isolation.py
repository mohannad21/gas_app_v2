"""DB-T4: Tenant isolation for config tables; sessions/roles scoped; users.tenant_id removed."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "s1_db_t4_tenant_isolation"
down_revision = "r1_db_t3_soft_delete_audit"
branch_labels = None
depends_on = None

_DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
_USERS_TENANT_FK = "users_tenant_id_fkey"


def upgrade() -> None:
    # 4a: Add tenant_id to price_catalog
    op.add_column("price_catalog", sa.Column("tenant_id", sa.String, nullable=True))
    op.execute(f"UPDATE price_catalog SET tenant_id = '{_DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL")
    op.alter_column("price_catalog", "tenant_id", nullable=False)
    op.create_foreign_key("fk_price_catalog_tenant_id", "price_catalog", "tenants", ["tenant_id"], ["id"])
    op.create_index("ix_price_catalog_tenant_id", "price_catalog", ["tenant_id"])

    # 4a: Add tenant_id to expense_categories; replace global unique on name with per-tenant unique
    op.add_column("expense_categories", sa.Column("tenant_id", sa.String, nullable=True))
    op.execute(f"UPDATE expense_categories SET tenant_id = '{_DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL")
    op.alter_column("expense_categories", "tenant_id", nullable=False)
    op.create_foreign_key("fk_expense_categories_tenant_id", "expense_categories", "tenants", ["tenant_id"], ["id"])
    op.create_index("ix_expense_categories_tenant_id", "expense_categories", ["tenant_id"])
    op.drop_constraint("expense_categories_name_key", "expense_categories", type_="unique")
    op.create_unique_constraint("uq_expense_categories_tenant_name", "expense_categories", ["tenant_id", "name"])

    # 4a: Add tenant_id to system_type_options; replace global unique on name with per-tenant unique
    op.add_column("system_type_options", sa.Column("tenant_id", sa.String, nullable=True))
    op.execute(f"UPDATE system_type_options SET tenant_id = '{_DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL")
    op.alter_column("system_type_options", "tenant_id", nullable=False)
    op.create_foreign_key("fk_system_type_options_tenant_id", "system_type_options", "tenants", ["tenant_id"], ["id"])
    op.create_index("ix_system_type_options_tenant_id", "system_type_options", ["tenant_id"])
    op.drop_constraint("system_type_options_name_key", "system_type_options", type_="unique")
    op.create_unique_constraint("uq_system_type_options_tenant_name", "system_type_options", ["tenant_id", "name"])

    # 4b: Redesign system_settings from singleton to per-tenant
    op.add_column("system_settings", sa.Column("tenant_id", sa.String, nullable=True))
    op.execute(f"UPDATE system_settings SET tenant_id = '{_DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL")
    op.alter_column("system_settings", "tenant_id", nullable=False)
    op.create_foreign_key("fk_system_settings_tenant_id", "system_settings", "tenants", ["tenant_id"], ["id"])
    op.create_unique_constraint("uq_system_settings_tenant_id", "system_settings", ["tenant_id"])
    op.create_index("ix_system_settings_tenant_id", "system_settings", ["tenant_id"])

    # 4c: Add tenant_id to sessions
    op.add_column("sessions", sa.Column("tenant_id", sa.String, nullable=True))
    op.create_foreign_key("fk_sessions_tenant_id", "sessions", "tenants", ["tenant_id"], ["id"])
    op.create_index("ix_sessions_tenant_id", "sessions", ["tenant_id"])

    # 4d: Add tenant_id to roles (nullable; NULL means system-wide role)
    op.add_column("roles", sa.Column("tenant_id", sa.String, nullable=True))
    op.create_foreign_key("fk_roles_tenant_id", "roles", "tenants", ["tenant_id"], ["id"])
    op.create_index("ix_roles_tenant_id", "roles", ["tenant_id"])

    # 4e: Drop users.tenant_id; tenant_memberships is authoritative
    op.drop_index("ix_users_tenant_id", table_name="users")
    op.drop_constraint(_USERS_TENANT_FK, "users", type_="foreignkey")
    op.drop_column("users", "tenant_id")


def downgrade() -> None:
    # 4e: Restore users.tenant_id
    op.add_column("users", sa.Column("tenant_id", sa.String, nullable=True))
    op.create_foreign_key(_USERS_TENANT_FK, "users", "tenants", ["tenant_id"], ["id"])
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])

    # 4d: Remove tenant_id from roles
    op.drop_index("ix_roles_tenant_id", table_name="roles")
    op.drop_constraint("fk_roles_tenant_id", "roles", type_="foreignkey")
    op.drop_column("roles", "tenant_id")

    # 4c: Remove tenant_id from sessions
    op.drop_index("ix_sessions_tenant_id", table_name="sessions")
    op.drop_constraint("fk_sessions_tenant_id", "sessions", type_="foreignkey")
    op.drop_column("sessions", "tenant_id")

    # 4b: Remove tenant_id from system_settings
    op.drop_index("ix_system_settings_tenant_id", table_name="system_settings")
    op.drop_constraint("uq_system_settings_tenant_id", "system_settings", type_="unique")
    op.drop_constraint("fk_system_settings_tenant_id", "system_settings", type_="foreignkey")
    op.drop_column("system_settings", "tenant_id")

    # 4a: Restore system_type_options
    op.drop_constraint("uq_system_type_options_tenant_name", "system_type_options", type_="unique")
    op.drop_index("ix_system_type_options_tenant_id", table_name="system_type_options")
    op.drop_constraint("fk_system_type_options_tenant_id", "system_type_options", type_="foreignkey")
    op.drop_column("system_type_options", "tenant_id")
    op.create_unique_constraint("system_type_options_name_key", "system_type_options", ["name"])

    # 4a: Restore expense_categories
    op.drop_constraint("uq_expense_categories_tenant_name", "expense_categories", type_="unique")
    op.drop_index("ix_expense_categories_tenant_id", table_name="expense_categories")
    op.drop_constraint("fk_expense_categories_tenant_id", "expense_categories", type_="foreignkey")
    op.drop_column("expense_categories", "tenant_id")
    op.create_unique_constraint("expense_categories_name_key", "expense_categories", ["name"])

    # 4a: Restore price_catalog
    op.drop_index("ix_price_catalog_tenant_id", table_name="price_catalog")
    op.drop_constraint("fk_price_catalog_tenant_id", "price_catalog", type_="foreignkey")
    op.drop_column("price_catalog", "tenant_id")
