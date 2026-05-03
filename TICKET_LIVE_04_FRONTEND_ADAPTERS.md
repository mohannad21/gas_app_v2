# Ticket 4 — Frontend: switch adapters to live balance fields

## Branch
Continue on `feat/live-ledger-display`.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **Do not improvise.** If anything is unclear or not covered by this ticket, stop and ask.
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.

---

## Background

Tickets 2 and 3 added `live_debt_cash`, `live_debt_cylinders_12`, `live_debt_cylinders_48` optional fields to the backend responses for:
- `CustomerAdjustmentOut` (customer adjustments)
- `CollectionEvent` (collections)
- `InventoryRefillSummary` (refills and buy_iron)
- `CompanyPaymentOut` (company payments)

Ticket 1 added the explicit `kind` field to `InventoryRefillSummary`.

This ticket updates the frontend types to include these new fields and updates the adapters in `activityAdapter.ts` to prefer live values over stale stored values.

**Prerequisite**: Tickets 1, 2, and 3 must be complete before this ticket.

---

## Step 1 — Update frontend Zod schemas

Read each file before modifying. These schemas use `.passthrough()` so unknown fields already flow through, but add explicit fields for type safety.

### 1a. `frontend/types/inventory.ts` — `InventoryRefillSummarySchema`

Add three optional fields at the end of the `.object({...})` block, before `.passthrough()`:
```ts
    live_debt_cash: z.number().optional(),
    live_debt_cylinders_12: z.number().optional(),
    live_debt_cylinders_48: z.number().optional(),
```
(`kind` was already added in Ticket 1.)

### 1b. `frontend/types/customer.ts` — `CustomerAdjustmentSchema`

Add three optional fields at the end of the `.object({...})` block, before `.passthrough()`:
```ts
    live_debt_cash: z.number().optional(),
    live_debt_cylinders_12: z.number().optional(),
    live_debt_cylinders_48: z.number().optional(),
```

### 1c. `frontend/types/order.ts` — `CollectionEventSchema`

Add three optional fields at the end of the `.object({...})` block, before `.passthrough()`:
```ts
    live_debt_cash: z.number().optional(),
    live_debt_cylinders_12: z.number().optional(),
    live_debt_cylinders_48: z.number().optional(),
```

### 1d. `frontend/types/transaction.ts` — `CompanyPaymentSchema`

Add one optional field at the end of the `.object({...})` block, before the closing `}`:
```ts
    live_debt_cash: z.number().optional(),
```

---

## Step 2 — Update `activityAdapter.ts`

**File:** `frontend/lib/activityAdapter.ts`

Read the file first.

### 2a. Fix `refillSummaryToEvent` — suppress false buy_iron cylinder pills, use live values for real refills

Find the section in `refillSummaryToEvent` that computes cylinder transitions. It currently looks like:

```ts
  const cyl12After = Number(refill.debt_cylinders_12 ?? 0);
  const cyl48After = Number(refill.debt_cylinders_48 ?? 0);
  const cyl12Before = cyl12After - totals.return12 + totals.buy12;
  const cyl48Before = cyl48After - totals.return48 + totals.buy48;

  const transitions: NonNullable<DailyReportV2Event["balance_transitions"]> = [];
  pushTransition(transitions, "company", "cyl_12", cyl12Before, cyl12After);
  pushTransition(transitions, "company", "cyl_48", cyl48Before, cyl48After);
```

Also find the return statement that references `company_12kg_before`, `company_12kg_after`, `company_48kg_before`, `company_48kg_after`.

Replace the transitions section AND the return statement with:

```ts
  const transitions: NonNullable<DailyReportV2Event["balance_transitions"]> = [];
  let cyl12Before = 0;
  let cyl12After = 0;
  let cyl48Before = 0;
  let cyl48After = 0;

  if (eventType !== "company_buy_iron") {
    cyl12After =
      refill.live_debt_cylinders_12 != null
        ? refill.live_debt_cylinders_12
        : Number(refill.debt_cylinders_12 ?? 0);
    cyl48After =
      refill.live_debt_cylinders_48 != null
        ? refill.live_debt_cylinders_48
        : Number(refill.debt_cylinders_48 ?? 0);
    cyl12Before = cyl12After - totals.return12 + totals.buy12;
    cyl48Before = cyl48After - totals.return48 + totals.buy48;
    pushTransition(transitions, "company", "cyl_12", cyl12Before, cyl12After);
    pushTransition(transitions, "company", "cyl_48", cyl48Before, cyl48After);
  }

  return {
    ...BASE,
    event_type: eventType,
    id: refill.refill_id,
    effective_at: refill.effective_at,
    created_at: refill.effective_at,
    context_line: contextLine,
    label: contextLine,
    hero_text: parts.length > 0 ? parts.join(" | ") : null,
    buy12: totals.buy12,
    return12: totals.return12,
    buy48: totals.buy48,
    return48: totals.return48,
    balance_transitions: transitions.length > 0 ? transitions : undefined,
    company_12kg_before: cyl12Before,
    company_12kg_after: cyl12After,
    company_48kg_before: cyl48Before,
    company_48kg_after: cyl48After,
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
  };
```

**Why**: `eventType` is computed by `getCompanyInventoryEventType` earlier in the function (already updated in Ticket 1 to use the authoritative backend `kind` field). If `eventType === "company_buy_iron"`, the buy_iron row never changes company cylinder debts (confirmed in `posting.py`) so no cylinder transition pill should be shown. For real refills, use `live_debt_cylinders_*` when available (accurate even after history edits), falling back to stored values.

### 2b. Fix `customerAdjustmentToEvent` — use live values

Find these three lines in `customerAdjustmentToEvent`:
```ts
  const moneyAfter = Number(adj.debt_cash ?? 0);
  const cyl12After = Number(adj.debt_cylinders_12 ?? 0);
  const cyl48After = Number(adj.debt_cylinders_48 ?? 0);
```

Replace with:
```ts
  const moneyAfter =
    adj.live_debt_cash != null ? adj.live_debt_cash : Number(adj.debt_cash ?? 0);
  const cyl12After =
    adj.live_debt_cylinders_12 != null
      ? adj.live_debt_cylinders_12
      : Number(adj.debt_cylinders_12 ?? 0);
  const cyl48After =
    adj.live_debt_cylinders_48 != null
      ? adj.live_debt_cylinders_48
      : Number(adj.debt_cylinders_48 ?? 0);
```

### 2c. Fix `collectionToEvent` — use live values

Find these three lines in `collectionToEvent`:
```ts
  const moneyAfter = Number(col.debt_cash ?? 0);
  const cyl12After = Number(col.debt_cylinders_12 ?? 0);
  const cyl48After = Number(col.debt_cylinders_48 ?? 0);
```

Replace with:
```ts
  const moneyAfter =
    col.live_debt_cash != null ? col.live_debt_cash : Number(col.debt_cash ?? 0);
  const cyl12After =
    col.live_debt_cylinders_12 != null
      ? col.live_debt_cylinders_12
      : Number(col.debt_cylinders_12 ?? 0);
  const cyl48After =
    col.live_debt_cylinders_48 != null
      ? col.live_debt_cylinders_48
      : Number(col.debt_cylinders_48 ?? 0);
```

### 2d. Fix `companyPaymentToEvent` — add live company money pills

The current function returns no balance pills. Add them when live data is available.

Find the entire `companyPaymentToEvent` function:
```ts
export function companyPaymentToEvent(payment: CompanyPayment): DailyReportV2Event {
  const amount = payment.amount ?? 0;
  return {
    ...BASE,
    event_type: "company_payment",
    id: payment.id,
    effective_at: payment.happened_at,
    created_at: payment.happened_at,
    context_line: "Company Payment",
    label: "Company Payment",
    money_amount: Math.abs(amount),
    money_direction: amount >= 0 ? "out" : "in",
    money_delta: Math.abs(amount),
    hero_text: amount !== 0 ? `Amount ${Math.abs(amount).toFixed(0)}` : null,
    note: payment.note ?? null,
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
  };
}
```

Replace with:
```ts
export function companyPaymentToEvent(payment: CompanyPayment): DailyReportV2Event {
  const amount = payment.amount ?? 0;
  const transitions: NonNullable<DailyReportV2Event["balance_transitions"]> = [];
  let companyMoneyBefore: number | null = null;
  let companyMoneyAfter: number | null = null;

  if (payment.live_debt_cash != null) {
    companyMoneyAfter = payment.live_debt_cash;
    // A payment reduces our debt to the company (amount >= 0 means we paid them)
    companyMoneyBefore = companyMoneyAfter + amount;
    pushTransition(transitions, "company", "money", companyMoneyBefore, companyMoneyAfter);
  }

  return {
    ...BASE,
    event_type: "company_payment",
    id: payment.id,
    effective_at: payment.happened_at,
    created_at: payment.happened_at,
    context_line: "Company Payment",
    label: "Company Payment",
    money_amount: Math.abs(amount),
    money_direction: amount >= 0 ? "out" : "in",
    money_delta: Math.abs(amount),
    hero_text: amount !== 0 ? `Amount ${Math.abs(amount).toFixed(0)}` : null,
    note: payment.note ?? null,
    company_before: companyMoneyBefore ?? undefined,
    company_after: companyMoneyAfter ?? undefined,
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
    balance_transitions: transitions.length > 0 ? transitions : undefined,
  };
}
```

Note: `pushTransition` is already defined earlier in this file. Do not add an import for it.

---

## Verification

### Frontend build
```bash
cd frontend && npm run build
```
Expected: 0 TypeScript errors.

### Manual checks
1. **Buy Full From Company card** — Expand one. No company cylinder debt pill should appear. (If the backend already returns `live_debt_*` from Tickets 2–3, this will be fully live. If not deployed yet, at minimum the false pill from quantity-guessing is gone because `kind="buy_iron"` is now used.)
2. **Refill card** — Expand one. Cylinder debt pill shows correct before → after.
3. **Customer Adjustment card** — Expand one. Money pill shows correct before → after.
4. **Collection card** — Expand one. Money (and cylinder if return) pill is correct.
5. **Company Payment card** — Expand one. A company money before → after pill now appears.
