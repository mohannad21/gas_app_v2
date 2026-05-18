"""Add dist_return_empties to company_transactions kind constraint."""
from __future__ import annotations

from alembic import op


revision = "m1_add_dist_return_empties_kind"
down_revision = "l1_add_company_iron_price"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_company_txn_kind", "company_transactions", type_="check")
    op.create_check_constraint(
        "ck_company_txn_kind",
        "company_transactions",
        "kind IN ('refill', 'dist_return_empties', 'buy_iron', 'payment', 'adjust')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_company_txn_kind", "company_transactions", type_="check")
    op.create_check_constraint(
        "ck_company_txn_kind",
        "company_transactions",
        "kind IN ('refill', 'buy_iron', 'payment', 'adjust')",
    )
