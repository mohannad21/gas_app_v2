# Ticket: Fix Customer Adjustment Balance Snapshot

## Branch
Stay on the current branch — do NOT create a new branch.

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.
- Run `cd backend && python -c "from app.routers.customer_adjustments import router; print('OK')"` at the end to confirm no import errors.

---

## Background

Every `CustomerTransaction` row has three snapshot fields:
- `debt_cash` — the customer's money balance **after** this transaction
- `debt_cylinders_12` — the 12kg cylinder balance **after** this transaction
- `debt_cylinders_48` — the 48kg cylinder balance **after** this transaction

These are used by the frontend adapter (`customerAdjustmentToEvent`) to compute before/after pill values:
```ts
const moneyAfter = debt_cash          // from API response
const moneyBefore = moneyAfter - money_delta  // computed
```

If `debt_cash` is wrong, the pills show backwards (e.g. `credit 100 → 0` instead of `0 → debts 100`).

`orders.py` sets these correctly by computing current balance + delta before creating the transaction:
```python
current_money = sum_customer_money(session, customer_id=...)
next_money = current_money + money_delta
txn = CustomerTransaction(..., debt_cash=next_money, ...)
```

**`customer_adjustments.py` never sets these fields — they stay at their default of 0.** This causes all adjustment cards to show inverted pills.

---

## Step 1 — Add `sum_customer_money` and `sum_customer_cylinders` to the import in `customer_adjustments.py`

**File:** `backend/app/routers/customer_adjustments.py`

Read the file first.

Find the imports at the top of the file. There is currently no import from `app.services.ledger`. Add one:

```python
from app.services.ledger import sum_customer_money, sum_customer_cylinders
```

Add it after the existing `from app.services.posting import ...` line.

**Do not change anything else in this file in this step.**

---

## Step 2 — Compute and store the after-snapshot in `create_adjustment`

**File:** `backend/app/routers/customer_adjustments.py` (same file — read once, apply both steps)

Find the `create_adjustment` function (around line 72). Inside it, find the block that creates the three transactions. It currently looks like this:

```python
  happened_at = normalize_happened_at(payload.happened_at)
  group_id = _group_id()
  txns: list[CustomerTransaction] = []

  money = payload.amount_money or 0
  if money:
    txn = CustomerTransaction(
      ...
      total=money,
      paid=0,
      note=payload.reason,
      group_id=group_id,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  count_12 = payload.count_12kg or 0
  if count_12:
    txn = CustomerTransaction(
      ...
      installed=max(count_12, 0),
      received=max(-count_12, 0),
      ...
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  count_48 = payload.count_48kg or 0
  if count_48:
    txn = CustomerTransaction(
      ...
      installed=max(count_48, 0),
      received=max(-count_48, 0),
      ...
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)
```

Replace this entire block with:

```python
  happened_at = normalize_happened_at(payload.happened_at)
  group_id = _group_id()
  txns: list[CustomerTransaction] = []

  money = payload.amount_money or 0
  count_12 = payload.count_12kg or 0
  count_48 = payload.count_48kg or 0

  # Compute current balances before any posting
  current_money = sum_customer_money(session, customer_id=payload.customer_id)
  current_cyl_12 = sum_customer_cylinders(session, customer_id=payload.customer_id, gas_type="12kg")
  current_cyl_48 = sum_customer_cylinders(session, customer_id=payload.customer_id, gas_type="48kg")

  # Compute after-snapshots (what the balance will be after all three transactions)
  next_money = current_money + (money if money else 0)
  next_cyl_12 = current_cyl_12 + (count_12 if count_12 else 0)
  next_cyl_48 = current_cyl_48 + (count_48 if count_48 else 0)

  if money:
    txn = CustomerTransaction(
      tenant_id=tenant_id,
      customer_id=payload.customer_id,
      system_id=None,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="adjust",
      gas_type=None,
      installed=0,
      received=0,
      total=money,
      paid=0,
      debt_cash=next_money,
      debt_cylinders_12=next_cyl_12,
      debt_cylinders_48=next_cyl_48,
      note=payload.reason,
      group_id=group_id,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  if count_12:
    txn = CustomerTransaction(
      tenant_id=tenant_id,
      customer_id=payload.customer_id,
      system_id=None,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="adjust",
      gas_type="12kg",
      installed=max(count_12, 0),
      received=max(-count_12, 0),
      total=0,
      paid=0,
      debt_cash=next_money,
      debt_cylinders_12=next_cyl_12,
      debt_cylinders_48=next_cyl_48,
      note=payload.reason,
      group_id=group_id,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)

  if count_48:
    txn = CustomerTransaction(
      tenant_id=tenant_id,
      customer_id=payload.customer_id,
      system_id=None,
      happened_at=happened_at,
      day=derive_day(happened_at),
      kind="adjust",
      gas_type="48kg",
      installed=max(count_48, 0),
      received=max(-count_48, 0),
      total=0,
      paid=0,
      debt_cash=next_money,
      debt_cylinders_12=next_cyl_12,
      debt_cylinders_48=next_cyl_48,
      note=payload.reason,
      group_id=group_id,
      request_id=payload.request_id,
    )
    session.add(txn)
    post_customer_transaction(session, txn)
    txns.append(txn)
```

Key changes:
- Compute `current_money`, `current_cyl_12`, `current_cyl_48` once before any transaction is created, using `sum_customer_money` / `sum_customer_cylinders` (same functions used in `orders.py`)
- Compute `next_money`, `next_cyl_12`, `next_cyl_48` as the after-state
- Pass all three snapshot values into every transaction constructor
- All three transactions in the group share the same after-snapshot (they are atomic)

**Do not change anything else in this file.**

---

## Verification

```bash
cd backend && python -c "from app.routers.customer_adjustments import router; print('OK')"
```

Expected: prints `OK` with no errors.

Manual checks:

1. Create a new customer with opening balance: Money debts 100, 12kg credit 2
2. Open the customer view → Activities tab → find the Adjustment card
3. Pills should show:
   - `Money balance: 0 $ → 100 $ debts (on customer)` — green (debt grew from zero)
   - `12kg balance: 0 → 2 credit (on customer)`
4. Previously showed `credit 100 → 0` (backwards) — must NOT appear

5. Create a manual adjustment on an existing customer (e.g. customer has 100 debt, adjust -50)
6. Pills should show:
   - `Money balance: debts 100 $ → 50 $ debts (on customer)` — green (debt reduced)
