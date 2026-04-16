# Ticket: Fix Balance Transition Pills — Symbol, Filtering, Color, Arrow

## Branch
Continue on the existing branch (do NOT create a new branch):
```
git checkout fix/balance-wording
```

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.
- **Do not add features** not listed here.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.

---

## Overview

Five issues visible in the activity cards:

1. Customer events (Replacement, Return empties, etc.) show 6 pills — 3 customer + 3 distributor. Should show only 3 customer pills. Distributor pills should only appear on company events (Refill, Company Payment, etc.).
2. Pills show "70 USD" — should be the currency symbol (e.g. "70 $" or "70 ₪"), not the code.
3. Pills showing "0 → 0" — both sides zero, should be hidden.
4. Pills showing "debts 70 → 70 debts" when nothing changed — show a sentence instead.
5. All pills are the same orange color regardless of whether the balance improved or worsened.

---

## Step 1 — Add `getCurrencySymbol` to `frontend/lib/money.ts`

**File:** `frontend/lib/money.ts`

Read the file first.

Add the following function after the existing `getCurrencyCode` function:

```ts
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  ILS: "₪",
  EUR: "€",
  GBP: "£",
  JOD: "JD",
  EGP: "E£",
  SAR: "﷼",
  AED: "د.إ",
};

export function getCurrencySymbol(): string {
  return CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;
}
```

**Do not change anything else in this file.**

---

## Step 2 — Rewrite transition formatting in `frontend/lib/balanceTransitions.ts`

**File:** `frontend/lib/balanceTransitions.ts`

Read the file first.

### 2a — Add `getCurrencySymbol` to the existing import

At the top of the file, find the existing import from `@/lib/money`:
```ts
import { getCurrencyCode } from "@/lib/money";
```

Replace with:
```ts
import { getCurrencyCode, getCurrencySymbol } from "@/lib/money";
```

(`getCurrencyCode` must stay — it is still used by `formatMoneyValue` and `formatCurrentBalanceState` elsewhere in the file.)

### 2b — Replace the three helper functions and `formatTransitionRow`

Find these three helper functions that were added in the previous implementation (they will be somewhere before `formatTransitionRow`):

```ts
function getCompactDirectionLabel(...) { ... }
function getScopeLabel(...) { ... }
function formatCompactAmount(...) { ... }
```

And find the `formatTransitionRow` function itself.

Replace all four functions with the following (keep them in the same location, replacing whatever is currently there):

```ts
function getCompactDirectionLabel(scope: BalanceScope, component: BalanceComponent, value: number): string {
  if (value === 0) return "";
  if (scope === "customer") {
    return value > 0 ? "debts" : "credit";
  }
  if (component === "money") {
    return value > 0 ? "debts" : "credit";
  }
  return value > 0 ? "credit" : "debts";
}

function getScopeLabel(scope: BalanceScope): string {
  return scope === "customer" ? "(on customer)" : "(on distributor)";
}

function formatCompactAmount(component: BalanceComponent, value: number, formatMoney: FormatMoney): string {
  if (component === "money") {
    return `${formatMoney(Math.abs(value))} ${getCurrencySymbol()}`;
  }
  return String(Math.abs(value));
}

function formatTransitionRow(
  transition: TransitionInput,
  formatMoney: FormatMoney
): string | null {
  const before = Number(transition.before ?? 0);
  const after = Number(transition.after ?? 0);
  // Both sides zero — nothing to show
  if (before === 0 && after === 0) return null;
  const label = getComponentLabel(transition.component);
  const scope = getScopeLabel(transition.scope);
  // Balance unchanged (non-zero) — show a sentence instead of x → y
  if (before === after) {
    const dir = getCompactDirectionLabel(transition.scope, transition.component, after);
    const val = formatCompactAmount(transition.component, after, formatMoney);
    const balancePart = dir ? `${dir} ${val}` : val;
    return `${label}: unchanged — ${balancePart} ${scope}`;
  }
  const dirBefore = getCompactDirectionLabel(transition.scope, transition.component, before);
  const dirAfter = getCompactDirectionLabel(transition.scope, transition.component, after);
  const valBefore = formatCompactAmount(transition.component, before, formatMoney);
  const valAfter = formatCompactAmount(transition.component, after, formatMoney);
  const beforePart = dirBefore ? `${dirBefore} ${valBefore}` : valBefore;
  const afterPart = dirAfter ? `${valAfter} ${dirAfter}` : valAfter;
  return `${label}: ${beforePart} → ${afterPart} ${scope}`;
}
```

Key changes:
- `getCurrencySymbol()` instead of `getCurrencyCode()`
- Both-zero lines are hidden
- Unchanged non-zero lines show `"unchanged — debts 70 $ (on customer)"` instead of `"debts 70 $ → 70 $ debts"`
- `→` instead of `->`

### 2c — Add a new exported function `formatTransitionPills`

Add this new exported function at the **end of the file**, after all existing exports:

```ts
export type TransitionPillIntent = "good" | "bad" | "neutral";

export type TransitionPill = {
  text: string;
  intent: TransitionPillIntent;
};

export function formatTransitionPills(
  transitions: TransitionInput[] | null | undefined,
  options: { formatMoney?: FormatMoney } = {}
): TransitionPill[] {
  if (!Array.isArray(transitions) || transitions.length === 0) return [];
  const formatMoney = options.formatMoney ?? defaultFormatMoney;
  const result: TransitionPill[] = [];
  for (const transition of transitions) {
    const text = formatTransitionRow(transition, formatMoney);
    if (!text) continue;
    const before = Math.abs(Number(transition.before ?? 0));
    const after = Math.abs(Number(transition.after ?? 0));
    let intent: TransitionPillIntent;
    if (before === after) {
      intent = "neutral";
    } else if (after < before) {
      intent = "good";
    } else {
      intent = "bad";
    }
    result.push({ text, intent });
  }
  return result;
}
```

Intent rules:
- `good` (green) — absolute balance shrank (closer to zero = less debt/imbalance)
- `bad` (orange) — absolute balance grew (further from zero = more debt/imbalance)
- `neutral` (grey) — balance unchanged, showing the "unchanged —" sentence

**Do not change anything else in this file.**

---

## Step 3 — Fix scope filter in `buildDisplayTransitions` in `SlimActivityRow.tsx`

**File:** `frontend/components/reports/SlimActivityRow.tsx`

Read the file first.

The problem: every event from the backend includes both customer and company balance fields (all non-null), so `buildDisplayTransitions` always pushes all 6 transitions. We need to push only the relevant scope for each event type.

`transitionIntentForEvent` is already defined just above `buildDisplayTransitions` in this file — use it to detect company events.

Find the `buildDisplayTransitions` function. It currently looks exactly like this:

```ts
const buildDisplayTransitions = (event: DailyReportV2Event) => {
  const transitions: NonNullable<DailyReportV2Event["balance_transitions"]> = [];
  pushEventTransition(transitions, "customer", "money", event.customer_money_before, event.customer_money_after);
  pushEventTransition(transitions, "customer", "cyl_12", event.customer_12kg_before, event.customer_12kg_after);
  pushEventTransition(transitions, "customer", "cyl_48", event.customer_48kg_before, event.customer_48kg_after);
  pushEventTransition(transitions, "company", "money", event.company_before, event.company_after);
  pushEventTransition(transitions, "company", "cyl_12", event.company_12kg_before, event.company_12kg_after);
  pushEventTransition(transitions, "company", "cyl_48", event.company_48kg_before, event.company_48kg_after);
  return transitions.length > 0 ? transitions : event.balance_transitions ?? [];
};
```

Replace it with:

```ts
const buildDisplayTransitions = (event: DailyReportV2Event) => {
  const transitions: NonNullable<DailyReportV2Event["balance_transitions"]> = [];
  const intent = transitionIntentForEvent(event);
  const isCompanyEvent = intent.startsWith("company_");

  if (isCompanyEvent) {
    pushEventTransition(transitions, "company", "money", event.company_before, event.company_after);
    pushEventTransition(transitions, "company", "cyl_12", event.company_12kg_before, event.company_12kg_after);
    pushEventTransition(transitions, "company", "cyl_48", event.company_48kg_before, event.company_48kg_after);
  } else {
    pushEventTransition(transitions, "customer", "money", event.customer_money_before, event.customer_money_after);
    pushEventTransition(transitions, "customer", "cyl_12", event.customer_12kg_before, event.customer_12kg_after);
    pushEventTransition(transitions, "customer", "cyl_48", event.customer_48kg_before, event.customer_48kg_after);
  }
  return transitions.length > 0 ? transitions : event.balance_transitions ?? [];
};
```

`transitionIntentForEvent` returns intents starting with `"company_"` for refill, company_payment, and company_buy_iron. Everything else (orders, collections, adjustments) falls into the customer branch.

**Do not change anything else in this file.**

---

## Step 4 — Update `SlimActivityRow.tsx` to use `formatTransitionPills`

**File:** `frontend/components/reports/SlimActivityRow.tsx`

Read the file first. (This is the same file as Step 3.)

### 4a — Update the import from `@/lib/balanceTransitions`


Find the existing import line for `formatBalanceTransitions` (it may look like):
```ts
import { formatBalanceTransitions, ... } from "@/lib/balanceTransitions";
```

Add `formatTransitionPills` and `TransitionPill` to this import. Keep all other imports from this module unchanged.

### 4b — Replace `transitionLines` computation

Find this block (around line 308):
```tsx
  const transitionLines = formatBalanceTransitions(buildDisplayTransitions(event), {
    mode: "transition",
    collapseAllSettled: false,
    intent: transitionIntentForEvent(event),
    formatMoney: fmtMoney,
    layout: "balance_row",
  });
```

Replace with:
```tsx
  const transitionPills: TransitionPill[] = formatTransitionPills(buildDisplayTransitions(event), {
    formatMoney: fmtMoney,
  });
```

### 4c — Update the `showNotes` line

Find:
```tsx
  const notes = transitionLines.length === 0 && Array.isArray(event?.notes) ? event.notes : [];
  const showNotes = transitionLines.length > 0 || notes.length > 0;
```

Replace with:
```tsx
  const notes = transitionPills.length === 0 && Array.isArray(event?.notes) ? event.notes : [];
  const showNotes = transitionPills.length > 0 || notes.length > 0;
```

### 4d — Update the JSX that renders transition pills

Find:
```tsx
              {transitionLines.map((text, index) => (
                <View key={`transition-${index}`} style={[styles.pill, styles.pillWarning]}>
                  <Text
                    style={[styles.pillText, styles.pillWarningText]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {text}
                  </Text>
                </View>
              ))}
```

Replace with:
```tsx
              {transitionPills.map((pill, index) => (
                <View
                  key={`transition-${index}`}
                  style={[
                    styles.pill,
                    pill.intent === "good"
                      ? styles.pillGood
                      : pill.intent === "neutral"
                        ? styles.pillNeutral
                        : styles.pillWarning,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      pill.intent === "good"
                        ? styles.pillGoodText
                        : pill.intent === "neutral"
                          ? styles.pillNeutralText
                          : styles.pillWarningText,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {pill.text}
                  </Text>
                </View>
              ))}
```

### 4e — Add `pillGood`, `pillNeutral` and their text styles to the StyleSheet

In the `StyleSheet.create({...})` block, find the `pillWarning` and `pillWarningText` entries:
```ts
  pillWarning: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
  },
  pillWarningText: {
    color: "#9a3412",
  },
```

Add the following two new entries immediately after them:
```ts
  pillGood: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
  pillGoodText: {
    color: "#15803d",
  },
  pillNeutral: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
  },
  pillNeutralText: {
    color: "#475569",
  },
```

**Do not change anything else in this file.**

---

## Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Manual checks — open the daily report, tap any customer activity card:

1. **Currency symbol**: pills show `70 $` or `70 ₪`, NOT `70 USD`
2. **Arrow**: pills show `→`, NOT `->`
3. **Hidden zero lines**: "Money balance: 0 $ → 0 $ (on customer)" does NOT appear
4. **Unchanged lines**: "Money balance: debts 70 $ → 70 $ debts" does NOT appear — instead shows grey pill "Money balance: unchanged — debts 70 $ (on customer)"
5. **Green pill**: when balance decreased (e.g. "debts 4 → 2 debts") pill is green
6. **Orange pill**: when balance increased (e.g. "debts 2 → 4 debts") pill is orange
7. Only customer lines appear on customer events (Replacement, Late Payment, etc.)
8. Only distributor lines appear on company events (Refill, Company Payment, etc.)
