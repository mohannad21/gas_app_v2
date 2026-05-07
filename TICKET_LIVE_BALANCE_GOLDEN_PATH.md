# Ticket — Live Balance Golden Path Tests

## Branch
Continue on `feat/live-ledger-display`.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **Do not improvise.** If anything is unclear, stop and ask.
- No backend or frontend code changes — tests only.
- Run the verification command at the end and confirm all tests pass.

---

## Background — How Live Balance Pills Work

Every activity card in the app shows a balance pill (`live_debt_cash`, `live_debt_cylinders_12`, `live_debt_cylinders_48`). These values are **not stored**; they are recomputed from the ledger on every GET request.

### Mechanism (read before writing tests)

The ledger is an immutable append-only log of signed integer entries. Each transaction (collection, refill, etc.) posts ledger entries at its `happened_at` timestamp.

**On every GET:**

1. `boundary_for_source(session, source_type, source_id)` finds the latest ledger entry belonging to this transaction's ID.
2. `snapshot_customer_debts(session, customer_id, boundary=...)` (or `snapshot_company_debts`) sums all ledger entries **up to and including** that boundary's timestamp/id.
3. The result is returned as `live_debt_*` on the response.

**What happens on delete:**

`reverse_source()` posts new ledger entries that are the sign-reversal of the originals. The original rows are soft-deleted (`deleted_at` set). On next GET of any surviving transaction, its ledger boundary is in the past (pre-reversal), so the sum no longer includes the deleted transaction's entries.

**What happens on past-insert:**

A new transaction is created with a `happened_at` in the past. Its ledger entries land at that past timestamp. On next GET of any later transaction, `snapshot_*_debts(boundary=that_later_txn_boundary)` now includes the newly-inserted past entries, raising the balance.

**Test pattern:**

```
GET P2 → assert live_debt_cash == X
<change: delete P1 or insert a past transaction>
GET P2 again → assert live_debt_cash == X + delta
```

No cache invalidation is needed — the value always recomputes fresh.

---

## Definitions (important — use exact terms)

The three `live_debt_*` fields are what drive every x→y transition shown in the expanded card view in the daily report. The `activityAdapter` uses them as the "after" value and reverses the transaction delta to compute "before":

| UI label | Backend field | Who has it |
|----------|---------------|------------|
| Customer money balance | `live_debt_cash` | collections, customer adjustments |
| Customer 12kg cylinder balance | `live_debt_cylinders_12` | collections, customer adjustments |
| Customer 48kg cylinder balance | `live_debt_cylinders_48` | collections, customer adjustments |
| Company wallet (money debt to distributor) | `live_debt_cash` | refills, company payments |
| Company 12kg cylinder debt (empties owed) | `live_debt_cylinders_12` | refills |
| Company 48kg cylinder debt | `live_debt_cylinders_48` | refills |

All six come from the same `sum_ledger()` mechanism — they all update automatically when history changes. This test file verifies all six.

- **Set B — Inventory physical counts** (separate concept NOT tested here):
  - `inventory_before` / `inventory_after` — snapshot of cylinders in the company warehouse
  - These are stored at write time, not recomputed from the ledger
  - They do NOT change when history is edited

---

## Existing coverage (do NOT duplicate)

Read `tests/backend/test_live_history_changes.py` before writing.

These scenarios already have coverage:
- `test_customer_adjustment_live_fields_after_past_adjustment_inserted` — customer past-insert
- `test_collection_live_fields_after_earlier_collection_deleted` — collection delete

The tests below cover what is currently missing or was previously skipped.

---

## File to create

**`tests/backend/test_live_balance_golden_path.py`**

Use the `client` fixture from `conftest.py`. Import `create_customer` and `init_inventory` from `conftest`.

---

## Test 1: `test_customer_balance_after_collection_delete`

**Scenario:**

1. Create a customer.
2. POST `/customer-adjustments` with `amount_money=500` at `T=09:00` (gives the customer an opening debt of 500).
3. POST `/collections` with `action_type="payment", amount_money=200` at `T=10:00`. Call this P1.
4. POST `/collections` with `action_type="payment", amount_money=100` at `T=11:00`. Call this P2.
5. GET `/collections?customer_id={id}` → find P2 → assert `live_debt_cash == 200` (500 - 200 - 100).
6. `DELETE /collections/{P1_id}` → assert 204.
7. GET `/collections?customer_id={id}` → find P2 → assert `live_debt_cash == 400` (500 - 100, P1 erased).

**What this tests:** deleting a collection in the past raises the live balance of all later collections.

---

## Test 2: `test_customer_balance_after_past_collection_inserted`

**Scenario:**

1. Create a customer.
2. POST `/customer-adjustments` with `amount_money=500` at `T=09:00`.
3. POST `/collections` with `action_type="payment", amount_money=200` at `T=11:00`. Call this A.
4. GET `/collections?customer_id={id}` → find A → assert `live_debt_cash == 300` (500 - 200).
5. POST `/collections` with `action_type="payment", amount_money=100` at `T=10:00` (BEFORE A). Call this B.
6. GET `/collections?customer_id={id}` → find A → assert `live_debt_cash == 200` (500 - 100 - 200). B's entries now land before A's boundary.

**What this tests:** inserting a past collection lowers the live balance of all later collections.

---

## Test 3: `test_company_balance_after_payment_delete`

**Scenario:**

Company money balance (`live_debt_cash` on refill rows) represents how much the company owes its distributor.

1. `init_inventory` with a past date.
2. POST `/inventory/refill` with `buy12=5, return12=0, total_cost=500, paid_now=0` at `T=09:00`. This posts company_money_debts +500. Call this R1.
3. POST `/company/payments` with `amount=200` at `T=10:00`. Call this P1. (Reduces debt by 200.)
4. POST `/company/payments` with `amount=100` at `T=11:00`. Call this P2. (Reduces debt by another 100.)
5. GET `/inventory/refills` → find R1 → assert `live_debt_cash == 200` (500 - 200 - 100).
6. `DELETE /company/payments/{P1_id}` → assert 204.
7. GET `/inventory/refills` → find R1 → assert `live_debt_cash == 400` (500 - 100, P1 erased).

**Endpoints:**
- Create payment: `POST /company/payments`, body `{"amount": 200, "happened_at": "..."}`
- Delete payment: `DELETE /company/payments/{payment_id}` → 204 (added in Ticket 6)
- List refills: `GET /inventory/refills`

**How to find R1 in the refills list:** match by `kind == "refill"` and the `refill_id` returned from the POST.

**What this tests:** deleting a company payment raises the company money balance on all refill cards.

---

## Test 4: `test_company_balance_after_past_refill_inserted`

**Scenario:**

1. `init_inventory` with a past date.
2. POST `/inventory/refill` with `total_cost=300, paid_now=300` at `T=10:00` (fully paid, no debt). Call this R1.
3. GET `/inventory/refills` → find R1 → assert `live_debt_cash == 0`.
4. POST `/inventory/refill` with `total_cost=200, paid_now=0` at `T=09:00` (BEFORE R1, fully unpaid). Call this R2.
5. GET `/inventory/refills` → find R1 → assert `live_debt_cash == 200`. R2 posted debt entries before R1's boundary; R1's snapshot now includes that debt.

**What this tests:** a past refill with unpaid debt raises the live balance of all later refills.

---

## Test 5: `test_customer_balance_cross_zero_after_history_change`

**Scenario — crosses zero:**

1. Create a customer.
2. POST `/customer-adjustments` with `amount_money=500` at `T=08:00`.
3. POST `/collections` with `action_type="payment", amount_money=200` at `T=09:00`. Call this B.
4. POST `/collections` with `action_type="payment", amount_money=450` at `T=10:00`. Call this A.
5. GET `/collections?customer_id={id}` → find A → assert `live_debt_cash == -150` (500 - 200 - 450 = −150, customer overpaid).
6. `DELETE /collections/{B_id}` → assert 204.
7. GET `/collections?customer_id={id}` → find A → assert `live_debt_cash == 50` (500 - 450 = 50, crosses zero from negative to positive).

**What this tests:** balance can cross zero in either direction; the pill shows correct signed value after history change.

---

---

## Test 6: `test_customer_cylinder_balance_after_past_adjustment_inserted`

**Scenario — customer 12kg cylinder balance:**

Customer adjustments can change cylinder debt directly (`count_12kg`, `count_48kg`). This tests that `live_debt_cylinders_12` on a later adjustment reflects a past-inserted earlier adjustment.

1. Create a customer.
2. POST `/customer-adjustments` with `count_12kg=3, amount_money=0` at `T=11:00`. Call this A.
3. GET `/customer-adjustments/{customer_id}` → find A → assert `live_debt_cylinders_12 == 3`.
4. POST `/customer-adjustments` with `count_12kg=5, amount_money=0` at `T=09:00` (BEFORE A). Call this B.
5. GET `/customer-adjustments/{customer_id}` → find A → assert `live_debt_cylinders_12 == 8` (B's 5 cylinders now land before A's boundary).

**Also check:** A's `live_debt_cash == 0` throughout (cylinder change does not affect money balance).

**What this tests:** `live_debt_cylinders_12` updates via the same ledger mechanism as `live_debt_cash` — a past cylinder adjustment raises the cylinder balance of all later records.

---

## Test 7: `test_company_cylinder_balance_after_refill_delete`

**Scenario — company 12kg cylinder debt:**

When a refill has `return12 > 0`, the company returns empty 12kg cylinders to the distributor, reducing cylinder debt. Deleting that refill should raise the cylinder debt back up on all later records.

1. `init_inventory` with a past date.
2. POST `/inventory/refill` with `buy12=5, return12=0, buy48=0, return48=0, total_cost=300, paid_now=300` at `T=09:00`. Call this R1.
3. POST `/inventory/refill` with `buy12=0, return12=3, buy48=0, return48=0, total_cost=0, paid_now=0` at `T=10:00`. Call this R2. (Returns 3 empties, reducing cylinder debt by 3.)
4. GET `/inventory/refills` → find R2 → note `live_debt_cylinders_12` as value V.
5. `DELETE /inventory/refills/{R2_refill_id}` → assert 204.
6. GET `/inventory/refills` → find R1 → assert `live_debt_cylinders_12 == V + 3`. (The 3 returned empties no longer cancel the debt.)

**How to find refill_id:** the response from `POST /inventory/refill` is an `InventorySnapshot` (does NOT contain a `refill_id`). Instead, call `GET /inventory/refills` immediately after creating each refill and match by `kind == "refill"` and timestamp. Save the `refill_id` from the refills list.

**How to delete a refill:** `DELETE /inventory/refills/{refill_id}` → 204. Read `backend/app/routers/inventory.py` to confirm the endpoint path.

**What this tests:** `live_debt_cylinders_12` on refills tracks cylinder debt via the ledger; deleting a return-empties refill correctly raises the cylinder debt of earlier refills.

---

## Verification

```bash
cd backend && python -m pytest -v \
  tests/backend/test_live_balance_golden_path.py
```

Expected: all 7 tests pass.

---

## Notes for Codex

- Read `tests/backend/test_live_history_changes.py` first to understand the exact pattern used.
- Read `tests/backend/conftest.py` for `create_customer` and `init_inventory` signatures.
- For company payment create/delete: read `backend/app/routers/company.py` to verify the exact request body shape.
- For refill create: read `backend/app/routers/inventory.py` — `POST /inventory/refill` returns an `InventorySnapshot`, not a refill ID. To identify R1 in the refills list, use `GET /inventory/refills` and filter by `kind == "refill"` and match by timestamp or `refill_id`.
- All `happened_at` values in tests should use fixed past dates (not `datetime.now()`), e.g. `2025-11-01T09:00:00`.
- Do not add any `init_inventory` calls unless the test actually creates orders or refills that require it (Tests 3, 4, and 7 do; Tests 1, 2, 5, 6 do not).
- For Test 6: `count_12kg` field in `/customer-adjustments` payload represents a cylinder count delta. `amount_money=0` means no money adjustment — only cylinders. Read `backend/app/routers/customer_adjustments.py` to confirm payload fields.
- For Test 7: the cylinder debt value `V` from step 4 depends on the initial inventory state. Do not hardcode it — read it from the GET response and assert `V + 3` after delete.
- For Tests 6 and 7: also assert `live_debt_cylinders_48 == 0` where no 48kg activity happened, to confirm the 48kg channel is not accidentally affected.
