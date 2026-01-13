"""add gross relationship fields

Revision ID: 0018_add_gross_relationship_fields
Revises: 0017_add_company_cylinder_payables
Create Date: 2026-01-13
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision = "0018_add_gross_relationship_fields"
down_revision = "0017_add_company_cylinder_payables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("money_to_receive", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customers",
        sa.Column("money_to_give", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customers",
        sa.Column("cylinder_to_receive_12kg", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customers",
        sa.Column("cylinder_to_give_12kg", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customers",
        sa.Column("cylinder_to_receive_48kg", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customers",
        sa.Column("cylinder_to_give_48kg", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column(
        "customer_adjustments",
        sa.Column("amount_money_to_receive", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_adjustments",
        sa.Column("amount_money_to_give", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_adjustments",
        sa.Column("count_12kg_to_receive", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_adjustments",
        sa.Column("count_12kg_to_give", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_adjustments",
        sa.Column("count_48kg_to_receive", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "customer_adjustments",
        sa.Column("count_48kg_to_give", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column(
        "company_daily_summary",
        sa.Column("payable_give_start", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_give_delta", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_give_end", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_receive_start", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_receive_delta", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_receive_end", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_12kg_give_start", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_12kg_give_delta", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_12kg_give_end", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_12kg_receive_start", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_12kg_receive_delta", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_12kg_receive_end", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_48kg_give_start", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_48kg_give_delta", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_48kg_give_end", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_48kg_receive_start", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_48kg_receive_delta", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "company_daily_summary",
        sa.Column("payable_48kg_receive_end", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("company_daily_summary", "payable_48kg_receive_end")
    op.drop_column("company_daily_summary", "payable_48kg_receive_delta")
    op.drop_column("company_daily_summary", "payable_48kg_receive_start")
    op.drop_column("company_daily_summary", "payable_48kg_give_end")
    op.drop_column("company_daily_summary", "payable_48kg_give_delta")
    op.drop_column("company_daily_summary", "payable_48kg_give_start")
    op.drop_column("company_daily_summary", "payable_12kg_receive_end")
    op.drop_column("company_daily_summary", "payable_12kg_receive_delta")
    op.drop_column("company_daily_summary", "payable_12kg_receive_start")
    op.drop_column("company_daily_summary", "payable_12kg_give_end")
    op.drop_column("company_daily_summary", "payable_12kg_give_delta")
    op.drop_column("company_daily_summary", "payable_12kg_give_start")
    op.drop_column("company_daily_summary", "payable_receive_end")
    op.drop_column("company_daily_summary", "payable_receive_delta")
    op.drop_column("company_daily_summary", "payable_receive_start")
    op.drop_column("company_daily_summary", "payable_give_end")
    op.drop_column("company_daily_summary", "payable_give_delta")
    op.drop_column("company_daily_summary", "payable_give_start")

    op.drop_column("customer_adjustments", "count_48kg_to_give")
    op.drop_column("customer_adjustments", "count_48kg_to_receive")
    op.drop_column("customer_adjustments", "count_12kg_to_give")
    op.drop_column("customer_adjustments", "count_12kg_to_receive")
    op.drop_column("customer_adjustments", "amount_money_to_give")
    op.drop_column("customer_adjustments", "amount_money_to_receive")

    op.drop_column("customers", "cylinder_to_give_48kg")
    op.drop_column("customers", "cylinder_to_receive_48kg")
    op.drop_column("customers", "cylinder_to_give_12kg")
    op.drop_column("customers", "cylinder_to_receive_12kg")
    op.drop_column("customers", "money_to_give")
    op.drop_column("customers", "money_to_receive")
