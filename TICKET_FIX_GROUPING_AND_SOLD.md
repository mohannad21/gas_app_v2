# Ticket — Fix event grouping and sold_12kg/sold_48kg count

## Branch
Continue on `feat/live-ledger-display`.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **No improvisation.** If anything is unclear, stop and ask.
- No logic changes beyond what is described. Do not touch unrelated code.
- Run the verification command at the end and confirm all tests pass.

---

## Background

Three bugs to fix, all in the day report pipeline:

1. **Inventory adjust grouping**: Two `InventoryAdjustment` rows with the same `group_id` (same bulk action) currently emit two separate `adjust` events in the day report. They should emit one.
2. **Customer adjust grouping**: A single `/customer-adjustments` POST that touches both money and cylinders creates two `CustomerTransaction` rows (both `kind="adjust"`) with the same `group_id`. These emit two separate `customer_adjust` events. They should emit one.
3. **`sold_12kg` / `sold_48kg` negative**: `_sold_full_by_day` sums all `inv/full/count` ledger entries, which includes refill deliveries (positive) and order deliveries (negative). The net is often negative or wrong. It should only count full cylinders delivered to customers (orders only), as a positive number.

---

## Files to read before modifying

- `backend/app/routers/reports.py` — day report event loop (the `get_day_report` endpoint)
- `backend/app/services/reports_aggregates.py` — `_sold_full_by_day`
- `tests/backend/test_inventory_logic.py` — `test_inventory_adjust_grouped_report_event_for_multi_row_action` (failing)
- `tests/backend/test_reports_unit.py` — `test_customer_adjust_is_grouped_and_reported_as_customer_event` (failing)

---

## Fix 1 — `_sold_full_by_day` in `reports_aggregates.py`

### Current code (around line 399)

```python
rows = session.exec(
    select(
      LedgerEntry.day,
      LedgerEntry.gas_type,
      func.coalesce(func.sum(LedgerEntry.amount), 0),
    )
    .where(LedgerEntry.account == "inv")
    .where(LedgerEntry.state == "full")
    .where(LedgerEntry.unit == "count")
    .where(LedgerEntry.day >= date_start)
    .where(LedgerEntry.day <= date_end)
    .group_by(LedgerEntry.day, LedgerEntry.gas_type)
  ).all()
return {(day, gas_type): int(qty or 0) for day, gas_type, qty in rows}
```

### Problem
Sums ALL inventory full-cylinder changes, including refill deliveries (+) and order deliveries (-). The net is not "cylinders sold to customers".

### Fix
Add `source_type == "customer_txn"` filter. Order ledger entries are negative (inventory decreases when you deliver). Negate the sum so `sold_12kg` is a positive count.

Customer `adjust` transactions also have `source_type="customer_txn"` but they do NOT post `inv/full/count` entries (verified in `posting.py`), so the filter is safe.

```python
rows = session.exec(
    select(
      LedgerEntry.day,
      LedgerEntry.gas_type,
      func.coalesce(func.sum(LedgerEntry.amount), 0),
    )
    .where(LedgerEntry.account == "inv")
    .where(LedgerEntry.state == "full")
    .where(LedgerEntry.unit == "count")
    .where(LedgerEntry.source_type == "customer_txn")
    .where(LedgerEntry.day >= date_start)
    .where(LedgerEntry.day <= date_end)
    .group_by(LedgerEntry.day, LedgerEntry.gas_type)
  ).all()
return {(day, gas_type): -int(qty or 0) for day, gas_type, qty in rows}
```

Note: `int(qty or 0)` is the sum of negative amounts, so negating it gives a positive sold count.

---

## Fix 2 — Inventory adjust grouping in `reports.py`

### Current code (around line 596)

```python
for ia in inventory_adjustments:
    event = DailyReportEvent(
      id=ia.id,
      source_id=ia.id,
      event_type="adjust",
      ...
    )
    events.append(event)
    event_sort_ids[id(event)] = ia.id or ""
    event_source_keys[id(event)] = ("inventory_adjust", ia.id)
```

### Problem
Each `InventoryAdjustment` gets its own event, regardless of `group_id`. Two adjustments in the same bulk action → two events.

### Fix

Replace the loop with a group-aware version. For each group of adjustments sharing a `group_id`, emit one event. The event's `source_id` is the `group_id`. All adjustments in the group contribute their ledger entries.

Because a single event may now need entries from multiple source IDs, you must change `event_source_keys` from `dict[int, tuple[str, str]]` to `dict[int, list[tuple[str, str]]]` (a list of source keys). Update ALL places that read from `event_source_keys` to handle the list.

**Specifically:**

Step A — Change `event_source_keys` type throughout `get_day_report`:
- Declaration: `event_source_keys: dict[int, list[tuple[str, str]]] = {}`
- All assignments: wrap existing single-key assignments in a list, e.g. `event_source_keys[id(event)] = [("cash_adjust", ca.id)]`
- Usage in the balance loop (around line 632):
  ```python
  source_keys = event_source_keys.get(id(event), [])
  event_entries = []
  for sk in source_keys:
      event_entries.extend(entries_by_source.get(sk, []))
  ```

Step B — Replace the inventory adjust loop:

```python
ia_groups: dict[str, list] = {}
for ia in inventory_adjustments:
    key = ia.group_id or ia.id
    ia_groups.setdefault(key, []).append(ia)

for group_key, ia_list in ia_groups.items():
    base = ia_list[0]
    event = DailyReportEvent(
        id=base.id,
        source_id=group_key,
        event_type="adjust",
        effective_at=base.happened_at,
        created_at=base.created_at,
        gas_type=base.gas_type,
        reason=base.note,
    )
    events.append(event)
    event_sort_ids[id(event)] = base.id or ""
    event_source_keys[id(event)] = [("inventory_adjust", ia.id) for ia in ia_list]
```

---

## Fix 3 — Customer adjust grouping in `reports.py`

### Current code (around line 518)

```python
for txn in customer_txns:
    stable_source_id = txn.group_id or txn.id
    event = DailyReportEvent(
      id=txn.id,
      source_id=stable_source_id,
      ...
    )
    events.append(event)
    event_source_keys[id(event)] = ("customer_txn", txn.id)
```

### Problem
Every `CustomerTransaction` creates its own event. A single `/customer-adjustments` with money + cylinders creates 2 transactions (both `kind="adjust"`, same `group_id`) → 2 events.

### Fix

For `kind="adjust"` transactions that share a `group_id`, emit only one event but include all group transactions' entries.

Replace the customer_txns loop with a group-aware version for adjust kinds. Normal (non-adjust) transactions continue to create one event each:

```python
# Collect adjust groups first
adjust_groups: dict[str, list] = {}
non_adjust_txns = []
for txn in customer_txns:
    if txn.kind == "adjust" and txn.group_id:
        adjust_groups.setdefault(txn.group_id, []).append(txn)
    else:
        non_adjust_txns.append(txn)

# Build events for non-adjust transactions (unchanged logic)
for txn in non_adjust_txns:
    stable_source_id = txn.group_id or txn.id
    event = DailyReportEvent(
        id=txn.id,
        source_id=stable_source_id,
        event_type=<same mapping as before>,
        ...
    )
    events.append(event)
    event_sort_ids[id(event)] = txn.id or ""
    event_source_keys[id(event)] = [("customer_txn", txn.id)]

# Build one event per adjust group
for group_key, txns in adjust_groups.items():
    base = txns[0]
    event = DailyReportEvent(
        id=base.id,
        source_id=group_key,
        event_type="customer_adjust",
        effective_at=base.happened_at,
        created_at=base.created_at,
        customer_id=base.customer_id,
        customer_name=customers[base.customer_id].name if base.customer_id and base.customer_id in customers else None,
        customer_description=customers[base.customer_id].note if base.customer_id and base.customer_id in customers else None,
        gas_type=base.gas_type,
    )
    events.append(event)
    event_sort_ids[id(event)] = base.id or ""
    event_source_keys[id(event)] = [("customer_txn", txn.id) for txn in txns]
```

**Important:** The `non_adjust_txns` loop must use the same fields that the original loop set. Read the current loop carefully and copy all fields (order_total, order_paid, order_mode, system_name, system_type, note, gas_type, etc.) into `non_adjust_txns`. Do not drop any fields.

---

## Verification

```bash
cd backend && python -m pytest -v \
  -k "inventory_adjust_grouped_report_event or customer_adjust_is_grouped_and_reported"
```

Expected: **2 passed**.

Then run the broader regression check:

```bash
cd backend && python -m pytest -v \
  -k "test_reports or test_reports_unit or test_day_level3_contract or test_day_smartticket or test_inventory_logic or test_live_balance_golden_path or test_activity_visibility"
```

Expected: same pass count as before (no new failures). The 2 pre-existing failures (`inventory_adjust_grouped` and `customer_adjust_is_grouped`) should now be fixed; all others should remain passing.
