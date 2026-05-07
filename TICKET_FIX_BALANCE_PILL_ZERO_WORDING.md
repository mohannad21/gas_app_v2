# TICKET: Fix Balance Pill "credit 0 $" / "debts 0 $" Wording Bug

## Branch
Stay on the current branch.

## Problem

Balance transition pills on activity cards (daily report, customer review, etc.) show incorrect
wording like:

- `"Money balance: unchanged — credit 0 $ (for distributor)"`
- `"Money balance: debts 0 $ → 819 $ (on distributor)"`

These appear when a money value is a small fraction (e.g. ±0.4 shekels) that:
- Is large enough to pass the existing zero-threshold check (`Math.abs(value) < 0.01`)
- Is small enough that `formatMoney` rounds it to `"0"` when displayed

The result is that the direction label ("credit" / "debts") and the scope suffix
("(for distributor)") are computed from the raw value, while the amount displays as `"0 $"`.

## Root Cause

Two independent "zero" thresholds are mismatched in `frontend/lib/balanceTransitions.ts`:

1. **`getCompactDirectionLabel`** returns `""` only when `Math.abs(value) < 0.01`
2. **`formatCompactAmount`** calls `formatMoney(Math.abs(value))`, which rounds to whole
   shekels — so any value in `[0.01, 0.50)` displays as `"0 $"` but still receives a direction label

## Full Case Matrix

| before | after | Current output | Expected output |
|--------|-------|----------------|-----------------|
| exact 0 | exact 0 | hidden ✓ | hidden ✓ |
| display-zero (e.g. −0.4) | display-zero | `"unchanged — credit 0 $ (for dist.)"` ✗ | hidden |
| display-zero | non-zero | `"debts 0 $ → 819 $ (on dist.)"` ✗ | `"Settled → 819 $ (on dist.)"` |
| non-zero | display-zero | `"819 $ → credit 0 $ (for dist.)"` ✗ | `"819 $ → Settled"` |
| non-zero | exact 0 | `"819 $ → Settled"` ✓ | `"819 $ → Settled"` ✓ |
| non-zero, unchanged | non-zero | `"unchanged — X (scope)"` ✓ | `"unchanged — X (scope)"` ✓ |
| non-zero | non-zero, changed | `"X → Y (scope)"` ✓ | `"X → Y (scope)"` ✓ |

## File to Change

**Only one file:** `frontend/lib/balanceTransitions.ts`

## Implementation Steps

### Step 1 — Add `isDisplayZero` helper

Add this function after `formatCompactAmount`:

```typescript
function isDisplayZero(
  component: BalanceComponent,
  value: number,
  formatMoney: FormatMoney
): boolean {
  if (Math.abs(value) < 0.01) return true;
  if (component !== "money") return false;
  const formatted = formatMoney(Math.abs(value));
  return formatted === "0" || formatted === "0.00" || formatted === "0.0";
}
```

### Step 2 — Update `formatTransitionRow` in 4 places

The function currently starts like this (simplified):

```typescript
function formatTransitionRow(transition, formatMoney) {
  const before = Number(transition.before ?? 0);
  const after  = Number(transition.after  ?? 0);

  // [A] both-zero early return
  if (Math.abs(before) < 0.01 && Math.abs(after) < 0.01) return null;

  const label = getComponentLabel(transition.component);
  const scope = getScopeLabel(transition.scope, transition.component, after);

  // [B] unchanged branch
  if (Math.abs(before - after) < 0.01) {
    const dir = getCompactDirectionLabel(...after);
    const val = formatCompactAmount(...after...);
    const balancePart = dir ? `${dir} ${val}` : val;
    return `${label}: unchanged — ${balancePart} ${scope}`;
  }

  const dirBefore  = getCompactDirectionLabel(...before);
  const dirAfter   = getCompactDirectionLabel(...after);
  const valBefore  = formatCompactAmount(...before...);
  const valAfter   = formatCompactAmount(...after...);
  const beforePart = dirBefore ? `${dirBefore} ${valBefore}` : valBefore;

  // [C] after-zero → Settled
  if (Math.abs(after) < 0.01) {
    return `${label}: ${beforePart} → Settled`;
  }

  const afterPart = dirAfter ? `${valAfter} ${dirAfter}` : valAfter;
  return `${label}: ${beforePart} → ${afterPart} ${scope}`;
}
```

Make these four changes:

**[A] both-zero early return** — replace the threshold check:
```typescript
// Before
if (Math.abs(before) < 0.01 && Math.abs(after) < 0.01) return null;

// After
if (isDisplayZero(transition.component, before, formatMoney) &&
    isDisplayZero(transition.component, after,  formatMoney)) return null;
```

**[B] unchanged branch** — add a display-zero guard at the top of the branch:
```typescript
if (Math.abs(before - after) < 0.01) {
  // Add this guard:
  if (isDisplayZero(transition.component, after, formatMoney)) return null;

  const dir = getCompactDirectionLabel(...);
  // ... rest unchanged
}
```

**[C] after-zero → Settled** — widen the threshold:
```typescript
// Before
if (Math.abs(after) < 0.01) {

// After
if (isDisplayZero(transition.component, after, formatMoney)) {
```

**[D] before-zero → Settled (new check)** — insert immediately after `beforePart` is computed,
before the `afterPart` computation:
```typescript
const beforePart = dirBefore ? `${dirBefore} ${valBefore}` : valBefore;

// Add this new check:
if (isDisplayZero(transition.component, before, formatMoney)) {
  const afterPart = dirAfter ? `${valAfter} ${dirAfter}` : valAfter;
  return `${label}: Settled → ${afterPart} ${scope}`;
}

// [C] existing after-zero check follows ...
```

## Verification

After the change, run the frontend build to confirm no TypeScript errors:

```bash
cd frontend && npm run build
```

Then manually test on the daily report screen:
- Refill cards with no money change should NOT show a money balance pill (or show "unchanged — Settled" if the balance is tiny)
- Refill cards where money goes from 0 → positive should show `"Settled → X $ (on distributor)"`
- No pill should ever contain `"credit 0 $"`, `"debts 0 $"`, or `"0 $ (on ..."` / `"0 $ (for ..."`
