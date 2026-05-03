# Ticket A — Backend: Live Order Balance Fields

## Branch setup (do this first, before any code changes)

```bash
# 1. Stage, commit and push all current changes on the active branch
git add -A
git commit -m "chore: checkpoint before stale-balance fix"
git push

# 2. Create and checkout the new branch from the current branch
git checkout -b money-formatting
```

All three tickets (A, B, C) must be implemented on the `money-formatting` branch.
Do not create additional branches. Do not switch branches mid-implementation.

---

## Scope

**Do not touch any file not listed below.**
**Do not refactor, rename, reformat, or "improve" anything outside the exact lines described.**

Files to change:
- `backend/app/services/order_helpers.py`
- `backend/app/routers/orders.py`

Files to add:
- `backend/tests/backend/test_live_order_fields.py`

---

## Problem

`order_out()` in `order_helpers.py` always returns:

```python
money_balance_before=None,
money_balance_after=None,
cyl_balance_before=None,
cyl_balance_after=None,
```

Collections and adjustments already compute live values using `boundary_for_source` +
`snapshot_customer_debts`. Orders must do the same.

---

## Change 1 — `backend/app/services/order_helpers.py`

### 1a. Add imports at the top of the file (after existing imports)

```python
from sqlmodel import Session
from app.services.ledger import boundary_for_source, snapshot_customer_debts
```

### 1b. Change the signature of `order_out`

```python
# Before
def order_out(txn: CustomerTransaction) -> OrderOut:

# After
def order_out(txn: CustomerTransaction, session: Session) -> OrderOut:
```

### 1c. Add live balance computation inside `order_out`, before the `return OrderOut(...)` statement

```python
after_boundary = boundary_for_source(session, source_type="customer_txn", source_id=txn.id)
if after_boundary is not None:
    live = snapshot_customer_debts(session, customer_id=txn.customer_id, boundary=after_boundary)
else:
    live = {
        "debt_cash": txn.debt_cash,
        "debt_cylinders_12": txn.debt_cylinders_12,
        "debt_cylinders_48": txn.debt_cylinders_48,
    }

money_after = live["debt_cash"]
cyl12_after = live["debt_cylinders_12"]
cyl48_after = live["debt_cylinders_48"]

money_delta = money_delta_for_mode(txn.mode or "replacement", txn.total, txn.paid)
money_before = money_after - money_delta

cyl12_before = cyl12_after
cyl48_before = cyl48_after
if (txn.mode or "replacement") == "replacement":
    cyl_delta = txn.installed - txn.received
    if txn.gas_type == "12kg":
        cyl12_before = cyl12_after - cyl_delta
    elif txn.gas_type == "48kg":
        cyl48_before = cyl48_after - cyl_delta
```

### 1d. Update the return statement inside `order_out` — replace the four None lines

```python
# Before
money_balance_before=None,
money_balance_after=None,
cyl_balance_before=None,
cyl_balance_after=None,

# After
money_balance_before=money_before,
money_balance_after=money_after,
cyl_balance_before={"12kg": cyl12_before, "48kg": cyl48_before},
cyl_balance_after={"12kg": cyl12_after, "48kg": cyl48_after},
```

---

## Change 2 — `backend/app/routers/orders.py`

There are **4** call sites for `order_out`. All must pass `session` as the second argument.

```python
# list_orders — return statement in list comprehension
return [order_out(row, session) for row in rows]

# create_order — idempotency check return
return order_out(existing, session)

# create_order — normal return
return order_out(txn, session)

# update_order — return
return order_out(txn, session)
```

---

## Change 3 — New test file `backend/tests/backend/test_live_order_fields.py`

Write pytest tests covering the following cases. Use the same fixtures and DB setup pattern
as the existing test files in `backend/tests/backend/`.

| Test | What to assert |
|------|----------------|
| Create replacement order → GET /orders | `money_balance_after` is not None and equals the live customer money balance |
| Create sell_iron order → GET /orders | `money_balance_after` is not None; `cyl_balance_before == cyl_balance_after` (no cylinder change for sell_iron) |
| Create buy_iron order → GET /orders | `money_balance_after` is not None; `cyl_balance_before == cyl_balance_after` (no cylinder change for buy_iron) |
| Retroactive delete: create order A → create order B → delete A → GET orders | `money_balance_after` on order B reflects the recalculated balance, not the stale snapshot |
| Retroactive update: create order A → create order B → update A (change price) → GET orders | `money_balance_after` on order B is recalculated correctly |

---

## Verification

```bash
cd backend
python -c "from app.routers.orders import router; print('import OK')"
pytest tests/backend/test_live_order_fields.py -x -q
pytest tests/backend/test_orders.py -x -q
```

All must pass. Fix any failures before moving to Ticket B.

---

## Commit message

```
fix(orders): populate live balance fields in order_out

order_out() now computes money_balance_before/after and cyl_balance_before/after
using boundary_for_source + snapshot_customer_debts, matching the pattern
already used by collections and adjustments.
```
