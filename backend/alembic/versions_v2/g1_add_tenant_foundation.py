"""Add tenant foundation."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "g1_add_tenant_foundation"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
TABLES = (
  "customers",
  "systems",
  "customer_transactions",
  "company_transactions",
  "inventory_adjustments",
  "cash_adjustments",
  "expenses",
  "ledger_entries",
)


def _tenant_fk_name(table_name: str) -> str:
  return f"fk_{table_name}_tenant_id_tenants"


def _tenant_index_name(table_name: str) -> str:
  return f"ix_{table_name}_tenant_id"


def upgrade() -> None:
  op.create_table(
    "tenants",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("name", sa.String(), nullable=False),
    sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'active'")),
    sa.Column("owner_user_id", sa.String(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint("id"),
  )
  op.execute(
    f"""
    INSERT INTO tenants (id, name, status, created_at)
    VALUES ('{DEFAULT_TENANT_ID}', 'Default', 'active', now())
    """
  )

  for table_name in TABLES:
    op.add_column(
      table_name,
      sa.Column(
        "tenant_id",
        sa.String(),
        nullable=False,
        server_default=sa.text(f"'{DEFAULT_TENANT_ID}'"),
      ),
    )
    op.create_foreign_key(
      _tenant_fk_name(table_name),
      table_name,
      "tenants",
      ["tenant_id"],
      ["id"],
    )
    op.create_index(_tenant_index_name(table_name), table_name, ["tenant_id"], unique=False)


def downgrade() -> None:
  for table_name in TABLES:
    op.drop_index(_tenant_index_name(table_name), table_name=table_name)
    op.drop_constraint(_tenant_fk_name(table_name), table_name, type_="foreignkey")
    op.drop_column(table_name, "tenant_id")

  op.drop_table("tenants")
