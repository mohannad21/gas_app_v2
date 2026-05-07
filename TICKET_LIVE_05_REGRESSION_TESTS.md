# Ticket 5 — History-change regression tests

## Branch
Continue on `feat/live-ledger-display`.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **Do not improvise.** If anything is unclear or not covered by this ticket, stop and ask.
- No backend or frontend code changes in this ticket — tests only.
- Run `cd backend && pytest tests/` at the end and confirm all tests pass.

---

## Background

The purpose of this ticket is to verify that **deleting an old activity** and **inserting a past activity** both cause the `live_debt_*` fields on surrounding cards to reflect the correct new state.

This is the acceptance layer for the whole `feat/live-ledger-display` branch. It tests the behavior that the previous 4 tickets were designed to guarantee.

**Prerequisite**: Tickets 1–4 must be complete.

---

## Key behaviors to test

1. **Delete an old transaction** → later transactions' `live_debt_*` values must update correctly.
2. **Insert a transaction in the past** → later transactions' `live_debt_*` values must update correctly.
3. **Customer side** and **company side** must both be covered.

---

## Test file

**Directory:** `tests/backend/`
**File to create:** `tests/backend/test_live_history_changes.py`

Use the `client` fixture. Follow the same HTTP-based style as all existing tests in this directory.

Read the existing test files before writing — specifically:
- `tests/backend/test_update_backdating.py` — for patterns around inserting past activities
- `tests/backend/test_debt_lifecycle.py` — for patterns around delete/lifecycle tests
- `tests/backend/test_collection_snapshots.py` — for collection patterns
- `tests/backend/conftest.py` — for `init_inventory` and other helpers

---

## Tests to write

---

### Test 1: `test_customer_adjustment_live_fields_after_earlier_adjustment_deleted`

**Scenario**: Two adjustments exist. Delete the first one. Verify the second one's live fields are now correct.

```
Setup:
- Create a customer
- Create adjustment A at T=09:00, amount_money=300
- Create adjustment B at T=10:00, amount_money=200

Verify initial state:
- GET /customer-adjustments/{customer_id}
- Find A: assert live_debt_cash == 300
- Find B: assert live_debt_cash == 500

Action: delete (reverse) adjustment A
- Look at the codebase to find the correct endpoint for reversing/deleting an adjustment.
  DO NOT GUESS. If a delete endpoint does not exist, note it and skip.

Verify after deletion:
- GET /customer-adjustments/{customer_id}
- Only B should be in the list (or both if soft-delete is used — find whichever is non-deleted)
- Find B: assert live_debt_cash == 200 (only B's 200 remains)
```

---

### Test 2: `test_customer_adjustment_live_fields_after_past_adjustment_inserted`

**Scenario**: One adjustment exists. Insert a second adjustment in the past (before the first). Verify the first one's live fields updated.

```
Setup:
- Create a customer
- Create adjustment A at T=10:00 (today), amount_money=300
- GET /customer-adjustments → A shows live_debt_cash == 300

Action: insert adjustment B in the past, at T=09:00 (before A), amount_money=100

Verify:
- GET /customer-adjustments
- Find A (the one with amount_money=300):
  - assert live_debt_cash == 400 (B's 100 happened first, A's 300 added on top)
- Find B:
  - assert live_debt_cash == 100
```

---

### Test 3: `test_collection_live_fields_after_earlier_collection_deleted`

**Scenario**: Two collections exist for the same customer. Delete the first one. Verify the second one's live fields updated.

```
Setup:
- Create a customer
- Give the customer a money debt (e.g., via an adjustment: amount_money=500)
- Create collection payment P1 at T=09:00, amount=200 (debt goes from 500 to 300)
- Create collection payment P2 at T=10:00, amount=100 (debt goes from 300 to 200)

Verify initial state:
- GET /collections?customer_id={customer_id}
- Find P1: assert live_debt_cash == 300
- Find P2: assert live_debt_cash == 200

Action: delete (reverse) P1
- Use the correct endpoint from the codebase.

Verify after deletion:
- GET /collections?customer_id={customer_id}
- Find P2 (non-deleted): assert live_debt_cash == 300 (500 - 100, since P1 no longer exists)
```

---

### Test 4: `test_company_refill_live_fields_after_earlier_payment_deleted`

**Scenario**: A company refill creates debt. A company payment reduces it. Delete the payment. Verify the refill's live_debt_cash is back to the original value.

```
Setup:
- Create a refill: total_cost=500, paid_now=100 (debt = 400 after refill)
- Create a company payment: amount=150 (debt = 250 after payment)

Verify initial state:
- GET /inventory/refills
- Find refill: assert live_debt_cash == 400

- GET /company/payments
- Find payment: assert live_debt_cash == 250

Action: delete (reverse) the company payment
- Use the correct endpoint from the codebase.

Verify after deletion:
- GET /inventory/refills
- Find refill: assert live_debt_cash == 400 (unchanged — the boundary for this refill is before the payment)

Note: the refill's live_debt_cash should NOT change when a later payment is deleted, because the refill's boundary is before the payment. The refill correctly shows "what was owed after this specific refill".
```

---

### Test 5: `test_buy_iron_live_cylinders_not_affected_by_history_changes`

**Scenario**: A buy_iron row exists. A refill is created before it and after it. Verify buy_iron's `live_debt_cylinders_12` stays correct (unaffected by cylinder changes because buy_iron doesn't post to company cylinder debts).

```
Setup:
- Create a refill at T=09:00 with return12=3 (company cylinder debt increases by 3)
- Create a buy_iron at T=10:00 with new12=5
- Create another refill at T=11:00 with return12=2 (cylinder debt increases by 2 more)

Verify:
- GET /inventory/refills
- Find the buy_iron row (kind="buy_iron")
- Assert live_debt_cylinders_12 == 3 (only the T=09:00 refill contributed cylinders up to buy_iron's boundary)
- Confirm this value makes sense: buy_iron never posts to company_cylinders_debts, so its boundary captures only the refill before it
- Assert kind == "buy_iron"
```

---

## Verification

```bash
cd backend && pytest tests/backend/test_live_history_changes.py -v
cd backend && pytest tests/ -v
```
Expected: all existing tests pass, all 5 new tests pass.

---

## Note on deletion endpoints

Before writing tests that delete transactions, check the actual API. Look at:
- `backend/app/routers/customer_adjustments.py` — check for DELETE or reverse endpoints
- `backend/app/routers/collections.py` — check for DELETE or update endpoints
- `backend/app/routers/company.py` — check for DELETE endpoints on payments

If a deletion endpoint does not exist, do NOT invent one. Write the test with a comment explaining what endpoint would be needed, and mark the test with `pytest.skip("delete endpoint not yet implemented")`.
