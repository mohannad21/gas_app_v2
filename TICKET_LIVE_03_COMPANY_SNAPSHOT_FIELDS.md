# Ticket 3 — Backend: live company balance fields for refills and payments

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

Refill cards and company payment cards show before → after balance pills computed from stored `debt_*` snapshot fields. These become stale when history is edited.

**Fix**: Compute the correct "after" balance live from the ledger at the activity's exact boundary, using the existing `snapshot_company_debts` helper that already exists in `ledger.py`.

This ticket handles the company side. Ticket 2 handles the customer side. Both follow the same pattern.

**Prerequisite**: Ticket 2 must be merged first (it adds `snapshot_customer_debts` to `ledger.py`, which is the pattern to follow).

---

## Key references

- `backend/app/services/ledger.py`:
  - `boundary_for_source(session, *, source_type, source_id)` — returns `LedgerBoundary` for a specific row
  - `snapshot_company_debts(session, *, boundary)` — returns `{"debt_cash": int, "debt_cylinders_12": int, "debt_cylinders_48": int}`
  - `sum_company_money(session, *, boundary)` — used for payment-only (money only, no cylinders)
  - Company transactions use `source_type="company_txn"` in the ledger

---

## Step 1 — Add `live_debt_*` fields to `InventoryRefillSummary`

**File:** `backend/app/schemas/inventory.py`

Read the file first.

Find `class InventoryRefillSummary(SQLModel)`. Add three optional fields after the existing `debt_*` fields (and after `kind` which was added in Ticket 1):

```python
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  live_debt_cash: Optional[int] = None
  live_debt_cylinders_12: Optional[int] = None
  live_debt_cylinders_48: Optional[int] = None
```

Leave all other fields unchanged.

**Do not change anything else in this file.**

---

## Step 2 — Add `live_debt_cash` to `CompanyPaymentOut`

**File:** `backend/app/schemas/transaction.py`

Read the file first.

Find `class CompanyPaymentOut(SQLModel)`. Add one optional field:

```python
class CompanyPaymentOut(SQLModel):
  id: str
  happened_at: datetime
  amount: int
  note: Optional[str] = None
  is_deleted: bool = False
  live_debt_cash: Optional[int] = None
```

**Do not change anything else in this file.**

---

## Step 3 — Compute live fields in `list_refills`

**File:** `backend/app/routers/inventory.py`

Read the file first.

Ensure these imports are present (add any that are missing):
```python
from app.services.ledger import boundary_for_source, snapshot_company_debts
```

Find the `list_refills` function. Replace the list comprehension that builds `InventoryRefillSummary` objects with a loop that computes live values:

**Current code** (the list comprehension starting at `return [`):
```python
  return [
    InventoryRefillSummary(
      refill_id=row.id,
      ...
      debt_cash=row.debt_cash,
      debt_cylinders_12=row.debt_cylinders_12,
      debt_cylinders_48=row.debt_cylinders_48,
      is_deleted=row.deleted_at is not None,
      deleted_at=None,
    )
    for row in rows
  ]
```

**Replace with:**
```python
  result = []
  for row in rows:
    boundary = boundary_for_source(session, source_type="company_txn", source_id=row.id)
    if boundary is not None:
      live = snapshot_company_debts(session, boundary=boundary)
    else:
      live = {
        "debt_cash": row.debt_cash,
        "debt_cylinders_12": row.debt_cylinders_12,
        "debt_cylinders_48": row.debt_cylinders_48,
      }
    result.append(InventoryRefillSummary(
      refill_id=row.id,
      date=row.day.isoformat(),
      time_of_day=time_of_day(row.happened_at),
      effective_at=row.happened_at,
      buy12=row.new12 if row.kind == "buy_iron" else row.buy12,
      return12=row.return12,
      buy48=row.new48 if row.kind == "buy_iron" else row.buy48,
      return48=row.return48,
      new12=row.new12,
      new48=row.new48,
      debt_cash=row.debt_cash,
      debt_cylinders_12=row.debt_cylinders_12,
      debt_cylinders_48=row.debt_cylinders_48,
      live_debt_cash=live["debt_cash"],
      live_debt_cylinders_12=live["debt_cylinders_12"],
      live_debt_cylinders_48=live["debt_cylinders_48"],
      is_deleted=row.deleted_at is not None,
      deleted_at=None,
      kind=row.kind,
    ))
  return result
```

**Do not change anything else in this file.**

---

## Step 4 — Compute live field in `list_company_payments`

**File:** `backend/app/routers/company.py`

Read the file first.

Ensure these imports are present (add any that are missing):
```python
from app.services.ledger import boundary_for_source, sum_company_money
```

Find the `list_company_payments` function. Replace the list comprehension with a loop:

**Current code:**
```python
  return [
    CompanyPaymentOut(
      id=row.id,
      happened_at=row.happened_at,
      amount=row.paid,
      note=row.note,
      is_deleted=row.deleted_at is not None,
    )
    for row in rows
  ]
```

**Replace with:**
```python
  result = []
  for row in rows:
    boundary = boundary_for_source(session, source_type="company_txn", source_id=row.id)
    live_debt_cash = sum_company_money(session, boundary=boundary) if boundary is not None else None
    result.append(CompanyPaymentOut(
      id=row.id,
      happened_at=row.happened_at,
      amount=row.paid,
      note=row.note,
      is_deleted=row.deleted_at is not None,
      live_debt_cash=live_debt_cash,
    ))
  return result
```

**Do not change anything else in this file.**

---

## Step 5 — Backend tests

**Directory:** `tests/backend/`
**File to create:** `tests/backend/test_live_company_fields.py`

Use the `client` fixture. Follow the same style as `test_company_transactions.py` and `test_refill_snapshots.py`. Use the `init_inventory` helper from `conftest` if needed.

Write the following 3 tests:

---

### Test 1: `test_refill_live_debt_cash_correct_after_creation`

```
- Create a refill: POST /inventory/refill (buy12=5, return12=3, total_cost=500, paid_now=200)
- GET /inventory/refills
- Assert the returned entry has live_debt_cash == 300 (500 - 200 unpaid)
- Assert live_debt_cylinders_12 is not None
```

---

### Test 2: `test_refill_live_fields_correct_per_boundary`

This verifies each refill reports its own "after" state, not the current total.

```
- Create refill A: total_cost=400, paid_now=100 (debt becomes 300 after A)
- Create refill B: total_cost=200, paid_now=200 (debt stays 300 after B — fully paid)
- GET /inventory/refills
- Find refill A — assert live_debt_cash == 300
- Find refill B — assert live_debt_cash == 300 (still 300 because B was fully paid)
```

---

### Test 3: `test_company_payment_live_debt_cash_correct`

```
- Create a refill: total_cost=500, paid_now=0 (debt becomes 500)
- Create a company payment: POST /company/payments, amount=200
- GET /company/payments
- Find the payment entry
- Assert live_debt_cash == 300 (500 - 200)
```

---

## Verification

```bash
cd backend && pytest tests/backend/test_live_company_fields.py -v
cd backend && pytest tests/ -v
```
Expected: all existing tests pass, all 3 new tests pass.
