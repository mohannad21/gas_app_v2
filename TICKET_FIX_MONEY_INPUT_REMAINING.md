# TICKET: Fix remaining money input bugs (iron price, PAID handler, customer balance, trailing zeros)

## Branch
Stay on the current branch.

## Background

The previous decimal ticket applied `valueMode="decimal"` to most money FieldCells.
Four bugs remain. This ticket fixes all of them.

---

## Bug 1 — `FieldPair.tsx`: trailing zeros stripped from decimal display

### Problem

`formatValue` in `frontend/components/entry/FieldPair.tsx` (line 62) strips trailing zeros:

```typescript
return normalized.toFixed(getMoneyDecimals()).replace(/\.?0+$/, "");
```

`5.50` normalizes to `5.5`, then `.toFixed(2)` gives `"5.50"`, then the replace
strips the trailing zero → final display is `"5.5"`. Users who type `"5.50"` see
their value immediately change to `"5.5"` in the field.

### Fix

Remove the `.replace()` call. One line change in
**`frontend/components/entry/FieldPair.tsx`**:

**Before (line 62):**
```typescript
return normalized.toFixed(getMoneyDecimals()).replace(/\.?0+$/, "");
```

**After:**
```typescript
return normalized.toFixed(getMoneyDecimals());
```

This leaves whole numbers unaffected (they take the `Number.isInteger` branch on line
59 and return `String(normalized)` without a decimal point).

---

## Bug 2 — `AddRefillModal.tsx`: Iron Price 12kg and 48kg

### Problem

Two FieldCells are missing `valueMode="decimal"` (no "." key, display rounds), AND
their `onChangeText` handlers call `sanitizeCountInput` which uses `parseInt` — so
even if a decimal is typed, it is stripped to an integer before storage.

Files: **`frontend/components/AddRefillModal.tsx`** lines ~985 and ~1022.

### Fix — Part A: add `valueMode="decimal"` to both FieldCells

**Iron Price 12kg cell (around line 985):**
```tsx
<FieldCell
  title="Iron Price"
  value={ironPrice12Value}
  valueMode="decimal"                              {/* ← add this */}
  onIncrement={() => adjustIronPrice12(5)}
  onDecrement={() => adjustIronPrice12(-5)}
  onChangeText={(t) => formState.setIronPrice12Input(sanitizeDecimalInput(t))}
  steppers={FIELD_MONEY_STEPPERS}
/>
```

**Iron Price 48kg cell (around line 1022):**
```tsx
<FieldCell
  title="Iron Price"
  value={ironPrice48Value}
  valueMode="decimal"                              {/* ← add this */}
  onIncrement={() => adjustIronPrice48(5)}
  onDecrement={() => adjustIronPrice48(-5)}
  onChangeText={(t) => formState.setIronPrice48Input(sanitizeDecimalInput(t))}
  steppers={FIELD_MONEY_STEPPERS}
/>
```

### Fix — Part B: add `sanitizeDecimalInput` helper

Add the following function in `AddRefillModal.tsx` directly after `sanitizeCountInput`
(after line ~106):

```typescript
function sanitizeDecimalInput(value: string): string {
  if (!value.trim()) return "";
  // Keep digits and at most one decimal point; strip everything else
  const cleaned = value.replace(/[^0-9.]/g, "");
  const dotIndex = cleaned.indexOf(".");
  if (dotIndex === -1) return cleaned;
  // Allow at most getMoneyDecimals() digits after the point
  return cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, "");
}
```

> **Do NOT change** the `sanitizeCountInput` calls for cylinder return fields
> (lines ~660, ~707, ~766, ~816 — those handle integer counts and are correct).

---

## Bug 3 — `AddRefillModal.tsx`: PAID field handler strips decimals

### Problem

The PAID FieldCell already has `valueMode="decimal"` (correct display + "." key), but
its `onChangeText` handler at line ~1079 still calls `sanitizeCountInput`:

```typescript
formState.setPaidNow(sanitizeCountInput(text))  // parseInt strips 497.45 → 497
```

So when the user types `497.45`, the stored value becomes `497`, creating a 0.45
mismatch between `paid_now` and `total_cost`. This shows up on the daily report as a
fake unpaid balance pill.

### Fix

Change only the handler on the PAID FieldCell's `onChangeText` in
**`frontend/components/AddRefillModal.tsx`** (around line 1079):

**Before:**
```typescript
formState.setPaidNow(sanitizeCountInput(text))
```

**After:**
```typescript
formState.setPaidNow(sanitizeDecimalInput(text))
```

Use `sanitizeDecimalInput` defined in Bug 2 above — same file, no new import needed.

---

## Bug 4 — ~~`customers/new.tsx` and `customers/[id]/edit.tsx`~~ — ALREADY FIXED

Both files already pass `"decimal"` as the third argument to `renderBalanceAmountField`
at the money call site (verified in source). No action needed.

---

## Summary

| File | Change | Lines |
|------|--------|-------|
| `FieldPair.tsx` | Remove `.replace(/\.?0+$/, "")` from `formatValue` | ~62 |
| `AddRefillModal.tsx` | Add `sanitizeDecimalInput` function | after ~106 |
| `AddRefillModal.tsx` | Add `valueMode="decimal"` to Iron Price 12kg | ~985 |
| `AddRefillModal.tsx` | Change Iron Price 12kg handler to `sanitizeDecimalInput` | ~990 |
| `AddRefillModal.tsx` | Add `valueMode="decimal"` to Iron Price 48kg | ~1022 |
| `AddRefillModal.tsx` | Change Iron Price 48kg handler to `sanitizeDecimalInput` | ~1027 |
| `AddRefillModal.tsx` | Change PAID handler to `sanitizeDecimalInput` | ~1079 |

**Do NOT touch:**
- Cylinder return handlers in AddRefillModal (ret12/ret48) — these are integer counts
- `customers/new.tsx` and `customers/[id]/edit.tsx` — already correct
- Any other `sanitizeCountInput` call not listed above

---

## Verification

```bash
cd frontend && npm run build
```

Then check each affected screen:

**AddRefillModal → Iron Price fields:**
- Keyboard shows "." key ✓
- Type `150.50` → displays `150.50`, not `150` ✓
- Total row updates to `qty × 150.50` ✓
- PAID field accepts `497.45`, stores `497.45`, submission has no fake debt ✓

**Customers → New / Edit → Money balance:**
- Keyboard shows "." key ✓
- Type `250.75` → displays `250.75`, not `251` ✓
- Cylinder balance fields unchanged (no "." key, integer steppers) ✓

**Any decimal FieldCell:**
- Type `5.50` → displays `5.50`, not `5.5` ✓
- Whole numbers like `5` still display as `5`, not `5.00` ✓
