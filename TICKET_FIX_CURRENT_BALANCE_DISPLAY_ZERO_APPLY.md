# TICKET: Apply fix for "Credit for distributor 0 $" balance pill

## Branch
Stay on the current branch.

## Problem

Some activity cards in the daily report show a pill like:

```
Credit for distributor 0 $
```

or

```
Debts on distributor 0 $
```

These appear when the company money balance is a tiny fractional value (e.g. −0.4 shekels)
that is non-zero, so it passes the numeric guard, but rounds to `"0"` when formatted.
The result is a direction label attached to a displayed amount of "0 $" — incorrect and
confusing.

## Root Cause

`formatCurrentBalanceState` in `frontend/lib/balanceTransitions.ts` only guards against
exact numeric zero:

```typescript
if (numeric === 0) return PAYMENT_DIRECTION_WORDING.settled;
```

It does not call the `isDisplayZero` helper that already exists in the same file and was
added to fix the same class of bug in `formatTransitionRow`.

## File to Change

**Only one file:** `frontend/lib/balanceTransitions.ts`

## Implementation

In `formatCurrentBalanceState`, add one line immediately after `formatMoney` is resolved
(after line 54):

```typescript
export function formatCurrentBalanceState(
  scope: BalanceScope,
  component: BalanceComponent,
  amount: number,
  options: SharedOptions = {}
) {
  const numeric = Number(amount || 0);
  if (numeric === 0) return PAYMENT_DIRECTION_WORDING.settled;
  const formatMoney = options.formatMoney ?? defaultFormatMoney;
  if (isDisplayZero(component, numeric, formatMoney)) return PAYMENT_DIRECTION_WORDING.settled;  // ADD THIS LINE
  const label = buildDirectionLabel(scope, component, numeric);
  const value = formatComponentValue(scope, component, numeric, formatMoney);
  return `${label} ${value}`;
}
```

`isDisplayZero` is already defined in the same file. No imports needed.

## Verification

Run the frontend build:

```bash
cd frontend && npm run build
```

Then open the daily report and inspect balance pills on activity cards.

**Expected after fix:**
- No pill shows `"Credit for distributor 0 $"` or `"Debts on distributor 0 $"`
- Balances that are exactly zero, or that round to "0" via `formatDisplayMoney`, show no
  money pill (or show "Settled" if one is required by the layout)
- Real non-zero amounts (e.g. `"Credit for distributor 15.00 $"`) are unaffected

**What was wrong before:**
- Values like −0.4 shekels were not zero, so they passed the exact-zero guard. But
  `formatDisplayMoney(0.4)` = `"0.40"` ... wait, 0.40 rounds to "0.40" which is NOT "0".

> **Note for implementer:** The `isDisplayZero` function catches values where
> `formatMoney(Math.abs(value))` returns `"0"`, `"0.0"`, or `"0.00"`.  
> This fixes amounts in the range `|value| < 0.005` with 2-decimal formatting.  
> If you are also seeing `"Credit for distributor 0.06 $"` and want to suppress it,
> that is a separate business decision (0.06 is a valid non-zero amount). Raise the
> numeric threshold inside `isDisplayZero` if desired:
> ```typescript
> if (Math.abs(value) < 0.10) return true;  // suppress sub-10-agora noise
> ```
> — but only do this if explicitly instructed. The base ticket does not change any
> threshold values.
