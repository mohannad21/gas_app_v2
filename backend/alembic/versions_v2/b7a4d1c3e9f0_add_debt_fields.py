from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b7a4d1c3e9f0"
down_revision = "0d12367ce15f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customer_transactions",
        sa.Column("debt_cash", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_transactions",
        sa.Column("debt_cylinders_12", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_transactions",
        sa.Column("debt_cylinders_48", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_transactions",
        sa.Column("debt_cash", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_transactions",
        sa.Column("debt_cylinders_12", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_transactions",
        sa.Column("debt_cylinders_48", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("company_transactions", "debt_cylinders_48")
    op.drop_column("company_transactions", "debt_cylinders_12")
    op.drop_column("company_transactions", "debt_cash")
    op.drop_column("customer_transactions", "debt_cylinders_48")
    op.drop_column("customer_transactions", "debt_cylinders_12")
    op.drop_column("customer_transactions", "debt_cash")
