"""Repair ledger source_type values corrupted by n1."""
from __future__ import annotations

from alembic import op


revision = "n2_repair_ledger_source_types"
down_revision = "n1_rename_activity_kinds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE ledger_entries SET source_type='cash_adjust'"
        " WHERE source_type='adjust_wallet'"
    )
    op.execute(
        "UPDATE ledger_entries SET source_type='inventory_adjust'"
        " WHERE source_type='adjust_inventory'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE ledger_entries SET source_type='adjust_wallet'"
        " WHERE source_type='cash_adjust'"
    )
    op.execute(
        "UPDATE ledger_entries SET source_type='adjust_inventory'"
        " WHERE source_type='inventory_adjust'"
    )
