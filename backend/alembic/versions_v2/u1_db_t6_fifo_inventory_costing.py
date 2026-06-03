"""DB-T6: FIFO inventory cost layers and buy_price_snapshot on customer_transactions."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "u1_db_t6_fifo_inventory_costing"
down_revision = "t1_db_t5_performance_cleanup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 6a: Create inventory_cost_layers table
    op.create_table(
        "inventory_cost_layers",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("tenant_id", sa.String, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("gas_type", sa.String, nullable=False),
        sa.Column("buy_price", sa.Integer, nullable=False),
        sa.Column("quantity_total", sa.Integer, nullable=False),
        sa.Column("quantity_remaining", sa.Integer, nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "source_id",
            sa.String,
            sa.ForeignKey("company_transactions.id", name="fk_cost_layer_source", use_alter=True),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_inventory_cost_layers_tenant_id", "inventory_cost_layers", ["tenant_id"])
    op.create_index("ix_inventory_cost_layers_gas_type", "inventory_cost_layers", ["gas_type"])
    op.create_index("ix_inventory_cost_layers_source_id", "inventory_cost_layers", ["source_id"])
    op.create_index("ix_inventory_cost_layers_acquired_at", "inventory_cost_layers", ["acquired_at"])
    # Partial index for FIFO queries - only layers with remaining stock
    op.execute("""
        CREATE INDEX ix_inventory_cost_layers_fifo
        ON inventory_cost_layers (tenant_id, gas_type, acquired_at ASC)
        WHERE quantity_remaining > 0
    """)

    # 6b: Add buy_price_snapshot to customer_transactions
    op.add_column(
        "customer_transactions",
        sa.Column("buy_price_snapshot", sa.Integer, nullable=True),
    )

    # 6e: Backfill seed cost layers for existing full-cylinder inventory.
    # Reads the net full-cylinder count per tenant+gas_type from the ledger,
    # pairs it with the most recent buy_price from price_catalog,
    # and inserts a seed layer with acquired_at = epoch so it is consumed
    # before any real refill layers.
    op.execute("""
        INSERT INTO inventory_cost_layers
            (id, tenant_id, gas_type, buy_price, quantity_total, quantity_remaining, acquired_at, source_id, created_at)
        SELECT
            gen_random_uuid()::text,
            agg.tenant_id,
            agg.gas_type,
            COALESCE(p.buy_price, 0),
            agg.total_full,
            agg.total_full,
            '1970-01-01 00:00:00+00'::timestamptz,
            NULL,
            NOW()
        FROM (
            SELECT tenant_id, gas_type, SUM(amount) AS total_full
            FROM ledger_entries
            WHERE account = 'inv'
              AND state = 'full'
              AND unit = 'count'
            GROUP BY tenant_id, gas_type
            HAVING SUM(amount) > 0
        ) agg
        LEFT JOIN LATERAL (
            SELECT buy_price
            FROM price_catalog
            WHERE tenant_id = agg.tenant_id
              AND gas_type = agg.gas_type
            ORDER BY effective_from DESC
            LIMIT 1
        ) p ON true
    """)


def downgrade() -> None:
    op.drop_column("customer_transactions", "buy_price_snapshot")
    op.execute("DROP INDEX IF EXISTS ix_inventory_cost_layers_fifo")
    op.drop_index("ix_inventory_cost_layers_acquired_at", table_name="inventory_cost_layers")
    op.drop_index("ix_inventory_cost_layers_source_id", table_name="inventory_cost_layers")
    op.drop_index("ix_inventory_cost_layers_gas_type", table_name="inventory_cost_layers")
    op.drop_index("ix_inventory_cost_layers_tenant_id", table_name="inventory_cost_layers")
    op.drop_table("inventory_cost_layers")
