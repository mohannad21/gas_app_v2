# Ticket B — Frontend: Dedup Fix + Buy Iron Money Direction

## Branch

Continue on the `money-formatting` branch created in Ticket A.
Do not create a new branch.

---

## Scope

**Do not touch any file not listed below.**
**Do not refactor, rename, reformat, or "improve" anything outside the exact lines described.**

Files to change:
- `frontend/hooks/useOrders.ts`
- `frontend/lib/activityAdapter.ts`

Files to add:
- `tests/frontend/test/useOrders.dedup.test.ts`
- `tests/frontend/test/activityAdapter.buysell.test.ts`

---

## Problem 1 — `useOrders` deduplication picks the wrong row for edited orders

`frontend/hooks/useOrders.ts` line 24:

```typescript
const deduped = Array.from(new Map(data.map((o) => [o.id, o])).values());
```

When `include_deleted=true`, the backend returns multiple rows sharing the same public `id`
(the group_id) for an edited order. The last entry in the array wins the Map overwrite.
Because the backend sorts descending by `(happened_at, created_at, id)`, the original deleted
row can end up winning over the active updated row.

## Problem 2 — `orderToEvent` treats buy_iron cash as incoming

`frontend/lib/activityAdapter.ts` line ~217:

```typescript
money_direction: moneyDelta > 0 ? "in" : null,
```

For `buy_iron`, `paid_amount` is cash paid **out** of the wallet to acquire empty cylinders.
The direction should be `"out"`. Replacement and sell_iron are correct as-is.

---

## Change 1 — `frontend/hooks/useOrders.ts`

Replace the single dedup line with an explicit winner-selection function.
Add the `pickBetter` helper immediately before the `useOrders` function.
Replace only the dedup line inside `useOrders`.

```typescript
// Add this helper before the useOrders function
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
```

```typescript
// Inside useOrders, replace:
const deduped = Array.from(new Map(data.map((o) => [o.id, o])).values());

// With:
const byId = new Map<string, Order>();
for (const order of data) {
  const existing = byId.get(order.id);
  byId.set(order.id, existing ? pickBetter(existing, order) : order);
}
const deduped = Array.from(byId.values());
```

Do not change anything else in this file.

---

## Change 2 — `frontend/lib/activityAdapter.ts`

Inside `orderToEvent`, find this line (currently around line 217):

```typescript
money_direction: moneyDelta > 0 ? "in" : null,
```

Replace it with:

```typescript
money_direction: moneyDelta > 0 ? (mode === "buy_iron" ? "out" : "in") : null,
```

Do not change any other line in this file.

---

## Change 3 — New test file `tests/frontend/test/useOrders.dedup.test.ts`

Write Jest unit tests for the `pickBetter` function. Import it from `useOrders.ts`
(export it if needed — that is the only additional change allowed in useOrders.ts).

| Test | Input | Expected winner |
|------|-------|----------------|
| Active vs deleted, same id | active row + deleted row | active row |
| Both active, different `delivered_at` | older + newer | newer `delivered_at` |
| Both active, same `delivered_at`, different `created_at` | older + newer | newer `created_at` |
| Both deleted, different `delivered_at` | older + newer | newer `delivered_at` |

---

## Change 4 — New test file `tests/frontend/test/activityAdapter.buysell.test.ts`

Write Jest unit tests for `orderToEvent` money direction.

| Test | `order_mode` | `paid_amount` | Expected `money_direction` |
|------|-------------|--------------|---------------------------|
| buy_iron with payment | `"buy_iron"` | `5` | `"out"` |
| replacement with payment | `"replacement"` | `100` | `"in"` |
| sell_iron with payment | `"sell_iron"` | `50` | `"in"` |
| any mode, no payment | any | `0` | `null` |

---

## Verification

```bash
cd frontend
npm run build
npm test -- --testPathPattern="useOrders.dedup|activityAdapter.buysell"
```

All must pass with 0 TypeScript errors before moving to Ticket C.

**Manual checks:**
1. Edit an existing order (change price or qty) → customer review and Add Data both show the **updated** values, not the original
2. Create a buy_iron order → the money indicator on the card shows **outgoing** direction, not incoming

---

## Commit message

```
fix(frontend): fix order dedup winner logic and buy_iron money direction

useOrders now uses explicit pickBetter() to ensure active rows always win
over deleted rows when deduplicating by public id. orderToEvent now sets
money_direction "out" for buy_iron mode.
```
