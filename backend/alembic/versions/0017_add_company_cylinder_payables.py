"""add company cylinder payables

Revision ID: 0017_add_company_cylinder_payables
Revises: 0016_add_company_payments
Create Date: 2026-01-13
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision = "0017_add_company_cylinder_payables"
down_revision = "0016_add_company_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_deltas",
        sa.Column("delta_12kg", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_deltas",
        sa.Column("delta_48kg", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_12kg_start", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_12kg_delta", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_12kg_end", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_48kg_start", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_48kg_delta", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_48kg_end", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("company_daily_summary", "payable_48kg_end")
    op.drop_column("company_daily_summary", "payable_48kg_delta")
    op.drop_column("company_daily_summary", "payable_48kg_start")
    op.drop_column("company_daily_summary", "payable_12kg_end")
    op.drop_column("company_daily_summary", "payable_12kg_delta")
    op.drop_column("company_daily_summary", "payable_12kg_start")
    op.drop_column("company_deltas", "delta_48kg")
    op.drop_column("company_deltas", "delta_12kg")
