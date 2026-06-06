# Ticket: Fix Activity Card Pills — Currency Symbol, Header Amounts, Float Guard, Company Cylinder Colors, Refill Transitions

## Branch
Stay on the current branch — do NOT create a new branch.

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.

---

## Overview

Four bugs to fix across three files:

1. Card headers show `+250 USD` — should use currency symbol `$` or `₪`, not the code.
2. Daily report collection cards show wrong amount in header (e.g. `+3 USD` instead of `+250 USD`).
3. Near-zero float values (e.g. `0.001`) display as `"credit 0 $"` — should be hidden like true zero.
4. Gaining company cylinder credit (returning empties to supplier) shows orange — should be green.
5. Refill / Buy full / Return empties (company) cards on the add screen show no cylinder balance pills — the adapter doesn't build transitions.

---

## Step 1 — Replace `getCurrencyCode` with `getCurrencySymbol` in `SlimActivityRow.tsx`

**File:** `frontend/components/reports/SlimActivityRow.tsx`

Read the file first.

### 1a — Update the import

Find:
```ts
import { getCurrencyCode } from "@/lib/money";
```

Replace with:
```ts
import { getCurrencySymbol } from "@/lib/money";
```

### 1b — Update the local `formatMoneyValue` helper

Find (around line 23):
```ts
const formatMoneyValue = (amount: number, formatMoney: (v: number) => string) =>
  `${formatMoney(amount)} ${getCurrencyCode()}`;
```

Replace with:
```ts
const formatMoneyValue = (amount: number, formatMoney: (v: number) => string) =>
  `${formatMoney(amount)} ${getCurrencySymbol()}`;
```

**Do not change anything else in this file in this step.**

---

## Step 2 — Fix wrong header amount for collection events in `SlimActivityRow.tsx`

**File:** `frontend/components/reports/SlimActivityRow.tsx` (same file as Step 1 — read once, apply both)

The problem: on the daily report, the server populates `money_delta` with the net wallet impact (a small number like `3`), not the payment amount. But `moneyAmount` (line ~266) prefers `money_delta`, so collection cards show the wrong number in the top-right header.

Find (around line 266):
```ts
  const moneyAmount = typeof event?.money_delta === "number" ? event.money_delta : Number(event?.money_amount ?? 0);
```

Replace with:
```ts
  const moneyAmount =
    (event.event_type === "collection_money" || event.event_type === "collection_payout")
      ? Number(event.money_amount ?? event.money_delta ?? 0)
      : typeof event?.money_delta === "number"
        ? event.money_delta
        : Number(event?.money_amount ?? 0);
```

**Do not change anything else in this file.**

---

## Step 3 — Near-zero float guard in `balanceTransitions.ts`

**File:** `frontend/lib/balanceTransitions.ts`

Read the file first.

### 3a — Epsilon guard in `getCompactDirectionLabel`

Find (around line 121):
```ts
function getCompactDirectionLabel(scope: BalanceScope, component: BalanceComponent, value: number): string {
  if (value === 0) return "";
```

Replace with:
```ts
function getCompactDirectionLabel(scope: BalanceScope, component: BalanceComponent, value: number): string {
  if (Math.abs(value) < 0.01) return "";
```

### 3b — Epsilon guard in `formatTransitionRow`

Find (around line 149):
```ts
  if (before === 0 && after === 0) return null;
```

Replace with:
```ts
  if (Math.abs(before) < 0.01 && Math.abs(after) < 0.01) return null;
```

Also find the unchanged check a few lines below:
```ts
  if (before === after) {
```

Replace with:
```ts
  if (Math.abs(before - after) < 0.01) {
```

**Do not change anything else in this file in this step.**

---

## Step 4 — Fix color logic for company cylinder credit in `balanceTransitions.ts`

**File:** `frontend/lib/balanceTransitions.ts` (same file as Step 3 — read once, apply both)

The problem: `formatTransitionPills` uses `abs(after) < abs(before)` to decide "good" (green). This is correct for debts (smaller absolute value = less debt = better). But for company cylinders, positive values mean **credit** (the company owes you). Gaining credit means the value goes from 0 toward positive — abs grows — so it shows orange. But it should be green.

Rule for company cylinders:
- More positive = more credit (good)
- More negative = more debt (bad)
- So `after > before` = good

Find the `formatTransitionPills` function. Inside the `for` loop, find the intent computation:

```ts
    let intent: TransitionPillIntent;
    if (before === after) {
      intent = "neutral";
    } else if (after < before) {
      intent = "good";
    } else {
      intent = "bad";
    }
```

Replace with:

```ts
    let intent: TransitionPillIntent;
    const beforeAbs = Math.abs(Number(transition.before ?? 0));
    const afterAbs = Math.abs(Number(transition.after ?? 0));
    if (Math.abs(beforeAbs - afterAbs) < 0.01) {
      intent = "neutral";
    } else if (transition.scope === "company" && (transition.component === "cyl_12" || transition.component === "cyl_48")) {
      // For company cylinders: positive = credit. More credit = good, more debt = bad.
      intent = after > before ? "good" : "bad";
    } else {
      // For customer balances and company money: smaller absolute value = closer to zero = good.
      intent = afterAbs < beforeAbs ? "good" : "bad";
    }
```

**Do not change anything else in this file.**

---

## Step 5 — Add company cylinder transitions to `refillSummaryToEvent` in `activityAdapter.ts`

**File:** `frontend/lib/activityAdapter.ts`

Read the file first.

The problem: `refillSummaryToEvent` returns an event with no `balance_transitions`. So refill/company_buy_iron/company_return_empties cards on the add screen show no balance pills. The `InventoryRefillSummary` object has `debt_cylinders_12`, `debt_cylinders_48` (the after-values) and `buy12`, `return12`, `buy48`, `return48` (what changed), so we can compute before-values.

Formula (verified against real data):
- `cyl12Before = debt_cylinders_12 - return12 + buy12`
- `cyl48Before = debt_cylinders_48 - return48 + buy48`

(`buy` increases debt/reduces credit; `return` reduces debt/increases credit)

Find `refillSummaryToEvent` (around line 289). Find the `return` statement which starts with `return {`:

```ts
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
    counterparty: { type: "company", display_name: "Company", description: null, display: null },
  };
```

Replace with:

```ts
  const cyl12After = Number(refill.debt_cylinders_12 ?? 0);
  const cyl48After = Number(refill.debt_cylinders_48 ?? 0);
  const cyl12Before = cyl12After - totals.return12 + totals.buy12;
  const cyl48Before = cyl48After - totals.return48 + totals.buy48;

  const transitions: NonNullable<DailyReportV2Event["balance_transitions"]> = [];
  pushTransition(transitions, "company", "cyl_12", cyl12Before, cyl12After);
  pushTransition(transitions, "company", "cyl_48", cyl48Before, cyl48After);

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

**Do not change anything else in this file.**

---

## Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Manual checks:

1. **Card headers** — all amounts show `$` or `₪`, NOT `USD` (e.g. `+250 $`)
2. **Collection header** — "Received payment 250" card shows `+250 $` in top right, not `+3 $`
3. **"credit 0 $" gone** — no pill shows a direction label next to a zero value
4. **Returning empties to company** — `12kg balance: 0 → 10 credit (on distributor)` shows **green**
5. **Refill / Buy full / Return empties on add screen** — cylinder balance pills now appear showing before → after (or "unchanged") for 12kg and 48kg
