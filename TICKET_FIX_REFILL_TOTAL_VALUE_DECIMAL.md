# TICKET: Fix TOTAL and PAID FieldCells showing rounded integer instead of decimal

## Branch
Stay on the current branch.

## Problem

In `AddRefillModal`, the TOTAL FieldCell shows `497` instead of `497.45` when the total
cost is a decimal value. The PAID FieldCell has the same issue — it rounds user-entered
decimal amounts to integers.

## Root Cause

`FieldCell` in `FieldPair.tsx` has `valueMode` defaulting to `"integer"`. The `normalizeValue`
function for integer mode calls `Math.round(clamped)`:

```typescript
// valueMode === "integer" branch:
return Math.round(clamped); // 497.45 → 497
```

Neither the TOTAL nor the PAID `FieldCell` in `AddRefillModal.tsx` passes `valueMode="decimal"`,
so both silently round their money values.

## Files to Change

**Only one file:** `frontend/components/AddRefillModal.tsx`

## Implementation

At line 1060–1081, add `valueMode="decimal"` to both FieldCells in the TOTAL/PAID row:

### TOTAL FieldCell (currently line 1060–1067)

```tsx
<FieldCell
  title={CUSTOMER_WORDING.total}
  comment=" "
  value={totalCost}
  valueMode="decimal"
  onIncrement={() => {}}
  onDecrement={() => {}}
  editable={false}
/>
```

### PAID FieldCell (currently line 1068–1081)

```tsx
<FieldCell
  title={CUSTOMER_WORDING.paid}
  comment={`Wallet ${formatMoney(walletBalance)} -> ${formatMoney(walletAfterPaid)}`}
  value={paidNowValue}
  valueMode="decimal"
  onIncrement={() => adjustPaid(5)}
  onDecrement={() => adjustPaid(-5)}
  onChangeText={(text) => {
    if (!canEditMoney) return;
    formState.setPaidTouched(true);
    formState.setPaidNow(sanitizeCountInput(text));
  }}
  editable={canEditMoney}
  steppers={FIELD_MONEY_STEPPERS}
/>
```

No other changes needed.

## Verification

Run the frontend build:

```bash
cd frontend && npm run build
```

Then open the Add Refill modal. Select cylinders with a per-unit price that has a decimal
component (e.g., price = 165.95 per cylinder, buy 3 → total = 497.85).

**Expected after fix:**
- TOTAL cell shows `497.85` (not `497`)
- PAID cell defaults to the same decimal value
- "Paid all" button sets PAID to the decimal total correctly
- Incrementing/decrementing PAID by 5 still works (steps remain whole numbers)

**What was wrong before:**
- TOTAL showed `497` — the decimal part was silently truncated by `Math.round`
- PAID accepted decimal input but rounded the display value
