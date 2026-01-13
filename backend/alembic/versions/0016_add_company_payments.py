"""add company payments table

Revision ID: 0016_add_company_payments
Revises: 0015_add_collection_snapshots
Create Date: 2026-01-07
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision = "0016_add_company_payments"
down_revision = "0015_add_collection_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_payments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("time_of_day", sa.String(), nullable=True),
        sa.Column("effective_at", sa.DateTime(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deletion_reason", sa.Text(), nullable=True),
    )
    op.create_index("ix_company_payments_business_date", "company_payments", ["business_date"])
    op.create_index("ix_company_payments_effective_at", "company_payments", ["effective_at"])
    op.create_index("ix_company_payments_is_deleted", "company_payments", ["is_deleted"])


def downgrade() -> None:
    op.drop_index("ix_company_payments_is_deleted", table_name="company_payments")
    op.drop_index("ix_company_payments_effective_at", table_name="company_payments")
    op.drop_index("ix_company_payments_business_date", table_name="company_payments")
    op.drop_table("company_payments")
