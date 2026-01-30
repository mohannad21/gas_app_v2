"""add company cylinder payment event

Revision ID: bdbd764a24e1
Revises: ab7f45f1593e
Create Date: 2026-01-22 16:30:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from datetime import datetime, timezone

# revision identifiers, used by Alembic.
revision = 'bdba764a24e1'
down_revision = 'ab7f45f1593e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_cylinder_payment_events",
        sa.Column("id", sa.String(), nullable=False, index=True),
        sa.Column("business_date", sa.Date(), nullable=False, index=True),
        sa.Column("effective_at", sa.DateTime(), nullable=False, index=True, default=lambda: datetime.now(timezone.utc)),
        sa.Column("gas_type", sa.String(), nullable=False, index=True),
        sa.Column("quantity", sa.Integer(), nullable=False, default=0),
        sa.Column("amount", sa.Float(), nullable=False, default=0),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, default=False, index=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, index=True, default=lambda: datetime.now(timezone.utc)),
        sa.Column("created_by", sa.String(), nullable=True, index=True),
        sa.PrimaryKeyConstraint("id")
    )


def downgrade() -> None:
    op.drop_table("company_cylinder_payment_events")
