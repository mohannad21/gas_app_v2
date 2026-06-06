# Ticket: Fix Daily Report NET Calculation

## Branch
Create a new branch from `main`:
```
git checkout main
git pull
git checkout -b fix/daily-net-calculation
```

---

## Rules — Read These First

- **Read every file before modifying it.**
- **No improvisation.** If anything is unclear, stop and ask.
- No logic changes beyond what is described. Do not touch unrelated code.
- Run the verification commands at the end and confirm they pass.

---

## Background

The distributor's daily NET represents the change in their personal wallet cash for the day.
The company wallet (refills, company payments) is a separate wallet — it must not affect
the personal daily NET.

`net_today` is currently `running_cash - cash_start`, where `running_cash` is the sum of
ALL cash ledger entries including `company_txn` entries. This is wrong: every refill payment
and company transaction reduces `net_today` even though that money comes from a different wallet.

**The correct NET includes only:**
- Customer order payments received (`customer_txn / kind=order`)
- Customer debt collections (`customer_txn / kind=payment`)
- Customer payouts — cash returned to a customer (`customer_txn / kind=payout`)
- Cash expenses — paid from wallet, not bank (`expense / kind=expense / paid_from=cash`)
- Cash adjustments — manual wallet corrections (`cash_adjust`)

**Excluded from NET:**
- All company transactions: refills, company payments, buy_iron (`company_txn`)
- Bank deposits / transfers (`expense / kind=deposit`) — internal movement between wallets

**Why reversals and deletions are handled correctly by this fix:**
When any transaction is deleted or updated, `reverse_source` is called. The reversal entries
keep the same `source_type` as the original. Therefore:
- Delete a customer order → reversal has `source_type="customer_txn"` → correctly reduces NET
- Delete a company payment → reversal has `source_type="company_txn"` → excluded from NET (correct)
- Delete a cash expense → reversal has `source_type="expense"` → correctly increases NET
- Delete a cash adjustment → reversal has `source_type="cash_adjust"` → correctly reverses NET

**`sold_12kg` / `sold_48kg` are not affected.** They already filter by
`source_type="customer_txn"` and correctly handle order deletions/updates via reversals.
No change is needed for those fields.

---

## Fix — Two changes in two files

### Change 1 — `backend/app/services/reports_aggregates.py`

Read the file first.

Find `_daily_deltas` (around line 369):

```python
def _daily_deltas(
  session: Session,
  *,
  account: str,
  gas_type: Optional[str] = None,
  state: Optional[str] = None,
  unit: str,
  date_start: date,
  date_end: date,
) -> dict[date, int]:
  rows = session.exec(
    select(
      LedgerEntry.day,
      func.coalesce(func.sum(LedgerEntry.amount), 0),
    )
    .where(LedgerEntry.account == account)
    .where(LedgerEntry.unit == unit)
    .where(LedgerEntry.day >= date_start)
    .where(LedgerEntry.day <= date_end)
    .where(
      LedgerEntry.gas_type == gas_type if gas_type else True
    )
    .where(
      LedgerEntry.state == state if state else True
    )
    .group_by(LedgerEntry.day)
  ).all()
  return {day: int(delta or 0) for day, delta in rows}
```

Replace with:

```python
def _daily_deltas(
  session: Session,
  *,
  account: str,
  gas_type: Optional[str] = None,
  state: Optional[str] = None,
  unit: str,
  date_start: date,
  date_end: date,
  exclude_source_types: Optional[list[str]] = None,
) -> dict[date, int]:
  q = (
    select(
      LedgerEntry.day,
      func.coalesce(func.sum(LedgerEntry.amount), 0),
    )
    .where(LedgerEntry.account == account)
    .where(LedgerEntry.unit == unit)
    .where(LedgerEntry.day >= date_start)
    .where(LedgerEntry.day <= date_end)
    .where(
      LedgerEntry.gas_type == gas_type if gas_type else True
    )
    .where(
      LedgerEntry.state == state if state else True
    )
  )
  if exclude_source_types:
    q = q.where(LedgerEntry.source_type.notin_(exclude_source_types))
  rows = session.exec(q.group_by(LedgerEntry.day)).all()
  return {day: int(delta or 0) for day, delta in rows}
```

**Do not change anything else in this file.**

---

### Change 2 — `backend/app/routers/reports.py`

Read the file first.

There are two places in the file where `cash_deltas` is computed (around lines 165 and ~630).
Both currently look like:

```python
cash_deltas = _daily_deltas(session, account="cash", unit="money", date_start=start_date, date_end=end_date)
```

In both places, add `exclude_source_types=["company_txn"]`:

```python
cash_deltas = _daily_deltas(session, account="cash", unit="money", date_start=start_date, date_end=end_date, exclude_source_types=["company_txn"])
```

Also find the two places where `_sum_cash_before_day` is called (around line 202). This
function computes the running `cash_start` for the date range. Read `_sum_cash_before_day`
in `reports_aggregates.py` to verify whether it also sums all cash entries including
`company_txn`. If it does, apply the same exclusion there by adding an
`exclude_source_types: Optional[list[str]] = None` parameter to `_sum_cash_before_day`
and passing `exclude_source_types=["company_txn"]` at every call site in `reports.py`.

**Do not change anything else in these files.**

---

## Verification

### Backend import check
```bash
cd backend && python -c "from app.routers.reports import router; print('OK')"
```
Expected: `OK`.

### Regression tests
```bash
cd backend && python -m pytest -v \
  tests/backend/test_reports_unit.py \
  tests/backend/test_inventory_logic.py
```
Expected: all previously passing tests still pass.

### Manual checks
1. On a day with only customer orders and expenses — `net_today` equals total cash received
   from orders minus cash expenses.
2. On a day that also has a refill payment — `net_today` does **not** change compared to
   before the refill was added.
3. Delete a customer order — `net_today` decreases by the paid amount of that order.
4. Delete a cash expense — `net_today` increases by the expense amount.
5. `sold_12kg` and `sold_48kg` are unaffected — deleting an order still correctly reduces
   the sold count.
