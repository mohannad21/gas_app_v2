"""Add auth tables."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "h1_add_auth_tables"
down_revision = "g3_add_soft_delete_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.create_table(
    "users",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("tenant_id", sa.String(), nullable=True),
    sa.Column("phone", sa.String(), nullable=True),
    sa.Column("password_hash", sa.String(), nullable=True),
    sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_users_tenant_id", "users", ["tenant_id"], unique=False)
  op.create_index("ix_users_phone", "users", ["phone"], unique=False)

  op.create_foreign_key(
    "fk_tenants_owner_user_id",
    "tenants",
    "users",
    ["owner_user_id"],
    ["id"],
  )

  op.create_table(
    "sessions",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("user_id", sa.String(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("user_agent", sa.String(), nullable=True),
    sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_sessions_user_id", "sessions", ["user_id"], unique=False)

  op.create_table(
    "activation_challenges",
    sa.Column("id", sa.String(), nullable=False),
    sa.Column("user_id", sa.String(), nullable=False),
    sa.Column("code_hash", sa.String(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_activation_challenges_user_id", "activation_challenges", ["user_id"], unique=False)


def downgrade() -> None:
  op.drop_index("ix_activation_challenges_user_id", table_name="activation_challenges")
  op.drop_table("activation_challenges")
  op.drop_index("ix_sessions_user_id", table_name="sessions")
  op.drop_table("sessions")
  op.drop_constraint("fk_tenants_owner_user_id", "tenants", type_="foreignkey")
  op.drop_index("ix_users_phone", table_name="users")
  op.drop_index("ix_users_tenant_id", table_name="users")
  op.drop_table("users")
