"""initial schema

Revision ID: 0001_init
Revises:
Create Date: 2025-12-07
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.create_table(
    "customers",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("name", sa.String(), nullable=False),
    sa.Column("phone", sa.String(), nullable=False),
    sa.Column("notes", sa.Text(), nullable=True),
    sa.Column("customer_type", sa.String(), nullable=False, index=True),
    sa.Column("money_balance", sa.Float(), nullable=False, server_default="0"),
    sa.Column("number_of_orders", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("cylinder_balance_12kg", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("cylinder_balance_48kg", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("created_by", sa.String(), nullable=True),
    sa.Column("updated_by", sa.String(), nullable=True),
    sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("deletion_reason", sa.Text(), nullable=True),
  )

  op.create_table(
    "systems",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("customer_id", sa.String(), sa.ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True),
    sa.Column("name", sa.String(), nullable=False),
    sa.Column("location", sa.String(), nullable=True),
    sa.Column("system_type", sa.String(), nullable=False, index=True),
    sa.Column("gas_type", sa.String(), nullable=True, index=True),
    sa.Column("system_customer_type", sa.String(), nullable=True, index=True),
    sa.Column("security_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    sa.Column("last_security_check_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("next_security_due_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("security_status", sa.String(), nullable=True),
    sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("deletion_reason", sa.Text(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("created_by", sa.String(), nullable=True),
    sa.Column("updated_by", sa.String(), nullable=True),
  )

  op.create_table(
    "orders",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("customer_id", sa.String(), sa.ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True),
    sa.Column("system_id", sa.String(), sa.ForeignKey("systems.id", ondelete="RESTRICT"), nullable=False, index=True),
    sa.Column("delivered_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, index=True),
    sa.Column("gas_type", sa.String(), nullable=False, index=True),
    sa.Column("cylinders_installed", sa.Integer(), nullable=False),
    sa.Column("cylinders_received", sa.Integer(), nullable=False),
    sa.Column("price_total", sa.Float(), nullable=False),
    sa.Column("paid_amount", sa.Float(), nullable=False),
    sa.Column("note", sa.Text(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("created_by", sa.String(), nullable=True),
    sa.Column("updated_by", sa.String(), nullable=True),
    sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("deletion_reason", sa.Text(), nullable=True),
  )

  op.create_table(
    "price_settings",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("gas_type", sa.String(), nullable=False, index=True),
    sa.Column("customer_type", sa.String(), nullable=False, index=True),
    sa.Column("selling_price", sa.Float(), nullable=False),
    sa.Column("buying_price", sa.Float(), nullable=True),
    sa.Column("effective_from", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, index=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    sa.Column("created_by", sa.String(), nullable=True),
  )

  op.create_table(
    "activities",
    sa.Column("id", sa.String(), primary_key=True),
    sa.Column("entity_type", sa.String(), nullable=False, index=True),
    sa.Column("entity_id", sa.String(), nullable=True, index=True),
    sa.Column("action", sa.String(), nullable=False, index=True),
    sa.Column("description", sa.Text(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, index=True),
    sa.Column("created_by", sa.String(), nullable=True),
  )


def downgrade() -> None:
  op.drop_table("activities")
  op.drop_table("price_settings")
  op.drop_table("orders")
  op.drop_table("systems")
  op.drop_table("customers")
