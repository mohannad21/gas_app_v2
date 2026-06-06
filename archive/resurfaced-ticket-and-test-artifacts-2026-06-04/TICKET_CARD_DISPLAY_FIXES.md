# Ticket: Activity Card Display Fixes — Buy Full Summary, Buy Empty Color, Scope Label, Ratio Header

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

Four fixes across two files:

1. "Buy full from company" card shows no cylinder summary — add `Bought: 2x 12kg | 3x 48kg` below "Company".
2. "Buy empty from customer" hero text is muted/gray — make it black.
3. Balance pill scope labels: "credit" state must say "for customer" / "for distributor", not "on customer" / "on distributor".
4. "Buy full from company" card shows only paid amount — add the `-paid/total` ratio like refill and order cards.

---

## Step 1 — Show cylinder summary on "Buy full from company" card

**File:** `frontend/components/reports/SlimActivityRow.tsx`

Read the file first.

Find `buildHeroAction`. Inside it, the first two explicit handlers are `order` and `refill`. Below them, the function falls through to `hero_primary` / `hero_text` before reaching the `company_buy_iron` check:

```ts
  if (event.hero_primary) return event.hero_primary;
  if (event.hero_text) return event.hero_text;
  if (event.event_type === "company_buy_iron") {
    return `Bought: ${formatGasSummary(event.buy12, event.buy48)}`;
  }
```

Because the adapter sets `hero_text` on `company_buy_iron` events, the explicit check at the bottom never runs.

Move the `company_buy_iron` handler **before** the `hero_primary` / `hero_text` fallback, following the same pattern as `order` and `refill`. The result should look like:

```ts
  if (event.event_type === "order") {
    return formatOrderMetric(event);
  }
  if (event.event_type === "refill") {
    ...
  }
  if (event.event_type === "company_buy_iron") {
    const parts: string[] = [];
    if (event.buy12 && event.buy12 !== 0) parts.push(`${event.buy12}x 12kg`);
    if (event.buy48 && event.buy48 !== 0) parts.push(`${event.buy48}x 48kg`);
    return parts.length > 0 ? `Bought: ${parts.join(" | ")}` : null;
  }
  if (event.hero_primary) return event.hero_primary;
  if (event.hero_text) return event.hero_text;
```

Note: do NOT remove the `company_buy_iron` check that remains lower in the function (after `hero_text`) — just leave it; it will never be reached but removing it is out of scope.

**Do not change anything else in this file in this step.**

---

## Step 2 — Fix "Buy empty from customer" hero text color

**File:** `frontend/components/reports/SlimActivityRow.tsx` (same file — read once, apply both)

For a `buy_iron` order, `formatOrderMetric` returns `"Received: 3x 12kg"`. This line is rendered in the `heroLines` block. Inside that block there is a condition:

```ts
const isReplacementReceivedLine = event.event_type === "order" && line.startsWith("Received:");
```

This is true for buy_iron orders, which causes the line to use the muted `heroTextLabel` style (gray/small). For buy_iron, the "Received:" line is the primary action — it should render in the normal `heroText` style (black).

Find this condition and add `event.order_mode === "replacement"` to restrict it to replacement orders only:

```ts
const isReplacementReceivedLine = event.event_type === "order" && event.order_mode === "replacement" && line.startsWith("Received:");
```

**Do not change anything else in this file.**

---

## Step 3 — Fix scope label: "for customer" when credit, "on customer" when debts

**File:** `frontend/lib/balanceTransitions.ts`

Read the file first.

Find `getScopeLabel` (around line 132):

```ts
function getScopeLabel(scope: BalanceScope): string {
  return scope === "customer" ? "(on customer)" : "(on distributor)";
}
```

Replace with:

```ts
function getScopeLabel(scope: BalanceScope, component: BalanceComponent, afterValue: number): string {
  const dir = getCompactDirectionLabel(scope, component, afterValue);
  const preposition = dir === "credit" ? "for" : "on";
  const entity = scope === "customer" ? "customer" : "distributor";
  return `(${preposition} ${entity})`;
}
```

Rule:
- If the after-state direction is "credit" → use "for" (e.g. "for customer", "for distributor")
- Otherwise (debt or zero) → use "on" (e.g. "on customer", "on distributor")

Now find `formatTransitionRow`. Inside it, find the single call to `getScopeLabel`:

```ts
  const scope = getScopeLabel(transition.scope);
```

Replace with:

```ts
  const scope = getScopeLabel(transition.scope, transition.component, after);
```

**Do not change anything else in this file.**

---

## Step 4 — Show paid/total ratio on "Buy full from company" card

**File:** `frontend/components/reports/SlimActivityRow.tsx` (same file — read once, apply all steps)

The report API returns `total_cost` and `paid_now` on `company_buy_iron` events. The card currently ignores them.

### 4a — paymentAmount

Find:
```ts
  const paymentAmount =
    event.event_type === "refill"
      ? Number(event.paid_now ?? 0)
      : Number(event.money_amount ?? event.money_received ?? event.money?.amount ?? 0);
```

Replace with:
```ts
  const paymentAmount =
    (event.event_type === "refill" || event.event_type === "company_buy_iron")
      ? Number(event.paid_now ?? 0)
      : Number(event.money_amount ?? event.money_received ?? event.money?.amount ?? 0);
```

### 4b — paymentTotal

Find:
```ts
  const paymentTotal =
    event.event_type === "refill"
      ? Number(event.total_cost ?? 0)
      : event.event_type === "order"
        ? Number(event.order_total ?? 0)
        : event.event_type === "company_payment"
          ? Number(event.total_cost ?? 0)
          : 0;
```

Replace with:
```ts
  const paymentTotal =
    event.event_type === "refill"
      ? Number(event.total_cost ?? 0)
      : event.event_type === "order"
        ? Number(event.order_total ?? 0)
        : (event.event_type === "company_payment" || event.event_type === "company_buy_iron")
          ? Number(event.total_cost ?? 0)
          : 0;
```

### 4c — showPaymentRatio

Find:
```ts
  const showPaymentRatio =
    (event.event_type === "refill" ||
      event.event_type === "order" ||
      event.event_type === "company_payment") &&
    paymentTotal > 0;
```

Replace with:
```ts
  const showPaymentRatio =
    (event.event_type === "refill" ||
      event.event_type === "order" ||
      event.event_type === "company_payment" ||
      event.event_type === "company_buy_iron") &&
    paymentTotal > 0;
```

### 4d — ratioMoneyDirection

Find:
```ts
  const ratioMoneyDirection =
    moneyDirection !== "none"
      ? moneyDirection
      : event.event_type === "order"
        ? "in"
        : event.event_type === "refill"
          ? "out"
          : "none";
```

Replace with:
```ts
  const ratioMoneyDirection =
    moneyDirection !== "none"
      ? moneyDirection
      : event.event_type === "order"
        ? "in"
        : (event.event_type === "refill" || event.event_type === "company_buy_iron")
          ? "out"
          : "none";
```

**Do not change anything else in this file.**

---

## Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Manual checks:

1. **Buy full from company** — card shows `Bought: 2x 12kg | 3x 48kg` below "Company". If only one gas type was bought, only that one appears.
2. **Buy empty from customer** — `Received: 3x 12kg` renders in black (same as order cards), not gray.
3. **Balance pill scope label** — debt state shows "(on customer)" / "(on distributor)"; credit state shows "(for customer)" / "(for distributor)".
4. **Buy full from company ratio** — top-right shows `-250 $ / 500 $` (paid / total). If fully paid shows `-500 $ / 500 $`.
