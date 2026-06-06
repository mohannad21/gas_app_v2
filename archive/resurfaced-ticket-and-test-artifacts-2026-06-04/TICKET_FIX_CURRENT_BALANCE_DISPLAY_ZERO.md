# TICKET: Fix "Credit for distributor 0 $" in Balance State Display

## Branch
Stay on the current branch.

## Problem

Some activity cards show a pill like:

```
Credit for distributor 0 $
```

This pill has **no "Money balance:" prefix** — it comes from `formatCurrentBalanceState`,
not from `formatTransitionRow`. It appears when the money balance is a small fractional
value (e.g. −0.4 shekels) that:

- Is non-zero, so it passes the `numeric === 0` guard
- But rounds to `"0 $"` when passed through `formatMoney`

The result is a direction label ("Credit for distributor") attached to a displayed amount
of "0 $", which is both incorrect and confusing.

## Root Cause

In `frontend/lib/balanceTransitions.ts`, `formatCurrentBalanceState` (line 107) only
guards against exact zero:

```typescript
if (numeric === 0) return PAYMENT_DIRECTION_WORDING.settled;
```

It does not use the existing `isDisplayZero` helper that was added to fix the same class
of bug in `formatTransitionRow`.

## File to Change

**Only one file:** `frontend/lib/balanceTransitions.ts`

## Implementation

In `formatCurrentBalanceState`, add a single line immediately after `formatMoney` is
resolved:

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
  // ADD THIS LINE:
  if (isDisplayZero(component, numeric, formatMoney)) return PAYMENT_DIRECTION_WORDING.settled;
  const label = buildDirectionLabel(scope, component, numeric);
  const value = formatComponentValue(scope, component, numeric, formatMoney);
  return `${label} ${value}`;
}
```

No other changes needed. `isDisplayZero` is already defined in the same file.

## Verification

Run the frontend build:

```bash
cd frontend && npm run build
```

Then check the daily report screen:
- No activity card should show a pill containing `"0 $"` with a direction label
  (e.g. `"Credit for distributor 0 $"`, `"Debts on distributor 0 $"`)
- Cards where the money balance is genuinely zero (or rounds to zero) should show
  no money pill at all, or show `"Settled"` if a pill is required
