# Ticket 2 — Backend: live customer balance fields for adjustments and collections

## Branch
Continue on `feat/live-ledger-display`.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **Do not improvise.** If anything is unclear or not covered by this ticket, stop and ask.
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described.
- Run `cd backend && pytest tests/` at the end and confirm all tests pass.

---

## Background

Customer adjustment cards and collection cards show before → after balance pills.
These values are computed from stored `debt_cash`, `debt_cylinders_12`, `debt_cylinders_48` fields on transaction rows.
When a later transaction is deleted or a past transaction is inserted, these stored snapshots become stale and cards show wrong numbers.

**Fix**: Compute the correct "after" balance live from the ledger at the activity's exact boundary.
Return the live values as new optional fields `live_debt_cash`, `live_debt_cylinders_12`, `live_debt_cylinders_48`.

The company side already has `snapshot_company_debts()` in `ledger.py` for exactly this.
This ticket adds the parallel customer helper and uses it in the two affected endpoints.

---

## Key references

- `backend/app/services/ledger.py`:
  - `sum_ledger(session, *, account, unit, gas_type, state, customer_id, boundary)` — core query
  - `boundary_for_source(session, *, source_type, source_id)` — returns `LedgerBoundary` for a specific transaction row
  - `snapshot_company_debts(session, *, boundary)` — existing company helper (model to follow)
  - Customer transactions use `source_type="customer_txn"` in the ledger
- `backend/app/routers/customer_adjustments.py` — `_adjustment_out(txns)` → returns `CustomerAdjustmentOut`
- `backend/app/routers/collections.py` — `_as_event(txns)` → returns `CollectionEvent`

---

## Step 1 — Add `snapshot_customer_debts` helper to `ledger.py`

**File:** `backend/app/services/ledger.py`

Read the file first.

After the existing `snapshot_company_debts` function, add:

```python
def snapshot_customer_debts(
  session: Session,
  *,
  customer_id: str,
  boundary: Optional[LedgerBoundary] = None,
) -> dict[str, int]:
  return {
    "debt_cash": sum_ledger(
      session,
      account="cust_money_debts",
      unit="money",
      customer_id=customer_id,
      boundary=boundary,
    ),
    "debt_cylinders_12": sum_ledger(
      session,
      account="cust_cylinders_debts",
      gas_type="12kg",
      state="empty",
      unit="count",
      customer_id=customer_id,
      boundary=boundary,
    ),
    "debt_cylinders_48": sum_ledger(
      session,
      account="cust_cylinders_debts",
      gas_type="48kg",
      state="empty",
      unit="count",
      customer_id=customer_id,
      boundary=boundary,
    ),
  }
```

**Do not change anything else in this file.**

---

## Step 2 — Add `live_debt_*` fields to `CustomerAdjustmentOut`

**File:** `backend/app/schemas/customer.py`

Read the file first.

Find `class CustomerAdjustmentOut(SQLModel)`. Add three optional fields after the existing `debt_*` fields:

```python
class CustomerAdjustmentOut(SQLModel):
  id: str
  customer_id: str
  amount_money: int
  count_12kg: int
  count_48kg: int
  reason: Optional[str] = None
  effective_at: datetime
  created_at: datetime
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  live_debt_cash: Optional[int] = None
  live_debt_cylinders_12: Optional[int] = None
  live_debt_cylinders_48: Optional[int] = None
```

**Do not change anything else in this file.**

---

## Step 3 — Add `live_debt_*` fields to `CollectionEvent`

**File:** `backend/app/schemas/order.py`

Read the file first.

Find `class CollectionEvent(SQLModel)`. Add three optional fields after the existing `debt_*` fields:

```python
class CollectionEvent(SQLModel):
  id: str
  customer_id: str
  action_type: Literal["payment", "payout", "return"]
  amount_money: Optional[int] = None
  qty_12kg: Optional[int] = None
  qty_48kg: Optional[int] = None
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  live_debt_cash: Optional[int] = None
  live_debt_cylinders_12: Optional[int] = None
  live_debt_cylinders_48: Optional[int] = None
  system_id: Optional[str] = None
  created_at: datetime
  effective_at: datetime
  note: Optional[str] = None
  is_deleted: bool = False
```

**Do not change anything else in this file.**

---

## Step 4 — Compute live fields in `_adjustment_out`

**File:** `backend/app/routers/customer_adjustments.py`

Read the file first.

The current `_adjustment_out` function signature is:
```python
def _adjustment_out(txns: list[CustomerTransaction]) -> CustomerAdjustmentOut:
```
It does NOT take a `session` parameter.

Ensure these imports are present at the top of the file (add any that are missing):
```python
from app.services.ledger import boundary_for_source, snapshot_customer_debts
```

Replace the entire `_adjustment_out` function with:

```python
def _adjustment_out(txns: list[CustomerTransaction], session: Session) -> CustomerAdjustmentOut:
  if not txns:
    raise HTTPException(status_code=404, detail="Adjustment not found")
  base = min(txns, key=_stable_txn_key)
  after = max(txns, key=_stable_txn_key)
  money = sum(t.total - t.paid for t in txns if t.gas_type is None)
  count_12 = sum(t.installed - t.received for t in txns if t.gas_type == "12kg")
  count_48 = sum(t.installed - t.received for t in txns if t.gas_type == "48kg")
  after_boundary = boundary_for_source(session, source_type="customer_txn", source_id=after.id)
  if after_boundary is not None:
    live = snapshot_customer_debts(session, customer_id=base.customer_id, boundary=after_boundary)
  else:
    live = {
      "debt_cash": after.debt_cash,
      "debt_cylinders_12": after.debt_cylinders_12,
      "debt_cylinders_48": after.debt_cylinders_48,
    }
  return CustomerAdjustmentOut(
    id=base.group_id or base.id,
    customer_id=base.customer_id,
    amount_money=money,
    count_12kg=count_12,
    count_48kg=count_48,
    reason=base.note,
    effective_at=base.happened_at,
    created_at=base.created_at,
    debt_cash=after.debt_cash,
    debt_cylinders_12=after.debt_cylinders_12,
    debt_cylinders_48=after.debt_cylinders_48,
    live_debt_cash=live["debt_cash"],
    live_debt_cylinders_12=live["debt_cylinders_12"],
    live_debt_cylinders_48=live["debt_cylinders_48"],
  )
```

Now find every call site of `_adjustment_out` in this file and add `session` as the second argument:

1. In `list_adjustments`:
   `[_adjustment_out(txns) for txns in groups.values()]`
   → `[_adjustment_out(txns, session) for txns in groups.values()]`

2. In `create_adjustment` (there are two return paths — check the file carefully for both):
   `return _adjustment_out(txns or [existing])`
   → `return _adjustment_out(txns or [existing], session)`
   
   and
   
   `return _adjustment_out(txns)`
   → `return _adjustment_out(txns, session)`

**Do not change anything else in this file.**

---

## Step 5 — Compute live fields in `_as_event`

**File:** `backend/app/routers/collections.py`

Read the file first.

The current `_as_event` function signature is:
```python
def _as_event(txns: list[CustomerTransaction]) -> CollectionEvent:
```
It does NOT take a `session` parameter.

Ensure these imports are present at the top of the file (add any that are missing):
```python
from app.services.ledger import boundary_for_source, snapshot_customer_debts
```

Replace the entire `_as_event` function with:

```python
def _as_event(txns: list[CustomerTransaction], session: Session) -> CollectionEvent:
  if not txns:
    raise HTTPException(status_code=404, detail="Collection not found")
  base = min(txns, key=_stable_txn_key)
  after = max(txns, key=_stable_txn_key)
  qty_12 = sum(t.received for t in txns if t.gas_type == "12kg")
  qty_48 = sum(t.received for t in txns if t.gas_type == "48kg")
  amount_payment = sum(t.paid for t in txns if t.kind == "payment")
  amount_payout = sum(t.paid for t in txns if t.kind == "payout")
  action_type = "payment" if amount_payment else "payout" if amount_payout else "return"
  amount = amount_payment or amount_payout
  group_id = base.group_id or base.id
  after_boundary = boundary_for_source(session, source_type="customer_txn", source_id=after.id)
  if after_boundary is not None:
    live = snapshot_customer_debts(session, customer_id=base.customer_id, boundary=after_boundary)
  else:
    live = {
      "debt_cash": after.debt_cash,
      "debt_cylinders_12": after.debt_cylinders_12,
      "debt_cylinders_48": after.debt_cylinders_48,
    }
  return CollectionEvent(
    id=group_id,
    customer_id=base.customer_id,
    action_type=action_type,
    amount_money=amount or None,
    qty_12kg=qty_12 or None,
    qty_48kg=qty_48 or None,
    debt_cash=after.debt_cash,
    debt_cylinders_12=after.debt_cylinders_12,
    debt_cylinders_48=after.debt_cylinders_48,
    live_debt_cash=live["debt_cash"],
    live_debt_cylinders_12=live["debt_cylinders_12"],
    live_debt_cylinders_48=live["debt_cylinders_48"],
    system_id=base.system_id,
    created_at=base.created_at,
    effective_at=base.happened_at,
    note=base.note,
    is_deleted=txns[0].deleted_at is not None,
  )
```

Now find every call site of `_as_event` in this file and add `session` as the second argument.
Search for `_as_event(` and update each call to `_as_event(..., session)`.

**Do not change anything else in this file.**

---

## Step 6 — Backend tests

**Directory:** `tests/backend/`
**File to create:** `tests/backend/test_live_customer_fields.py`

Use the `client` fixture (HTTP-based, same as all existing tests in this directory). Follow the exact same style as `test_collection_snapshots.py` and `test_customer_adjustment_inventory.py` — use `client.post(...)` and `client.get(...)`.

Write the following 4 tests:

---

### Test 1: `test_adjustment_live_debt_cash_correct_after_creation`

```
- Create a customer via POST /customers
- Create adjustment A: amount_money=500, count_12kg=0, count_48kg=0
- GET /customer-adjustments/{customer_id}
- Assert the returned list has one entry
- Assert entry["live_debt_cash"] == 500
- Assert entry["live_debt_cylinders_12"] == 0
- Assert entry["live_debt_cylinders_48"] == 0
```

---

### Test 2: `test_adjustment_live_debt_cash_correct_per_boundary`

This is the key regression test: each adjustment must report the balance AT ITS OWN BOUNDARY, not the current total.

```
- Create a customer
- Create adjustment A: amount_money=300 (happened_at: day T09:00)
- Create adjustment B: amount_money=200 (happened_at: day T10:00, after A)
- GET /customer-adjustments/{customer_id}
- Find the entry where amount_money == 300 (adjustment A)
  - Assert live_debt_cash == 300
- Find the entry where amount_money == 200 (adjustment B)
  - Assert live_debt_cash == 500
```

---

### Test 3: `test_adjustment_live_fields_update_after_later_row_deleted`

This proves the live query is correct even when stored values are stale.

```
- Create a customer
- Create adjustment A: amount_money=300
- Create adjustment B: amount_money=200
- GET /customer-adjustments -> adjustment A shows live_debt_cash == 300, adjustment B shows 500
- Delete adjustment B: POST /customer-adjustments/{customer_id}/reverse or DELETE equivalent
  (look at the existing test files for how deletions are performed in this codebase)
- GET /customer-adjustments again
- Now only adjustment A should be in the list
- Assert adjustment A live_debt_cash == 300
```

Note: if the codebase does not have a direct delete endpoint for customer adjustments, skip this test and note it in a comment. Do not improvise a delete path.

---

### Test 4: `test_collection_payment_live_debt_cash_correct`

```
- Create a customer
- Create an order that creates a debt: POST /orders (buy on credit, so debt_cash > 0 after)
  OR use a customer adjustment to set an initial money debt
- Create a collection payment that partially pays the debt
- GET /collections?customer_id={customer_id}
- Find the collection entry
- Assert live_debt_cash equals (initial_debt - payment_amount)
```

---

## Verification

```bash
cd backend && pytest tests/backend/test_live_customer_fields.py -v
cd backend && pytest tests/ -v
```
Expected: all existing tests pass, all 4 new tests pass.
