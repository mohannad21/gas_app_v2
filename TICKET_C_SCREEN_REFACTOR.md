# Ticket C — Frontend: Customer Review + Add Data Screen Refactor

## Branch

Continue on the `money-formatting` branch. Ticket A must be merged first so that
`money_balance_after` is non-null before this ticket's rendering changes go live.

Do not create a new branch.

---

## Scope

**Do not touch any file not listed below.**
**Do not refactor, rename, reformat, or "improve" anything outside the exact changes described.**
**Do not change any styles, colors, layout, or component props not mentioned here.**

Files to change:
- `frontend/app/customers/[id].tsx`
- `frontend/app/(tabs)/add/index.tsx`

Files to add:
- `tests/frontend/test/customerReview.stats.test.ts`

---

## Problems being fixed

1. `buildOrderActivity`, `buildCollectionActivity`, `buildAdjustmentActivity` read frozen
   `debt_cash` snapshots. The shared `*ToEvent` adapters in `activityAdapter.ts` use live
   fields. Customer review must use those adapters exclusively.
2. `useOrders(true)` and `useCollections(true)` include deleted rows. Deleted activities
   must be hidden.
3. Activity list is sorted `createdAt desc` first — should be `effectiveAt desc` first
   (matching the daily report ordering).
4. `lastOrder` and `orderCylinders` do not filter out deleted orders.
5. System filter compares by `system.id` but `orderToEvent` exposes `system_name` — must
   compare by name.
6. Add Data page has the same deleted-row visibility problem.

---

## Change 1 — `frontend/app/customers/[id].tsx`

Apply all sub-changes below in order. Read the current file before making any change.

### 1a. Switch to non-deleted queries (lines 312–315)

```typescript
// Before
const collectionsQuery = useCollections(true);
...
const ordersQuery = useOrders(true);

// After
const collectionsQuery = useCollections(false);
...
const ordersQuery = useOrders(false);
```

### 1b. Remove these items entirely — delete every line that defines them

- `CustomerActivityItem` type definition
- `ActivityKind` type definition
- `buildOrderActivity` function
- `buildCollectionActivity` function
- `buildAdjustmentActivity` function

Do not leave stub comments. Remove the code completely.

### 1c. Remove `deletingIds` state and its helpers for orders

Remove these lines:
```typescript
const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
const markDeleting = (id: string) => ...
const unmarkDeleting = (id: string) => ...
```

Keep `deletingIds` only if it is still used for collections after this refactor.
If it is used for both orders and collections, keep it but remove order-related usages only.

### 1d. Fix `lastOrder` to exclude deleted orders (around line 468)

```typescript
// Before
const lastOrder = orders
  .slice()
  .sort((a, b) => toTimeValue(b.delivered_at) - toTimeValue(a.delivered_at))[0];

// After
const lastOrder = orders
  .filter((o) => !o.is_deleted)
  .sort((a, b) => toTimeValue(b.delivered_at) - toTimeValue(a.delivered_at))[0];
```

### 1e. Fix `orderCylinders` to exclude deleted orders (around line 372)

Inside the `orderCylinders` memo, add a deleted filter before the forEach:

```typescript
// Before
orders.forEach((order) => {

// After
orders.filter((o) => !o.is_deleted).forEach((order) => {
```

### 1f. Replace the `activities` memo

Remove the existing `activities` memo that calls `buildOrderActivity`, `buildCollectionActivity`,
`buildAdjustmentActivity`.

Replace it with this (import `orderToEvent`, `collectionToEvent`, `customerAdjustmentToEvent`
from `@/lib/activityAdapter` — they are already imported at the top of the file):

```typescript
const activities = useMemo((): DailyReportEvent[] => {
  const orderEvents = (orders ?? []).map((o) =>
    orderToEvent(o, {
      customerName: customer?.name,
      customerDescription: customer?.note ?? null,
      systemName: o.system_id ? systemsById.get(o.system_id) : undefined,
    })
  );
  const collectionEvents = (collections ?? []).map((c) =>
    collectionToEvent(c, {
      customerName: customer?.name,
      customerDescription: customer?.note ?? null,
    })
  );
  const adjustmentEvents = (adjustments ?? []).map((a) =>
    customerAdjustmentToEvent(a, {
      customerName: customer?.name,
      customerDescription: customer?.note ?? null,
    })
  );
  return [...orderEvents, ...collectionEvents, ...adjustmentEvents].sort(
    (a, b) =>
      new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime() ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}, [orders, collections, adjustments, customer, systemsById]);
```

Add the `DailyReportEvent` import from `@/types/report` if it is not already imported.

### 1g. Replace `filteredActivities` memo

The existing memo filters by `activity.kind`. Replace it to filter by `event_type` and
`order_mode` on `DailyReportEvent`:

```typescript
const filteredActivities = useMemo(() => {
  let next = activities;
  if (selectedFilter !== "all") {
    next = next.filter((e) => {
      switch (selectedFilter) {
        case "replacement":   return e.event_type === "order" && e.order_mode === "replacement";
        case "late_payment":  return e.event_type === "collection_money";
        case "return_empties":return e.event_type === "collection_empty";
        case "buy_empty":     return e.event_type === "order" && e.order_mode === "buy_iron";
        case "sell_full":     return e.event_type === "order" && e.order_mode === "sell_iron";
        case "adjustment":    return e.event_type === "customer_adjust";
        default:              return true;
      }
    });
  }
  if (selectedFilter === "replacement" && selectedSystemName !== "all") {
    next = next.filter((e) => e.system_name === selectedSystemName);
  }
  return next;
}, [activities, selectedFilter, selectedSystemName]);
```

### 1h. Fix system filter state and options

```typescript
// Before
const [selectedSystemId, setSelectedSystemId] = useState("all");

// After
const [selectedSystemName, setSelectedSystemName] = useState("all");
```

```typescript
// Before
const replacementSystemOptions = useMemo(
  () => [{ id: "all", label: "All systems" }, ...systems.map((s) => ({ id: s.id, label: s.name }))],
  [systems]
);

// After
const replacementSystemOptions = useMemo(
  () => [{ id: "all", label: "All systems" }, ...systems.map((s) => ({ id: s.name, label: s.name }))],
  [systems]
);
```

Update all references from `selectedSystemId` to `selectedSystemName` throughout the file
(there will be 3–4 occurrences: the state setter, the filter reset in `handleFilterPress`,
the filter chip comparison, and the filter predicate — already updated in 1g above).

### 1i. Replace the render loop for activities

The existing render loop looks up raw data by `activity.kind` and calls `*ToEvent` again.
Since `activities` is now already `DailyReportEvent[]`, simplify the render loop to use
the event directly:

```typescript
{!activitiesLoading &&
  !activitiesError &&
  filteredActivities.map((event) => {
    const fmtMoney = (v: number) => Number(v || 0).toFixed(getMoneyDecimals());
    const isOrder = event.event_type === "order";
    const isCollection =
      event.event_type === "collection_money" ||
      event.event_type === "collection_empty" ||
      event.event_type === "collection_payout";

    return (
      <SlimActivityRow
        key={event.id}
        event={event}
        formatMoney={fmtMoney}
        showCreatedAt
        showEffectiveAtBottom
        onEdit={isOrder ? () => router.push(`/orders/${event.id}/edit`) : undefined}
        onDelete={
          isOrder
            ? () => handleDeleteOrder(event.id!)
            : isCollection
            ? () => handleDeleteCollection(event.id!)
            : undefined
        }
      />
    );
  })}
```

### 1j. Remove now-unused variables

After the above changes, remove any variables that are now unused:
- `ordersById` map (if no longer referenced)
- `collectionsById` map (if no longer referenced)

Do not remove any variable that is still referenced elsewhere in the file.

---

## Change 2 — `frontend/app/(tabs)/add/index.tsx`

### 2a. Switch to non-deleted queries (lines 235–236)

```typescript
// Before
const ordersQuery = useOrders(true);
const collectionsQuery = useCollections(true);

// After
const ordersQuery = useOrders(false);
const collectionsQuery = useCollections(false);
```

### 2b. Remove deleted-row rendering for orders and collections

Find every place in the render loop that passes `isDeleted={...is_deleted...}` for an order
or collection and remove the `isDeleted` prop. Example pattern to find and remove:

```typescript
// Remove this prop wherever it appears for orders/collections
isDeleted={order.is_deleted || deletingIds.has(order.id)}
isDeleted={collection.is_deleted || deletingIds.has(collection.id)}
```

Do not remove `isDeleted` from refill or adjustment rows — only orders and collections.

Do not remove the `deletingIds` state itself if it is still used elsewhere in the file.

---

## Change 3 — New test file `tests/frontend/test/customerReview.stats.test.ts`

Write Jest unit tests for the derived stats logic. Test the helper functions or the memo
logic in isolation (extract them if needed — that is the only additional change allowed
in `customers/[id].tsx`).

| Test | Input | Expected |
|------|-------|----------|
| `lastOrder` with mix of active and deleted orders | 3 orders, newest is deleted | Returns second-newest active order |
| `lastOrder` with all deleted orders | 2 deleted orders | Returns `undefined` |
| `orderCylinders` with deleted replacement | 1 active (qty=2) + 1 deleted (qty=3) | Returns `{ "12kg": 2, "48kg": 0 }` |
| `orderCylinders` excludes buy_iron | 1 replacement (qty=2) + 1 buy_iron (qty=5) | buy_iron not counted |
| Activity sort order | backdated event created today + older event created earlier | Backdated event sorted by `effective_at`, not `created_at` |

---

## Verification

```bash
cd frontend
npm run build
npm test -- --testPathPattern="customerReview.stats"
```

**Manual test matrix:**

| Scenario | Expected |
|----------|----------|
| All 5 filter tabs on customer with mixed activities | Each tab shows correct subset |
| System filter on Replacement tab | Only selected system's replacements shown |
| Delete old replacement → reopen customer | Card gone, Cylinders Ordered updated, Last Order updated |
| Delete old unpaid replacement when later payment exists → reopen | Payment card shows recalculated balance |
| Edit an order → reopen | Shows updated values (price, qty), not old values |
| Edit old order and backdate it → reopen | Ordering follows `effective_at`, backdated order appears in correct position |
| Delete the most recent order → reopen | Last Order shows the next older active order |
| Create buy_iron then delete it → reopen | Not in list |
| Open Add Data after deleting any activity | Deleted activity not shown |
| Customer with no active orders | Cylinders Ordered = 0, Last Order = "No orders yet" |

---

## Commit message

```
fix(frontend): use live adapters and hide deleted rows on customer review and add-data

Customer review now uses orderToEvent/collectionToEvent/customerAdjustmentToEvent
exclusively, sorted by effective_at. Deleted activities are hidden. lastOrder and
orderCylinders filter out deleted orders. Add Data applies the same deleted-row rule.
```
