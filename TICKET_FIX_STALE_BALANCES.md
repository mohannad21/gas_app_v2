# Ticket: Fix Stale Balance Display on Customer Review and Add Data Pages

## Summary

The customer review page (`frontend/app/customers/[id].tsx`) and the Add Data page (`frontend/app/(tabs)/add/index.tsx`) display stale balance values after retroactive changes (edit/delete old activities). Six separate bugs compound this problem. This ticket fixes all of them.

**Status: not yet implemented.** All changes described here are planned but none have been applied to the codebase.

---

## Root Cause Analysis

### Bug 1 — `order_out()` never computes live balances

`backend/app/services/order_helpers.py` — `order_out(txn)` always returns:

```python
money_balance_before=None,
money_balance_after=None,
cyl_balance_before=None,
cyl_balance_after=None,
```

Collections and adjustments correctly use `boundary_for_source` + `snapshot_customer_debts` to compute live values. Orders do not.

### Bug 2 — `useOrders` deduplication overwrites active rows with deleted rows

`frontend/hooks/useOrders.ts` line 24:

```typescript
const deduped = Array.from(new Map(data.map((o) => [o.id, o])).values());
```

With `include_deleted=true`, backend returns rows descending by `(happened_at, created_at, id)`. For an updated order (original deleted row + reversal + new row, all sharing the same public `id`), the original deleted row arrives **last** in the array and overwrites the active updated row in the Map.

Result: Customer review and Add Data show pre-update stale data after any order edit.

### Bug 5 — Deleted activities visible on Add Data page

`frontend/app/(tabs)/add/index.tsx` lines 235–236 use `useOrders(true)` and `useCollections(true)`. Deleted rows are fetched and rendered with strikethrough styling. Same problem as customer review, different file.

### Bug 6 — `orderToEvent` treats buy_iron cash as incoming

`frontend/lib/activityAdapter.ts` line 217:
```typescript
money_direction: moneyDelta > 0 ? "in" : null,
```
`moneyDelta = order.paid_amount`. For `buy_iron`, `paid_amount` is cash paid **out** of the wallet to acquire empties. Direction should be `"out"`. Replacement and sell_iron are correct as-is.

### Bug 3 — Customer review page uses `build*Activity` functions that read frozen `debt_cash`

`frontend/app/customers/[id].tsx`:

- `buildOrderActivity` line 146: `const moneyAfter = order.debt_cash ?? 0` — stale frozen snapshot
- `buildCollectionActivity` line 214: `const moneyAfter = collection.debt_cash ?? 0` — ignores `live_debt_cash`
- `buildAdjustmentActivity` line 279: `const moneyAfter = adjustment.debt_cash ?? 0` — ignores `live_debt_cash`

The shared `*ToEvent` functions in `activityAdapter.ts` already use `live_debt_cash ?? debt_cash` correctly. The customer review page should use those instead of its own stale copies.

Additionally, `useOrders(true)` and `useCollections(true)` include deleted rows on both the customer review page and the Add Data page. Deleted activities should be hidden entirely from both surfaces.

---

## Changes

### Change 1 — `backend/app/services/order_helpers.py`

**Goal:** Populate live balance fields in `order_out()` using the same boundary pattern as collections and adjustments.

**Add imports:**

```python
from sqlmodel import Session
from app.services.ledger import boundary_for_source, snapshot_customer_debts
```

**Change signature:**

```python
# Before
def order_out(txn: CustomerTransaction) -> OrderOut:

# After
def order_out(txn: CustomerTransaction, session: Session) -> OrderOut:
```

**Add live balance computation before the return statement:**

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

# Derive before values from the mode-specific delta
money_delta = _money_delta_for_mode(txn)
money_before = money_after - money_delta

# Cylinder delta: replacement delivers full cylinders (+inv full consumed) and
# receives empties back; the net customer cylinder debt change is the qty delivered.
# For sell_iron / buy_iron modes there is no customer cylinder ledger entry.
# Use the stored debt fields as before-snapshot since no cylinder boundary helper exists yet.
cyl12_before = cyl12_after  # no customer cyl ledger entry for sell/buy_iron
cyl48_before = cyl48_after
if txn.order_mode == "replacement":
    qty_12 = txn.buy_12kg or 0
    qty_48 = txn.buy_48kg or 0
    cyl12_before = cyl12_after - qty_12
    cyl48_before = cyl48_after - qty_48
```

**Populate in the return:**

```python
money_balance_before=money_before,
money_balance_after=money_after,
cyl_balance_before={"12kg": cyl12_before, "48kg": cyl48_before},
cyl_balance_after={"12kg": cyl12_after, "48kg": cyl48_after},
```

**Update the 3 call sites in `backend/app/routers/orders.py`:**

```python
# list_orders (return statement in list comprehension)
order_out(row, session)

# create_order
order_out(new_txn, session)

# update_order
order_out(new_txn, session)
```

---

### Change 2 — `frontend/hooks/useOrders.ts`

**Goal:** Fix deduplication so the best row always wins for each public `id`. Use explicit preference logic rather than relying on sort order.

Preference rules (applied in order):
1. Active row beats deleted row
2. Among same deletion state: higher `delivered_at` wins
3. Still tied: higher `created_at` wins (newest write wins)

```typescript
// Before
const deduped = Array.from(new Map(data.map((o) => [o.id, o])).values());

// After
function pickBetter(a: Order, b: Order): Order {
  // Prefer active over deleted
  if (a.is_deleted && !b.is_deleted) return b;
  if (!a.is_deleted && b.is_deleted) return a;
  // Same deletion state: prefer newer effective time
  const aTime = new Date(a.delivered_at).getTime();
  const bTime = new Date(b.delivered_at).getTime();
  if (bTime !== aTime) return bTime > aTime ? b : a;
  // Still tied: prefer newer created_at
  return new Date(b.created_at).getTime() >= new Date(a.created_at).getTime() ? b : a;
}

const byId = new Map<string, Order>();
for (const order of data) {
  const existing = byId.get(order.id);
  byId.set(order.id, existing ? pickBetter(existing, order) : order);
}
const deduped = Array.from(byId.values());
```

---

### Change 3 — `frontend/app/customers/[id].tsx`

**Goal:** Remove the three stale `build*Activity` functions and replace with the shared `*ToEvent` functions from `activityAdapter.ts`. Hide deleted activities.

#### 3a — Switch to non-deleted queries

```typescript
// Before
const { data: orders } = useOrders(true);
const { data: collections } = useCollections(true);

// After
const { data: orders } = useOrders(false);
const { data: collections } = useCollections(false);
```

#### 3b — Remove these entirely

- `CustomerActivityItem` type
- `ActivityKind` type
- `buildOrderActivity` function
- `buildCollectionActivity` function
- `buildAdjustmentActivity` function
- `deletingIds` state and `isDeleted` prop from render loop

#### 3c — Replace activities memo

```typescript
// Before: calls buildOrderActivity / buildCollectionActivity / buildAdjustmentActivity

// After:
import { orderToEvent, collectionToEvent, customerAdjustmentToEvent } from "@/lib/activityAdapter";

const activities = useMemo(() => {
  const orderEvents = (orders ?? []).map((o) => orderToEvent(o));
  const collectionEvents = (collections ?? []).map((c) => collectionToEvent(c));
  const adjustmentEvents = (adjustments ?? []).map((a) => customerAdjustmentToEvent(a));
  return [...orderEvents, ...collectionEvents, ...adjustmentEvents].sort(
    (a, b) =>
      new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime() ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}, [orders, collections, adjustments]);
```

#### 3d — Fix filter tab predicates

Replace any `kind === "..."` checks with `event_type` / `order_mode` checks on `DailyReportEvent`:

| Tab | Predicate |
|-----|-----------|
| replacement | `e.event_type === "order" && e.order_mode === "replacement"` |
| late_payment | `e.event_type === "collection_money"` |
| return_empties | `e.event_type === "collection_empty"` |
| buy_empty | `e.event_type === "order" && e.order_mode === "buy_iron"` |
| sell_full | `e.event_type === "order" && e.order_mode === "sell_iron"` |
| adjustment | `e.event_type === "customer_adjust"` |
| payout | `e.event_type === "collection_payout"` |

#### 3e — Fix system filter

```typescript
// Before: filter by system id
const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
// options: systems.map(s => ({ label: s.name, value: s.id }))
// filter: activity.systemId === selectedSystemId

// After: filter by system name (matches event.system_name from activityAdapter)
const [selectedSystemName, setSelectedSystemName] = useState<string | null>(null);
// options: systems.map(s => ({ label: s.name, value: s.name }))
// filter: event.system_name === selectedSystemName
```

---

### Change 4 — `frontend/lib/activityAdapter.ts`

**Goal:** Fix wrong `money_direction` for `buy_iron` in `orderToEvent`.

For `buy_iron`, `paid_amount` is cash the distributor paid **out** to acquire empty cylinders. The current code treats any positive `paid_amount` as `"in"` for all order modes. Only `buy_iron` is wrong — replacement and sell_iron correctly receive cash inward.

**File:** `frontend/lib/activityAdapter.ts`

```typescript
// Before (line ~217)
money_direction: moneyDelta > 0 ? "in" : null,

// After
money_direction: moneyDelta > 0 ? (mode === "buy_iron" ? "out" : "in") : null,
```

The `money_amount` magnitude is correct as-is. Only the direction needs to change.

---

### Change 5 — `frontend/app/(tabs)/add/index.tsx`

**Goal:** Hide deleted activities on the Add Data page. This page has the same `useOrders(true)` / `useCollections(true)` pattern as the customer review page.

**File:** `frontend/app/(tabs)/add/index.tsx`

```typescript
// Before (lines 235–236)
const ordersQuery = useOrders(true);
const collectionsQuery = useCollections(true);

// After
const ordersQuery = useOrders(false);
const collectionsQuery = useCollections(false);
```

Remove the `isDeleted` props and `deletingIds` tracking for orders and collections from the render loop, since deleted rows will no longer be fetched.

Note: the deduplication fix in Change 2 (`useOrders.ts`) also corrects the edited-order display on this page as a side effect — no additional change needed there.

---

---

## Verification by ticket

### Ticket A — Backend live order balance fields

**Automated:**
```bash
cd backend && pytest tests/backend/test_orders.py -x -q
```

**New pytest cases to add** (`tests/backend/test_live_order_fields.py`):

| Test | What to assert |
|------|----------------|
| Create any order → GET /orders | `money_balance_before`, `money_balance_after`, `cyl_balance_before`, `cyl_balance_after` are all non-null |
| Replacement: create debt, then GET | `money_balance_after` matches live ledger sum for that customer |
| sell_iron: create, then GET | `money_balance_after` correct, `cyl_balance_before == cyl_balance_after` (no cylinder change) |
| buy_iron: create, then GET | `money_balance_after` correct, `cyl_balance_before == cyl_balance_after` |
| Retroactive delete: create order A → create order B → delete A → GET B | `money_balance_after` on B reflects the post-deletion balance, not the stale snapshot |
| Retroactive update: create order A → create order B → edit A → GET B | Same — B's `money_balance_after` recalculates correctly |

---

### Ticket B — Frontend: dedup + buy_iron direction

**Build check:**
```bash
cd frontend && npm run build
```

**New Jest unit tests to add** (`tests/frontend/test/useOrders.dedup.test.ts` and `activityAdapter.test.ts`):

| Test | What to assert |
|------|----------------|
| Dedup: active + deleted share same public id | Active row is returned |
| Dedup: two active rows share public id, different `delivered_at` | Newer `delivered_at` wins |
| Dedup: two active rows share public id, same `delivered_at`, different `created_at` | Newer `created_at` wins |
| `orderToEvent` buy_iron with `paid_amount > 0` | `money_direction === "out"` |
| `orderToEvent` replacement with `paid_amount > 0` | `money_direction === "in"` |
| `orderToEvent` sell_iron with `paid_amount > 0` | `money_direction === "in"` |

**Manual:**
1. Edit an existing order (change price) → customer review and Add Data both show the **updated** price, not the old one
2. Create a buy_iron order → money direction indicator shows **outgoing**

---

### Ticket C — Customer review + Add Data screen refactor

**Build check:**
```bash
cd frontend && npm run build
```

**New Jest unit tests to add** (`tests/frontend/test/customerReview.test.ts`):

| Test | What to assert |
|------|----------------|
| `lastOrder` with mix of active and deleted orders | Returns the most recent **active** order only |
| `lastOrder` when the most recent order is deleted | Falls back to the next older active order |
| `orderCylinders` with deleted replacement in the list | Deleted replacement not counted |
| Activity list sorted with backdated activity | Ordered by `effective_at` first, not `created_at` |

**Manual test matrix:**

| Scenario | Expected |
|----------|----------|
| Open customer with mix of all 5 activity types | All filter tabs show correct subset |
| Select system filter on Replacement tab | Only that system's replacements shown |
| Delete an old replacement → reopen | Deleted card gone, Cylinders Ordered updated, Last Order updated |
| Delete old unpaid replacement, payment still exists → reopen | Payment card shows recalculated balance (credit, not zero) |
| Edit an order (change qty or price) → reopen | Updated values shown, not pre-edit values |
| Edit old order and move its date earlier → reopen | Activity list ordering follows business time, not creation time |
| Delete the customer's most recent order → reopen | Last Order falls back to the next older active order |
| Create buy_iron, then delete it → reopen | It disappears from the list |
| Open Add Data after deleting an activity | Deleted activity not shown on Add Data either |
| Customer with no active orders | Cylinders Ordered shows 0, Last Order shows "No orders yet" |

---

## Acceptance Criteria

- [ ] Customer review page shows correct live balances after any retroactive change (delete or edit)
- [ ] Add Data page shows correct live balances after any retroactive change (delete or edit)
- [ ] Deleted activities are hidden entirely from **both** customer review and Add Data pages
- [ ] Edited orders show their updated values, not pre-edit values, on both pages
- [ ] Buy empty cards show money direction as **out** (cash leaving wallet)
- [ ] System filter on customer review works correctly using system name comparison
- [ ] All filter tabs show the correct subset of activities
- [ ] No TypeScript build errors
- [ ] Backend tests pass
