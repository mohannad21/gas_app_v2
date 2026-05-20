"""Rename activity kind values to self-documenting names (R2 refactoring).

CustomerTransaction:
  order+replacement  → replacement
  order+sell_iron    → sell_full
  order+buy_iron     → buy_empty_from_customer
  payment            → payment_from_customer
  return             → customer_return_empties
  payout             → payment_to_customer
  adjust             → adjust_customer_balance

CompanyTransaction:
  buy_iron           → buy_full_from_company
  payment (paid>=0)  → payment_to_company
  payment (paid<0)   → payment_from_company
  adjust             → adjust_company_balance
  refill             → refill            (unchanged)
  dist_return_empties→ dist_return_empties (unchanged)

LedgerEntry source_type:
  cash_adjust        → adjust_wallet
  inventory_adjust   → adjust_inventory
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "n1_rename_activity_kinds"
down_revision = "m1_add_dist_return_empties_kind"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Drop old check constraints ────────────────────────────────────────
    op.drop_constraint("ck_customer_txn_kind", "customer_transactions", type_="check")
    op.drop_constraint("ck_company_txn_kind",  "company_transactions",  type_="check")

    # ── 2. Rename CustomerTransaction kinds ──────────────────────────────────
    op.execute(
        "UPDATE customer_transactions SET kind='replacement'"
        " WHERE kind='order' AND mode='replacement'"
    )
    op.execute(
        "UPDATE customer_transactions SET kind='sell_full'"
        " WHERE kind='order' AND mode='sell_iron'"
    )
    op.execute(
        "UPDATE customer_transactions SET kind='buy_empty_from_customer'"
        " WHERE kind='order' AND mode='buy_iron'"
    )
    op.execute(
        "UPDATE customer_transactions SET kind='payment_from_customer'"
        " WHERE kind='payment'"
    )
    op.execute(
        "UPDATE customer_transactions SET kind='customer_return_empties'"
        " WHERE kind='return'"
    )
    op.execute(
        "UPDATE customer_transactions SET kind='payment_to_customer'"
        " WHERE kind='payout'"
    )
    op.execute(
        "UPDATE customer_transactions SET kind='adjust_customer_balance'"
        " WHERE kind='adjust'"
    )

    # ── 3. Rename CompanyTransaction kinds ───────────────────────────────────
    op.execute(
        "UPDATE company_transactions SET kind='buy_full_from_company'"
        " WHERE kind='buy_iron'"
    )
    op.execute(
        "UPDATE company_transactions SET kind='payment_to_company'"
        " WHERE kind='payment' AND paid >= 0"
    )
    op.execute(
        "UPDATE company_transactions SET kind='payment_from_company'"
        " WHERE kind='payment' AND paid < 0"
    )
    op.execute(
        "UPDATE company_transactions SET kind='adjust_company_balance'"
        " WHERE kind='adjust'"
    )
    # 'refill' and 'dist_return_empties' are already correct — no change needed.

    # ── 4. Rename LedgerEntry source_type values ─────────────────────────────
    op.execute(
        "UPDATE ledger_entries SET source_type='adjust_wallet'"
        " WHERE source_type='cash_adjust'"
    )
    op.execute(
        "UPDATE ledger_entries SET source_type='adjust_inventory'"
        " WHERE source_type='inventory_adjust'"
    )

    # ── 5. Recreate check constraints with new allowed values ─────────────────
    op.create_check_constraint(
        "ck_customer_txn_kind",
        "customer_transactions",
        "kind IN ("
        "'replacement', 'sell_full', 'buy_empty_from_customer', "
        "'payment_from_customer', 'payment_to_customer', "
        "'customer_return_empties', 'adjust_customer_balance'"
        ")",
    )
    op.create_check_constraint(
        "ck_company_txn_kind",
        "company_transactions",
        "kind IN ("
        "'refill', 'dist_return_empties', 'buy_full_from_company', "
        "'payment_to_company', 'payment_from_company', 'adjust_company_balance'"
        ")",
    )


def downgrade() -> None:
    # ── 1. Drop new check constraints ────────────────────────────────────────
    op.drop_constraint("ck_customer_txn_kind", "customer_transactions", type_="check")
    op.drop_constraint("ck_company_txn_kind",  "company_transactions",  type_="check")

    # ── 2. Reverse LedgerEntry source_type ───────────────────────────────────
    op.execute(
        "UPDATE ledger_entries SET source_type='cash_adjust'"
        " WHERE source_type='adjust_wallet'"
    )
    op.execute(
        "UPDATE ledger_entries SET source_type='inventory_adjust'"
        " WHERE source_type='adjust_inventory'"
    )

    # ── 3. Reverse CompanyTransaction kinds ──────────────────────────────────
    op.execute(
        "UPDATE company_transactions SET kind='adjust'"
        " WHERE kind='adjust_company_balance'"
    )
    op.execute(
        "UPDATE company_transactions SET kind='payment'"
        " WHERE kind IN ('payment_to_company', 'payment_from_company')"
    )
    op.execute(
        "UPDATE company_transactions SET kind='buy_iron'"
        " WHERE kind='buy_full_from_company'"
    )

    # ── 4. Reverse CustomerTransaction kinds ─────────────────────────────────
    op.execute(
        "UPDATE customer_transactions SET kind='adjust'"
        " WHERE kind='adjust_customer_balance'"
    )
    op.execute(
        "UPDATE customer_transactions SET kind='payout'"
        " WHERE kind='payment_to_customer'"
    )
    op.execute(
        "UPDATE customer_transactions SET kind='return'"
        " WHERE kind='customer_return_empties'"
    )
    op.execute(
        "UPDATE customer_transactions SET kind='payment'"
        " WHERE kind='payment_from_customer'"
    )
    # Reverse the three order kinds back to kind='order' (mode column is still set)
    op.execute(
        "UPDATE customer_transactions SET kind='order'"
        " WHERE kind IN ('replacement', 'sell_full', 'buy_empty_from_customer')"
    )

    # ── 5. Restore old check constraints ─────────────────────────────────────
    op.create_check_constraint(
        "ck_customer_txn_kind",
        "customer_transactions",
        "kind IN ('order', 'payment', 'return', 'payout', 'adjust')",
    )
    op.create_check_constraint(
        "ck_company_txn_kind",
        "company_transactions",
        "kind IN ('refill', 'dist_return_empties', 'buy_iron', 'payment', 'adjust')",
    )
