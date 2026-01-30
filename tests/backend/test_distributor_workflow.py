from __future__ import annotations
import pytest
from conftest import init_inventory, create_customer, create_system, create_order

def test_daily_order_flow(client):
    # Use a fixed date for everything
    TEST_DATE = "2025-01-01"
    ISO_START = f"{TEST_DATE}T00:00:00"
    ISO_ORDER = f"{TEST_DATE}T10:00:00"

    # 1. Setup Inventory (Ensure we have 100 full bottles)
    # If init_inventory is your helper, make sure it sets full_count > 0
    init_inventory(client, date=TEST_DATE, full12=100, empty12=0, full48=0, empty48=0)

    # 2. Setup Price
    client.post("/prices", json={
        "gas_type": "12kg",
        "customer_type": "private",
        "selling_price": 100.0,
        "buying_price": 50.0,
        "effective_from": ISO_START
    })

    # 3. Setup Customer
    c_id = create_customer(client, name="Driver Test")
    s_id = create_system(client, customer_id=c_id)

    # 4. Make the sale
    create_order(
        client,
        customer_id=c_id,
        system_id=s_id,
        price_total=100.0,
        paid_amount=80.0,
        delivered_at=ISO_ORDER,
        installed=1,
        received=1
    )
