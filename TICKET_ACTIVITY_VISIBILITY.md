# Ticket — Activity Visibility: verify every activity type appears in all relevant views

## Branch
Continue on `feat/live-ledger-display`.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **Do not improvise.** If anything is unclear or not covered by this ticket, stop and ask.
- No backend or frontend code changes — tests only.
- Run `cd backend && python -m pytest tests/backend/test_activity_visibility.py -v` at the end and confirm all tests pass.
- Run `cd backend && python -m pytest tests/ -v` and confirm no regressions in previously passing tests.

---

## Background

Every activity type in this app must appear in three places after it is created:

1. **Daily report** — the `/reports/day-v2` endpoint for the date the activity happened on.
2. **Add activity table** — the same `/reports/day-v2` endpoint (the add screen fetches today's activities from this endpoint). Same check as #1.
3. **Customer review** — the per-customer endpoints (`/customer-adjustments/{id}`, `/collections`, `/orders`) for activities that belong to a customer.

This ticket writes backend integration tests that create each activity type via the API and assert it is present in the correct endpoint responses.

---

## Before writing tests — read these files

Read each file to understand the exact endpoints and response shapes:

- `backend/app/routers/reports.py` — find the `day-v2` endpoint, understand what it returns and how it is structured (what `event_type` values exist, how items are identified)
- `backend/app/routers/collections.py` — find the GET endpoint for listing collections
- `backend/app/routers/customer_adjustments.py` — find the GET endpoint
- `backend/app/routers/orders.py` — find the list endpoint
- `backend/app/routers/inventory.py` — find the refills list endpoint
- `backend/app/routers/company.py` — find the payments list endpoint
- `tests/backend/conftest.py` — understand the `client` and `init_inventory` fixtures

---

## Test file

**File to create:** `tests/backend/test_activity_visibility.py`

Use the `client` fixture. Use `init_inventory` where the activity requires inventory to exist first. Follow the same HTTP-only style as all existing tests in this directory.

For the daily report check, use today's date: `datetime.now(timezone.utc).date().isoformat()`.

---

## Helper

Add this helper at the top of the file (after imports) to reduce repetition:

```python
def _assert_in_day_report(client, date: str, match_fn) -> None:
    """Assert that at least one event in the day-v2 report satisfies match_fn."""
    resp = client.get("/reports/day-v2", params={"date": date})
    assert resp.status_code == 200
    events = resp.json()
    assert any(match_fn(e) for e in events), (
        f"No matching event found in day report for {date}. "
        f"event_types present: {[e.get('event_type') for e in events]}"
    )
```

---

## Tests to write

---

### Test 1: `test_order_appears_in_day_report_and_customer_review`

```
- Create a customer
- init_inventory (required for orders)
- Create an order (POST /orders) for today
- Assert: appears in GET /reports/day-v2?date=today (match by event_type or customer_id)
- Assert: appears in GET /orders?customer_id={id} (or whichever list endpoint exists — read the router first)
```

---

### Test 2: `test_collection_appears_in_day_report_and_customer_review`

```
- Create a customer
- Create a collection payment (POST /collections, action_type="payment", amount_money=100)
- Assert: appears in GET /reports/day-v2?date=today
- Assert: appears in GET /collections?customer_id={id}
```

---

### Test 3: `test_customer_adjustment_appears_in_day_report_and_customer_review`

```
- Create a customer
- Create a customer adjustment (POST /customer-adjustments, amount_money=300)
- Assert: appears in GET /reports/day-v2?date=today
- Assert: appears in GET /customer-adjustments/{customer_id}
```

---

### Test 4: `test_refill_appears_in_day_report`

```
- init_inventory
- Create a refill (POST /inventory/refill, buy12=3, return12=0, total_cost=300, paid_now=100)
- Assert: appears in GET /reports/day-v2?date=today (event_type="refill" or similar — check the router)
- Assert: appears in GET /inventory/refills
```

---

### Test 5: `test_buy_iron_appears_in_day_report`

```
- init_inventory
- Create a buy_iron (POST /company/buy-iron or whichever endpoint — read company.py first)
- Assert: appears in GET /reports/day-v2?date=today (event_type="company_buy_iron" or similar)
- Assert: appears in GET /inventory/refills (buy_iron rows appear in the refills list)
```

---

### Test 6: `test_company_payment_appears_in_day_report`

```
- Create a company payment (POST /company/payments, amount=200)
- Assert: appears in GET /reports/day-v2?date=today
- Assert: appears in GET /company/payments
```

---

### Test 7: `test_cash_adjustment_appears_in_day_report`

```
- Read backend/app/routers/ to find the cash adjustment endpoint (search for "cash" or "adjustment" in router filenames)
- Create a cash adjustment
- Assert: appears in GET /reports/day-v2?date=today
```

If no cash adjustment endpoint exists, skip with `pytest.skip("cash adjustment endpoint not found")`.

---

### Test 8: `test_expense_appears_in_day_report`

```
- Read backend/app/routers/ to find the expense endpoint
- Create an expense
- Assert: appears in GET /reports/day-v2?date=today
```

If no expense endpoint exists, skip with `pytest.skip("expense endpoint not found")`.

---

## Verification

```bash
cd backend && python -m pytest tests/backend/test_activity_visibility.py -v
cd backend && python -m pytest tests/ -v
```

Expected: all new tests pass, no regressions in previously passing tests.

---

## Note on `event_type` values

Before writing the `match_fn` for each test, read the `day-v2` router to understand what `event_type` string is emitted for each activity. Do not guess. Common values seen in the codebase include `"refill"`, `"company_buy_iron"`, `"company_payment"`, `"customer_adjustment"`, `"collection"`, `"order"` — but verify against the actual router code.
