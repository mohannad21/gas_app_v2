from __future__ import annotations

DAY0 = "2024-01-01"
DAY1 = "2024-01-02"
DAY2 = "2024-01-03"
DAY3 = "2024-01-04"


def at(date: str, hour: int = 9, minute: int = 0) -> str:
    return f"{date}T{hour:02d}:{minute:02d}:00"


# ---Customer activities ───────────────────────────────────────────────────────

def post_system(client, customer_id, gas_type, name=None):
    r = client.post("/systems", json={
        "customer_id": customer_id,
        "name": name or f"System {gas_type}",
        "gas_type": gas_type,
        "is_active": True,
    })
    assert r.status_code < 300, r.text
    return r.json()["id"]


def post_replacement(client, customer_id, system_id, gas_type, cylinders_installed,
                     cylinders_received, price_total, paid_amount, happened_at):
    r = client.post("/orders", json={
        "customer_id": customer_id,
        "system_id": system_id,
        "order_mode": "replacement",
        "gas_type": gas_type,
        "cylinders_installed": cylinders_installed,
        "cylinders_received": cylinders_received,
        "price_total": price_total,
        "paid_amount": paid_amount,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_sell_full(client, customer_id, system_id, gas_type, cylinders_installed,
                   price_total, paid_amount, happened_at):
    r = client.post("/orders", json={
        "customer_id": customer_id,
        "system_id": system_id,
        "order_mode": "sell_iron",
        "gas_type": gas_type,
        "cylinders_installed": cylinders_installed,
        "cylinders_received": 0,
        "price_total": price_total,
        "paid_amount": paid_amount,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_buy_empty(client, customer_id, gas_type, cylinders_received,
                   price_total, paid_amount, happened_at):
    r = client.post("/orders", json={
        "customer_id": customer_id,
        "order_mode": "buy_iron",
        "gas_type": gas_type,
        "cylinders_installed": 0,
        "cylinders_received": cylinders_received,
        "price_total": price_total,
        "paid_amount": paid_amount,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_payment_from_customer(client, customer_id, amount, happened_at):
    r = client.post("/collections", json={
        "customer_id": customer_id,
        "action_type": "payment",
        "amount_money": amount,
        "qty_12kg": 0,
        "qty_48kg": 0,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_payout_to_customer(client, customer_id, amount, happened_at):
    r = client.post("/collections", json={
        "customer_id": customer_id,
        "action_type": "payout",
        "amount_money": amount,
        "qty_12kg": 0,
        "qty_48kg": 0,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_return_empties_from_customer(client, customer_id, qty_12kg, qty_48kg, happened_at):
    r = client.post("/collections", json={
        "customer_id": customer_id,
        "action_type": "return",
        "amount_money": 0,
        "qty_12kg": qty_12kg,
        "qty_48kg": qty_48kg,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_customer_balance_adjustment(client, customer_id, amount_money,
                                     count_12kg, count_48kg, happened_at):
    r = client.post("/customer-adjustments", json={
        "customer_id": customer_id,
        "amount_money": amount_money,
        "count_12kg": count_12kg,
        "count_48kg": count_48kg,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


# ---Inventory / refill activities ─────────────────────────────────────────────

def post_refill(client, buy12, return12, buy48, return48,
                total_cost, paid_amount, happened_at):
    r = client.post("/inventory/refill", json={
        "buy12": buy12,
        "return12": return12,
        "buy48": buy48,
        "return48": return48,
        "total_cost": total_cost,
        "paid_amount": paid_amount,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_inventory_adjustment(client, gas_type, delta_full, delta_empty, happened_at):
    r = client.post("/inventory/adjust", json={
        "gas_type": gas_type,
        "delta_full": delta_full,
        "delta_empty": delta_empty,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


# ---Company activities ────────────────────────────────────────────────────────

def post_buy_full_from_company(client, new12, new48, total_cost, paid_amount, happened_at):
    r = client.post("/company/buy_iron", json={
        "new12": new12,
        "new48": new48,
        "total_cost": total_cost,
        "paid_amount": paid_amount,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_return_empties_to_company(client, gas_type, quantity, happened_at):
    r = client.post("/company/cylinders/settle", json={
        "gas_type": gas_type,
        "quantity": quantity,
        "direction": "return_empty",
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_payment_to_company(client, amount, happened_at):
    r = client.post("/company/payments", json={
        "amount": amount,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


# VERIFY BEFORE USE: sign convention for a payment FROM the company to us.
# Business rule: company pays us → our wallet increases.
# Assumption: same endpoint, negative amount signals inflow.
# If this assumption is wrong (e.g. separate endpoint or positive amount),
# update this helper — the test assertion must still reflect the business rule.
def post_payment_from_company(client, amount, happened_at):
    r = client.post("/company/payments", json={
        "amount": -amount,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_company_balance_adjustment(client, money_balance, cylinder_balance_12,
                                    cylinder_balance_48, happened_at):
    r = client.post("/company/balances/adjust", json={
        "money_balance": money_balance,
        "cylinder_balance_12": cylinder_balance_12,
        "cylinder_balance_48": cylinder_balance_48,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


# ---Cash activities ───────────────────────────────────────────────────────────

def post_wallet_adjustment(client, delta_cash, happened_at):
    r = client.post("/cash/adjust", json={
        "delta_cash": delta_cash,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_wallet_to_bank(client, amount, happened_at):
    r = client.post("/cash/bank_deposit", json={
        "amount": amount,
        "direction": "wallet_to_bank",
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


def post_bank_to_wallet(client, amount, happened_at):
    r = client.post("/cash/bank_deposit", json={
        "amount": amount,
        "direction": "bank_to_wallet",
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


# ---Expense ---────

# VERIFY BEFORE USE: the expense_type field in POST /expenses.
# Assumption: accepts the category ID string returned by POST /expenses/categories.
# If it accepts a name string instead, change the parameter and callers accordingly.
def post_expense(client, expense_type_id, amount, happened_at):
    r = client.post("/expenses", json={
        "date": happened_at[:10],
        "expense_type": expense_type_id,
        "amount": amount,
        "happened_at": happened_at,
    })
    assert r.status_code < 300, r.text
    return r.json()


# ---Report helpers ────────────────────────────────────────────────────────────

def get_day_report(client, date: str) -> dict:
    r = client.get("/reports/day", params={"date": date})
    assert r.status_code < 300, r.text
    return r.json()


def get_daily_cards(client) -> list[dict]:
    r = client.get("/reports/daily")
    assert r.status_code < 300, r.text
    return r.json()


def get_daily_card(client, date: str) -> dict | None:
    for card in get_daily_cards(client):
        if card["date"] == date:
            return card
    return None


def get_day_events(client, date: str) -> list[dict]:
    return get_day_report(client, date)["events"]
