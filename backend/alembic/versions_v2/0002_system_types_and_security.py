"""add system types and security fields

Revision ID: 0002_system_types_and_security
Revises: 0001_new_ledger_schema
Create Date: 2026-01-30
"""

from datetime import datetime

import sqlalchemy as sa
from alembic import op


revision = "0002_system_types_and_security"
down_revision = "0001_new_ledger_schema"
branch_labels = None
depends_on = None


DEFAULT_SYSTEM_TYPES = [
  "main kitchen",
  "side kitchen",
  "water heater",
  "water heater + main kitchen",
  "water heater + side kitchen",
  "restaurant",
  "backery",
  "outside ofen",
  "outside stove",
  "other",
]


def upgrade() -> None:
  op.create_table(
    "system_type_options",
    sa.Column("id", sa.String(), primary_key=True, nullable=False),
    sa.Column("name", sa.String(), nullable=False, unique=True),
    sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
  )
  op.create_index("ix_system_type_options_id", "system_type_options", ["id"])
  op.create_index("ix_system_type_options_is_active", "system_type_options", ["is_active"])

  op.add_column("systems", sa.Column("gas_type", sa.String(), nullable=False, server_default="12kg"))
  op.add_column("systems", sa.Column("requires_security_check", sa.Boolean(), nullable=False, server_default=sa.text("0")))
  op.add_column("systems", sa.Column("security_check_exists", sa.Boolean(), nullable=False, server_default=sa.text("0")))
  op.add_column("systems", sa.Column("last_security_check_at", sa.Date(), nullable=True))
  op.add_column("systems", sa.Column("next_security_check_at", sa.Date(), nullable=True))
  op.create_index("ix_systems_gas_type", "systems", ["gas_type"])
  op.create_index("ix_systems_requires_security_check", "systems", ["requires_security_check"])
  op.create_index("ix_systems_security_check_exists", "systems", ["security_check_exists"])
  op.create_index("ix_systems_next_security_check_at", "systems", ["next_security_check_at"])

  # seed defaults
  now = datetime.utcnow()
  op.bulk_insert(
    sa.table(
      "system_type_options",
      sa.Column("id", sa.String()),
      sa.Column("name", sa.String()),
      sa.Column("is_active", sa.Boolean()),
      sa.Column("created_at", sa.DateTime(timezone=True)),
    ),
    [
      {
        "id": f"system_type_{idx + 1}",
        "name": name,
        "is_active": True,
        "created_at": now,
      }
      for idx, name in enumerate(DEFAULT_SYSTEM_TYPES)
    ],
  )


def downgrade() -> None:
  op.drop_index("ix_systems_next_security_check_at", table_name="systems")
  op.drop_index("ix_systems_security_check_exists", table_name="systems")
  op.drop_index("ix_systems_requires_security_check", table_name="systems")
  op.drop_index("ix_systems_gas_type", table_name="systems")
  op.drop_column("systems", "next_security_check_at")
  op.drop_column("systems", "last_security_check_at")
  op.drop_column("systems", "security_check_exists")
  op.drop_column("systems", "requires_security_check")
  op.drop_column("systems", "gas_type")

  op.drop_index("ix_system_type_options_is_active", table_name="system_type_options")
  op.drop_index("ix_system_type_options_id", table_name="system_type_options")
  op.drop_table("system_type_options")
