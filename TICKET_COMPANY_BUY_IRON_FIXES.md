# Ticket: Company Buy-Iron Consistency Fixes

## Branch
Stay on the current branch — do NOT create a new branch.

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.
- Run `cd backend && python -c "from app.routers.reports import router; from app.routers.inventory import router as r2; print('OK')"` to confirm no import errors.

---

## Background

The company `buy_iron` transaction stores quantities in `new12` / `new48` columns of `CompanyTransaction`.
The daily report builder in `reports.py` maps company transactions to events using `txn.buy12` / `txn.buy48`
instead — which are always `0` for `kind="buy_iron"`. This makes the daily report card show no quantities.

The `/inventory/refills` list endpoint only returns `kind="refill"` rows, so `buy_iron` transactions
are invisible on the add screen after creation.

Five concrete fixes in this ticket — all scoped and safe.

---

## Step 1 — Fix daily report: read `new12/new48` for `buy_iron` events

**File:** `backend/app/routers/reports.py`

Read the file first.

Find the company transaction mapping loop (around line 482). The block that creates each company event
currently looks like this:

```python
  for txn in company_txns:
    event = DailyReportV2Event(
      id=txn.id,
      source_id=txn.id,
      event_type="refill" if txn.kind == "refill" else "company_buy_iron" if txn.kind == "buy_iron" else "company_payment" if txn.kind == "payment" else "company_adjustment" if txn.kind == "adjust" else txn.kind,
      effective_at=txn.happened_at,
      created_at=txn.created_at,
      reason=txn.note,
      buy12=txn.buy12,
      return12=txn.return12,
      buy48=txn.buy48,
      return48=txn.return48,
      total_cost=txn.total,
      paid_now=txn.paid,
    )
```

Replace `buy12=txn.buy12` and `buy48=txn.buy48` with values that use `new12`/`new48` when the kind is `buy_iron`:

```python
  for txn in company_txns:
    event = DailyReportV2Event(
      id=txn.id,
      source_id=txn.id,
      event_type="refill" if txn.kind == "refill" else "company_buy_iron" if txn.kind == "buy_iron" else "company_payment" if txn.kind == "payment" else "company_adjustment" if txn.kind == "adjust" else txn.kind,
      effective_at=txn.happened_at,
      created_at=txn.created_at,
      reason=txn.note,
      buy12=txn.new12 if txn.kind == "buy_iron" else txn.buy12,
      return12=txn.return12,
      buy48=txn.new48 if txn.kind == "buy_iron" else txn.buy48,
      return48=txn.return48,
      total_cost=txn.total,
      paid_now=txn.paid,
    )
```

**Do not change anything else in this file.**

---

## Step 2 — Include `buy_iron` rows in the refills list endpoint

**File:** `backend/app/routers/inventory.py`

Read the file first.

Find `list_refills` (around line 379). The query currently filters for `kind == "refill"` only:

```python
  stmt = (
    select(CompanyTransaction)
    .where(CompanyTransaction.kind == "refill")
    .where(CompanyTransaction.tenant_id == tenant_id)
  )
```

Replace with:

```python
  stmt = (
    select(CompanyTransaction)
    .where(CompanyTransaction.kind.in_(["refill", "buy_iron"]))
    .where(CompanyTransaction.tenant_id == tenant_id)
  )
```

Then find the `InventoryRefillSummary` construction inside the same function. It currently starts with:

```python
  return [
    InventoryRefillSummary(
      refill_id=row.id,
      date=row.day.isoformat(),
      time_of_day=time_of_day(row.happened_at),
      effective_at=row.happened_at,
      buy12=row.buy12,
      return12=row.return12,
      buy48=row.buy48,
      return48=row.return48,
      new12=row.new12,
      new48=row.new48,
```

Replace `buy12=row.buy12` and `buy48=row.buy48` with values that normalise buy_iron rows:

```python
  return [
    InventoryRefillSummary(
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
```

**Do not change anything else in this file.**

---

## Step 3 — Fix `getCompanyInventoryTotals` double-counting in `activityAdapter.ts`

**File:** `frontend/lib/activityAdapter.ts`

Read the file first.

Find `getCompanyInventoryTotals` (around line 39):

```ts
export function getCompanyInventoryTotals(refill: InventoryRefillSummary) {
  return {
    buy12: Number(refill.buy12 ?? 0) + Number(refill.new12 ?? 0),
    buy48: Number(refill.buy48 ?? 0) + Number(refill.new48 ?? 0),
    return12: Number(refill.return12 ?? 0),
    return48: Number(refill.return48 ?? 0),
  };
}
```

After Step 2, `buy12` and `buy48` already contain the correct normalised values for both `refill`
and `buy_iron` rows. Summing with `new12`/`new48` would double-count. Remove the `+ new12/new48` addition:

```ts
export function getCompanyInventoryTotals(refill: InventoryRefillSummary) {
  return {
    buy12: Number(refill.buy12 ?? 0),
    buy48: Number(refill.buy48 ?? 0),
    return12: Number(refill.return12 ?? 0),
    return48: Number(refill.return48 ?? 0),
  };
}
```

**Do not change anything else in this file.**

---

## Step 4 — Remove placeholder fallbacks for orders and collections in the customer detail screen

**File:** `frontend/app/customers/[id].tsx`

Read the file first.

### 4a — Collections fallback

Find the block that renders collection activities (around line 772). It currently falls back to a
synthetic inline event when `rawCol` is not found:

```tsx
          if (activity.kind === "late_payment" || activity.kind === "return_empties" || activity.kind === "payout") {
            const rawCol = collections.find((c) => `collection-${c.id}` === activity.id);
            return (
              <SlimActivityRow
                key={activity.id}
                event={rawCol
                  ? collectionToEvent(rawCol, { customerName, customerDescription })
                  : {
                      cash_before: 0,
                      cash_after: 0,
                      event_type: activity.kind === "late_payment" ? "collection_money" : activity.kind === "payout" ? "collection_payout" : "collection_empty",
                      id: activity.id,
                      effective_at: activity.effectiveAt,
                      created_at: activity.createdAt ?? activity.effectiveAt,
                      context_line: activity.title,
                      display_name: customerName,
                      hero_text: activity.summary,
                      note: activity.note ?? null,
                      label: activity.title,
                    }
                }
                formatMoney={fmtMoney}
                showCreatedAt
                showEffectiveAtBottom
                onEdit={rawCol ? () => {
                  /* collections edit not yet supported via dedicated screen */
                } : undefined}
                isDeleted={rawCol ? (rawCol.is_deleted || deletingIds.has(rawCol.id)) : false}
                onDelete={rawCol ? () => handleDeleteCollection(rawCol.id) : undefined}
              />
            );
          }
```

Replace with a version that returns `null` when `rawCol` is missing instead of fabricating a blank event:

```tsx
          if (activity.kind === "late_payment" || activity.kind === "return_empties" || activity.kind === "payout") {
            const rawCol = collections.find((c) => `collection-${c.id}` === activity.id);
            if (!rawCol) return null;
            return (
              <SlimActivityRow
                key={activity.id}
                event={collectionToEvent(rawCol, { customerName, customerDescription })}
                formatMoney={fmtMoney}
                showCreatedAt
                showEffectiveAtBottom
                onEdit={undefined}
                isDeleted={rawCol.is_deleted || deletingIds.has(rawCol.id)}
                onDelete={() => handleDeleteCollection(rawCol.id)}
              />
            );
          }
```

### 4b — Orders fallback

Find the block that renders order activities immediately after the collections block (around line 805).
It currently falls back to a synthetic inline event when `rawOrder` is not found:

```tsx
          const rawOrder = activity.orderId ? ordersById.get(activity.orderId) : undefined;
          return (
            <SlimActivityRow
              key={activity.id}
              isDeleted={rawOrder ? (rawOrder.is_deleted || deletingIds.has(rawOrder.id)) : (activity.orderId ? deletingIds.has(activity.orderId) : false)}
                event={rawOrder
                  ? orderToEvent(rawOrder, {
                    customerName,
                    customerDescription,
                    systemName: rawOrder.system_id ? systemsById.get(rawOrder.system_id) : undefined,
                  })
                : {
                    cash_before: 0,
                    cash_after: 0,
                    event_type: "order",
                    id: activity.id,
                    effective_at: activity.effectiveAt,
                    created_at: activity.createdAt ?? activity.effectiveAt,
                    context_line: "Order",
                    display_name: customerName,
                    hero_text: activity.summary,
                    note: activity.note ?? null,
                    label: activity.title,
                  }
              }
              formatMoney={fmtMoney}
              showCreatedAt
              showEffectiveAtBottom
              onEdit={activity.orderId ? () => router.push(`/orders/${activity.orderId}/edit`) : undefined}
              onDelete={activity.orderId ? () => handleDeleteOrder(activity.orderId!) : undefined}
            />
          );
```

Replace with a version that returns `null` when `rawOrder` is missing:

```tsx
          const rawOrder = activity.orderId ? ordersById.get(activity.orderId) : undefined;
          if (!rawOrder) return null;
          return (
            <SlimActivityRow
              key={activity.id}
              isDeleted={rawOrder.is_deleted || deletingIds.has(rawOrder.id)}
              event={orderToEvent(rawOrder, {
                customerName,
                customerDescription,
                systemName: rawOrder.system_id ? systemsById.get(rawOrder.system_id) : undefined,
              })}
              formatMoney={fmtMoney}
              showCreatedAt
              showEffectiveAtBottom
              onEdit={activity.orderId ? () => router.push(`/orders/${activity.orderId}/edit`) : undefined}
              onDelete={activity.orderId ? () => handleDeleteOrder(activity.orderId!) : undefined}
            />
          );
```

**Do not change anything else in this file.**

---

## Step 5 — Remove phantom fields from frontend type schemas

### 5a — `InventoryRefillDetailsSchema` in `frontend/types/inventory.ts`

**File:** `frontend/types/inventory.ts`

Read the file first.

Find `InventoryRefillDetailsSchema`. Remove these four lines from the schema object:

```ts
  paid_buy12: z.number().optional(),
  paid_buy48: z.number().optional(),
  unit_price_buy_12: z.number().nullish(),
  unit_price_buy_48: z.number().nullish(),
```

Also remove the matching fields from the `updateInventoryRefill` payload type in
`frontend/lib/api/inventory.ts`:

```ts
    paid_buy12?: number;
    paid_buy48?: number;
```

(Both occurrences — in `createInventoryRefill` around line 47 and `updateInventoryRefill` around line 114.)

These fields are never sent by the backend. They are dead schema weight. Removing them causes
TypeScript to error if any callsite is actually using them; if the build passes after removal
they were unused.

### 5b — `DailyReportV2EventSchema` in `frontend/types/report.ts`

**File:** `frontend/types/report.ts`

Read the file first.

Find `DailyReportV2EventSchema`. Remove these four lines:

```ts
  paid_buy12: z.number().nullish(),
  paid_buy48: z.number().nullish(),
  unit_price_buy_12: z.number().nullish(),
  unit_price_buy_48: z.number().nullish(),
```

Same reasoning — the backend report API never populates these fields.

**Do not change anything else in these files.**

---

## Verification

### Backend
```bash
cd backend && python -c "from app.routers.reports import router; from app.routers.inventory import router as r2; print('OK')"
```
Expected: `OK`.

### Frontend
```bash
cd frontend && npm run build
```
Expected: 0 TypeScript errors.

### Manual checks

1. **Daily report — buy full** — create a "buy full from company" (e.g. 3x 12kg). Open the daily
   report for that day. The card now shows `Bought: 3x 12kg` instead of a blank.

2. **Add screen — buy full** — after saving a "buy full", switch to the company activity list on
   the add screen. The buy-full card now appears (previously it was invisible).

3. **Add screen — quantities not doubled** — a refill that buys 2x 12kg should show `Bought: 2x 12kg`,
   not `Bought: 4x 12kg`. Confirm no doubling.

4. **Customer detail — no blank cards** — open any customer that has orders and collections.
   Every card should render with full before→after pills. No blank pill rows.
   If a collection or order is not yet in the local cache it simply does not render (no placeholder).
