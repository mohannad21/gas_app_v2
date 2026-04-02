"""Add soft delete columns."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "g3_add_soft_delete_cols"
down_revision = "g2_add_audit_cols_constraints"
branch_labels = None
depends_on = None


TABLES = (
    "customer_transactions",
    "company_transactions",
    "inventory_adjustments",
    "cash_adjustments",
    "expenses",
)


def upgrade() -> None:
    for table_name in TABLES:
        op.add_column(table_name, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table_name, sa.Column("deleted_by", sa.String(), nullable=True))
        op.add_column(table_name, sa.Column("reversal_source_id", sa.String(), nullable=True))
        op.create_index(f"ix_{table_name}_deleted_at", table_name, ["deleted_at"], unique=False)
        op.create_index(
            f"ix_{table_name}_reversal_source_id",
            table_name,
            ["reversal_source_id"],
            unique=False,
        )

    op.execute(
        """
        UPDATE customer_transactions
        SET deleted_at = created_at, reversal_source_id = reversed_id
        WHERE is_reversed = TRUE
        """
    )
    op.execute(
        """
        UPDATE company_transactions
        SET deleted_at = created_at, reversal_source_id = reversed_id
        WHERE is_reversed = TRUE
        """
    )
    op.execute(
        """
        UPDATE inventory_adjustments
        SET deleted_at = created_at, reversal_source_id = reversed_id
        WHERE is_reversed = TRUE
        """
    )
    op.execute(
        """
        UPDATE cash_adjustments
        SET deleted_at = created_at, reversal_source_id = reversed_id
        WHERE is_reversed = TRUE
        """
    )
    op.execute(
        """
        UPDATE expenses
        SET deleted_at = created_at, reversal_source_id = reversed_id
        WHERE is_reversed = TRUE
        """
    )


def downgrade() -> None:
    for table_name in reversed(TABLES):
        op.drop_index(f"ix_{table_name}_reversal_source_id", table_name=table_name)
        op.drop_index(f"ix_{table_name}_deleted_at", table_name=table_name)
        op.drop_column(table_name, "reversal_source_id")
        op.drop_column(table_name, "deleted_by")
        op.drop_column(table_name, "deleted_at")
