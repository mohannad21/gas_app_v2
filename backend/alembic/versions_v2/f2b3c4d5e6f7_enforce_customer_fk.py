"""enforce customer_transactions customer_id fk"""
from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "f2b3c4d5e6f7"
down_revision = "e1c2d3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("customer_transactions_customer_id_fkey", "customer_transactions", type_="foreignkey")
    op.create_foreign_key(
        "customer_transactions_customer_id_fkey",
        "customer_transactions",
        "customers",
        ["customer_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("customer_transactions_customer_id_fkey", "customer_transactions", type_="foreignkey")
    op.create_foreign_key(
        "customer_transactions_customer_id_fkey",
        "customer_transactions",
        "customers",
        ["customer_id"],
        ["id"],
    )

