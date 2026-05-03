# TICKET: Add valueMode="decimal" to all money FieldCells

## Branch
Stay on the current branch.

## Problem

`FieldCell` defaults to `valueMode="integer"`, which causes **two bugs at once** on
every money field:

1. **Display rounding** — `Math.round(value)` silently truncates decimals, e.g.
   `497.45` → `497`.
2. **Missing "." on keyboard** — `valueMode="integer"` sets `keyboardType="number-pad"`
   which has no decimal-point key. Users cannot type `5.50` — the "." key is absent.

`FieldCell` already handles both correctly when `valueMode="decimal"` is set (line 185
of `FieldPair.tsx`):
```tsx
keyboardType={valueMode === "decimal" ? "decimal-pad" : "number-pad"}
inputMode={valueMode === "decimal" ? "decimal" : "numeric"}
```

`PriceInputForm.tsx` already passes `valueMode: "decimal"`. Every other data-entry
screen has the same bug. Fix all of them in one pass.

---

## Files to Change

### 1. `frontend/components/AddRefillModal.tsx`

Two FieldCells in the TOTAL / PAID money row (around line 1060):

**TOTAL cell — add `valueMode="decimal"`:**
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

**PAID cell — add `valueMode="decimal"`:**
```tsx
<FieldCell
  title={CUSTOMER_WORDING.paid}
  comment={`Wallet ${formatMoney(walletBalance)} -> ${formatMoney(walletAfterPaid)}`}
  value={paidNowValue}
  valueMode="decimal"
  onIncrement={() => adjustPaid(5)}
  onDecrement={() => adjustPaid(-5)}
  ...
/>
```

---

### 2. `frontend/app/orders/new.tsx`

Ten money FieldCells spread across the three order modes (replacement, sell_iron,
buy_iron). Cylinder count cells (Installed, Received) are integers — leave them alone.

For each of the following, add `valueMode="decimal"` as a prop:

| Approx. line | title | Field / variable |
|-------------|-------|-----------------|
| ~1879 | "Total" | `price_total` controller — replacement mode TOTAL (editable) |
| ~1912 | "Paid" | `paid_amount` controller — replacement mode PAID |
| ~1986 | "Paid" | `paid_amount` controller — sell mode PAID (plain payment section) |
| ~2163 | "Iron Price" | `ironPriceInput` — sell_iron mode |
| ~2203 | "Gas Price" | `gasPriceInput` — sell_iron mode |
| ~2237 | "Total" | `computedTradeTotal` — sell_iron TOTAL (editable=false) |
| ~2252 | "Paid" | `paid_amount` — sell_iron PAID |
| ~2319 | "Iron Price" | `ironPriceInput` — buy_iron mode |
| ~2353 | "Total" | `computedTradeTotal` — buy_iron TOTAL (editable=false) |
| ~2368 | "Paid" | `paid_amount` — buy_iron PAID |

Each change is one line added to the JSX props. Example for any of these:
```tsx
<FieldCell
  title={CUSTOMER_WORDING.total}
  comment=" "
  value={computedTradeTotal}
  valueMode="decimal"        {/* ← add this */}
  onIncrement={() => {}}
  onDecrement={() => {}}
  editable={false}
/>
```

---

### 3. `frontend/app/inventory/new.tsx`

Two money FieldCells inside two separate form components:

**Cash adjustment amount (around line 553):**
```tsx
<FieldCell
  title="Amount"
  value={deltaValue}
  valueMode="decimal"        {/* ← add this */}
  onIncrement={() => stepValue(5)}
  onDecrement={() => stepValue(-5)}
  onChangeText={setDeltaCash}
  steppers={MONEY_STEPPERS}
/>
```

**Company payment amount (around line 787):**
```tsx
<FieldCell
  title={CUSTOMER_WORDING.paid}
  comment={`Wallet ${formatDisplayMoney(walletBalance)} -> ${formatDisplayMoney(walletAfter)}`}
  value={amountValue}
  valueMode="decimal"        {/* ← add this */}
  onIncrement={() => stepValue(5)}
  onDecrement={() => stepValue(-5)}
  onChangeText={setAmount}
  steppers={MONEY_STEPPERS}
/>
```

The Full/Empty cylinder count FieldCells (lines ~356–414) stay as integers — do NOT
add `valueMode="decimal"` to those.

---

### 4. `frontend/components/CashExpensesView.tsx`

Two money FieldCells:

**Expense amount (around line 348):**
```tsx
<FieldCell
  title="Amount"
  value={expenseAmountValue}
  valueMode="decimal"        {/* ← add this */}
  onIncrement={() => setExpenseAmount(String(Math.max(expenseAmountValue + 5, 0)))}
  onDecrement={() => setExpenseAmount(String(Math.max(expenseAmountValue - 5, 0)))}
  onChangeText={setExpenseAmount}
  steppers={MONEY_STEPPERS}
/>
```

**Bank transfer amount (around line 380):**
```tsx
<FieldCell
  title="Amount"
  value={transferAmountValue}
  valueMode="decimal"        {/* ← add this */}
  onIncrement={() => stepTransferAmount(5)}
  onDecrement={() => stepTransferAmount(-5)}
  onChangeText={setTransferAmount}
  steppers={MONEY_STEPPERS}
/>
```

---

### 5. `frontend/app/inventory/company-balance-adjust.tsx`

One money FieldCell — the company money balance adjustment (around line 241).
The 12kg and 48kg cylinder cells below it stay as integers — do NOT touch those.

```tsx
<FieldCell
  title="Money"
  value={nextMoney}
  valueMode="decimal"        {/* ← add this */}
  onIncrement={() => setMoney(String(nextMoney + 5))}
  onDecrement={() => setMoney(String(nextMoney - 5))}
  onChangeText={setMoney}
  steppers={MONEY_STEPPERS}
/>
```

---

## Summary of changes

| File | FieldCells changed | FieldCells left as integer |
|------|--------------------|---------------------------|
| `AddRefillModal.tsx` | TOTAL, PAID | — |
| `orders/new.tsx` | 10 money cells | installed, received (cylinders) |
| `inventory/new.tsx` | 2 money cells | full/empty 12kg, full/empty 48kg |
| `CashExpensesView.tsx` | 2 money cells | — |
| `company-balance-adjust.tsx` | Money balance | 12kg, 48kg cylinders |

`PriceInputForm.tsx` already has `valueMode: "decimal"` — **do not touch it**.

---

## Verification

Run the frontend build:

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Then manually check each screen:

**AddRefillModal** — open a refill, set a non-round price (e.g. 165.95/cylinder, 3
cylinders). TOTAL should display `497.85`, not `497`.

**New Order** — enter an iron or gas price with decimal component. TOTAL and PAID
cells should show the decimal value.

**Inventory → Cash Adjustment** — enter `5.50`. The FieldCell should show `5.50`,
not `5`.

**Add screen → Expense** — enter `12.50`. The FieldCell should show `12.50`, not `12`.

**Company Balance Adjust** — enter a decimal money value. Should display correctly.

---

## What was wrong before

`FieldCell.normalizeValue("integer")` calls `Math.round(clamped)`, silently discarding
the decimal part of any money amount. Users entering or viewing decimal prices saw the
value rounded to the nearest whole number with no warning.

Additionally, `keyboardType="number-pad"` (the integer default) does not show a "."
key on the keyboard, so users had no way to type decimal amounts at all on these fields.
