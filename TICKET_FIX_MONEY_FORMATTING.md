# TICKET: Fix Money Formatting — Floating Point Display & Decimal Truncation

## Branch
Create a new branch from main:
```
git checkout main
git pull
git checkout -b fix/money-formatting
```

---

## Rules — Read These First

- **Read every file before modifying it.**
- **No improvisation.** Only change what is listed below. Do not refactor anything else.
- No logic changes — only formatting changes (`.toFixed(0)` → `formatDisplayMoney`, etc.).
- Run the verification command at the end and confirm it passes.

---

## Problem

Two bugs are visible on screen:

1. **Floating point garbage** — `defaultFormatMoney` in `balanceTransitions.ts` uses
   `String(Number(value))` which outputs `"409.2999999999993"` instead of `"409.30"`.

2. **Decimal truncation** — Every screen defines its own `formatMoney` using `.toFixed(0)`,
   which cuts off decimals. A price of `88.15` displays as `88`. A total of `409.30` displays
   as `409`.

Both are caused by the same root: there is no shared money formatter that uses
`getMoneyDecimals()`. Every file invents its own, and all of them hardcode the wrong
decimal count.

---

## Step 1 — Add `formatDisplayMoney` to money.ts

**File:** `frontend/lib/money.ts`

Read the file first.

Add the following export **at the end of the file**, after `fromMinorUnits`:

```typescript
export function formatDisplayMoney(value: number): string {
  return Number(value || 0).toFixed(getMoneyDecimals());
}
```

This is the single source of truth for all money display formatting going forward.

---

## Step 2 — Fix `defaultFormatMoney` in balanceTransitions.ts

**File:** `frontend/lib/balanceTransitions.ts`

Read the file first.

### 2a — Update import

Find:
```typescript
import { getCurrencySymbol } from "@/lib/money";
```
Replace with:
```typescript
import { getCurrencySymbol, formatDisplayMoney } from "@/lib/money";
```

### 2b — Fix defaultFormatMoney

Find:
```typescript
const defaultFormatMoney: FormatMoney = (value) => String(Number(value || 0));
```
Replace with:
```typescript
const defaultFormatMoney: FormatMoney = (value) => formatDisplayMoney(value);
```

---

## Step 3 — Fix reports/index.tsx formatMoney

**File:** `frontend/app/(tabs)/reports/index.tsx`

Read the file first.

### 3a — Update import

Find the line that imports from `@/lib/money` (imports `getCurrencySymbol`). Add
`formatDisplayMoney` to it.

### 3b — Fix the formatMoney definition

Find (around line 42):
```typescript
const formatMoney = (value: number) => Number(value || 0).toFixed(0);
```
Replace with:
```typescript
const formatMoney = (value: number) => formatDisplayMoney(value);
```

---

## Step 4 — Fix DaySummaryBox.tsx

**File:** `frontend/components/reports/DaySummaryBox.tsx`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money`.

Find (around line 9):
```typescript
const formatMoney = (v: number) => `${getCurrencySymbol()}${Math.abs(Number(v || 0)).toFixed(0)}`;
```
Replace with:
```typescript
const formatMoney = (v: number) => `${getCurrencySymbol()}${formatDisplayMoney(Math.abs(Number(v || 0)))}`;
```

---

## Step 5 — Fix activityAdapter.ts hero text

**File:** `frontend/lib/activityAdapter.ts`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money` at the top of the file
(if there is no import from `@/lib/money` yet, add one).

Make the following replacements (each is a hero_text line):

| Find | Replace |
|------|---------|
| `` heroText = `Payment ${amount.toFixed(0)}`; `` | `` heroText = `Payment ${formatDisplayMoney(amount)}`; `` |
| `` heroText = `Payout ${amount.toFixed(0)}`; `` | `` heroText = `Payout ${formatDisplayMoney(amount)}`; `` |
| `` hero_text: amount !== 0 ? `Amount ${Math.abs(amount).toFixed(0)}` : null, `` | `` hero_text: amount !== 0 ? `Amount ${formatDisplayMoney(Math.abs(amount))}` : null, `` |
| `` hero_text: expense.amount != null ? `${expense.amount.toFixed(0)}` : null, `` | `` hero_text: expense.amount != null ? `${formatDisplayMoney(expense.amount)}` : null, `` |
| `` hero_text: `${Math.abs(deposit.amount).toFixed(0)}`, `` | `` hero_text: `${formatDisplayMoney(Math.abs(deposit.amount))}`, `` |
| `` hero_text: adj.reason ?? `Amount ${delta > 0 ? "+" : ""}${delta.toFixed(0)}`, `` | `` hero_text: adj.reason ?? `Amount ${delta > 0 ? "+" : ""}${formatDisplayMoney(delta)}`, `` |

---

## Step 6 — Fix AddRefillModal.tsx

**File:** `frontend/components/AddRefillModal.tsx`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money`.

Make these replacements:

| Find | Replace |
|------|---------|
| `return Number(value).toFixed(0);` (the local formatMoney function, around line 97) | `return formatDisplayMoney(value);` |
| `{line12Cost.toFixed(0)}` | `{formatDisplayMoney(line12Cost)}` |
| `{line48Cost.toFixed(0)}` | `{formatDisplayMoney(line48Cost)}` |
| `{ironLine12Cost.toFixed(0)}` | `{formatDisplayMoney(ironLine12Cost)}` |
| `{ironLine48Cost.toFixed(0)}` | `{formatDisplayMoney(ironLine48Cost)}` |
| `amount: refillWalletShortfall.toFixed(0),` | `amount: formatDisplayMoney(refillWalletShortfall),` |

---

## Step 7 — Fix inventory/new.tsx

**File:** `frontend/app/inventory/new.tsx`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money`.

Make these replacements:

| Find | Replace |
|------|---------|
| `` `Cash ${cashBefore.toFixed(0)} to ${(cashBefore + deltaValue).toFixed(0)}` `` | `` `Cash ${formatDisplayMoney(cashBefore)} to ${formatDisplayMoney(cashBefore + deltaValue)}` `` |
| `formatMoney: (value) => value.toFixed(0),` (around line 651) | `formatMoney: (value) => formatDisplayMoney(value),` |
| `` `Wallet ${walletBalance.toFixed(0)} -> ${walletAfter.toFixed(0)}` `` | `` `Wallet ${formatDisplayMoney(walletBalance)} -> ${formatDisplayMoney(walletAfter)}` `` |
| `setAmount(totalDue.toFixed(0));` | `setAmount(formatDisplayMoney(totalDue));` |
| `amount: companyPaymentShortfall.toFixed(0),` | `amount: formatDisplayMoney(companyPaymentShortfall),` |

---

## Step 8 — Fix orders/new.tsx

**File:** `frontend/app/orders/new.tsx`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money`.

Make these replacements:

| Find | Replace |
|------|---------|
| `return Number(value).toFixed(0);` (the local formatMoney function, around line 73) | `return formatDisplayMoney(value);` |
| `const formatMoneyAmount = useCallback((value: number) => Math.abs(value).toFixed(0), []);` | `const formatMoneyAmount = useCallback((value: number) => formatDisplayMoney(Math.abs(value)), []);` |
| `` `)} + ${moneyDeltaValue.toFixed(0)} = ${balanceAfterValue.toFixed(0)}` `` | `` `)} + ${formatDisplayMoney(moneyDeltaValue)} = ${formatDisplayMoney(balanceAfterValue)}` `` |
| `amount: payoutWalletShortfall.toFixed(0),` | `amount: formatDisplayMoney(payoutWalletShortfall),` |

---

## Step 9 — Fix orders/[id]/edit.tsx

**File:** `frontend/app/orders/[id]/edit.tsx`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money`.

Find both occurrences of:
```typescript
formatMoney: (value) => value.toFixed(0)
```
Replace both with:
```typescript
formatMoney: (value) => formatDisplayMoney(value)
```

---

## Step 10 — Fix orders/[id].tsx

**File:** `frontend/app/orders/[id].tsx`

Read the file first.

Add `formatDisplayMoney` and `getCurrencySymbol` to the import from `@/lib/money`
(only add what isn't already imported).

Make these replacements:

| Find | Replace |
|------|---------|
| `` if (amount < 0) return `Credit ${Math.abs(amount).toFixed(0)}`; `` | `` if (amount < 0) return `Credit ${formatDisplayMoney(Math.abs(amount))}`; `` |
| `` if (amount > 0) return `Debt ${amount.toFixed(0)}`; `` | `` if (amount > 0) return `Debt ${formatDisplayMoney(amount)}`; `` |
| `` `Applied credit: ${order.applied_credit.toFixed(0)}` `` | `` `Applied credit: ${getCurrencySymbol()}${formatDisplayMoney(order.applied_credit)}` `` |
| `` `Total: $${order.price_total}` `` | `` `Total: ${getCurrencySymbol()}${formatDisplayMoney(order.price_total)}` `` |
| `` `Paid: $${netPaid}` `` | `` `Paid: ${getCurrencySymbol()}${formatDisplayMoney(netPaid)}` `` |
| `` `Unpaid $${remaining}` `` | `` `Unpaid ${getCurrencySymbol()}${formatDisplayMoney(remaining)}` `` |

---

## Step 11 — Fix add/index.tsx

**File:** `frontend/app/(tabs)/add/index.tsx`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money`.

Find every occurrence of `formatMoney={(value) => Number(value || 0).toFixed(0)}` and
replace with `formatMoney={(value) => formatDisplayMoney(value)}`.

Find every occurrence of `const fmtMoney = (v: number) => Number(v || 0).toFixed(0);`
and replace with `const fmtMoney = (v: number) => formatDisplayMoney(v);`.

Find:
```typescript
`Debts on customer ${money.toFixed(0)} ${getCurrencySymbol()}`
```
Replace with:
```typescript
`Debts on customer ${formatDisplayMoney(money)} ${getCurrencySymbol()}`
```

Find:
```typescript
`Credit for customer ${Math.abs(money).toFixed(0)} ${getCurrencySymbol()}`
```
Replace with:
```typescript
`Credit for customer ${formatDisplayMoney(Math.abs(money))} ${getCurrencySymbol()}`
```

---

## Step 12 — Fix customers/index.tsx

**File:** `frontend/app/customers/index.tsx`

Read the file first.

Add `formatDisplayMoney` and `getCurrencySymbol` to the import from `@/lib/money`
(only add what isn't already imported).

Find:
```typescript
`Unpaid: $${item.money_balance}`
```
Replace with:
```typescript
`Unpaid: ${getCurrencySymbol()}${formatDisplayMoney(item.money_balance)}`
```

---

## Step 13 — Fix CustomersTabBalances.tsx

**File:** `frontend/components/customers/CustomersTabBalances.tsx`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money`.

Find:
```typescript
formatMoney={(value) => Number(value || 0).toFixed(0)}
```
Replace with:
```typescript
formatMoney={(value) => formatDisplayMoney(value)}
```

---

## Step 14 — Fix CashExpensesView.tsx

**File:** `frontend/components/CashExpensesView.tsx`

Read the file first.

Add `formatDisplayMoney` and `getCurrencySymbol` to the import from `@/lib/money`.

Replace every `.toFixed(0)` on a money variable in this file with
`formatDisplayMoney(...)`. Also replace the hardcoded word `"shekels"` with
`` `${getCurrencySymbol()}` `` where it refers to the currency unit.

Specifically:
- `wallet.toFixed(0)` → `formatDisplayMoney(wallet)`
- `projected.toFixed(0)` → `formatDisplayMoney(projected)`
- `amount.toFixed(0)` → `formatDisplayMoney(amount)`
- `walletValue.toFixed(0)` → `formatDisplayMoney(walletValue)`
- `walletAfter.toFixed(0)` → `formatDisplayMoney(walletAfter)`
- The word `"shekels"` in wallet description strings → `getCurrencySymbol()`

---

## Step 15 — Fix InlineWalletFundingPrompt.tsx

**File:** `frontend/components/InlineWalletFundingPrompt.tsx`

Read the file first.

Add `formatDisplayMoney` and `getCurrencySymbol` to the import from `@/lib/money`.

Find:
```typescript
You have {walletAmount.toFixed(0)} shekels in the wallet.
```
Replace with:
```typescript
You have {getCurrencySymbol()}{formatDisplayMoney(walletAmount)} in the wallet.
```

---

## Step 16 — Fix company-balance-adjust.tsx

**File:** `frontend/app/inventory/company-balance-adjust.tsx`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money`.

Find:
```typescript
`Current ${currentMoney.toFixed(0)} -> ${nextMoney.toFixed(0)}`
```
Replace with:
```typescript
`Current ${formatDisplayMoney(currentMoney)} -> ${formatDisplayMoney(nextMoney)}`
```

---

## Step 17 — Fix expenses/new.tsx

**File:** `frontend/app/expenses/new.tsx`

Read the file first.

Add `formatDisplayMoney` to the import from `@/lib/money`.

Find:
```typescript
setTransferAmount(shortfall.toFixed(0));
```
Replace with:
```typescript
setTransferAmount(formatDisplayMoney(shortfall));
```

---

## Step 18 — Fix plan-billing.tsx

**File:** `frontend/app/(tabs)/account/plan-billing.tsx`

Read the file first.

Find the import from `@/lib/money`. Replace `getCurrencyCode` with `getCurrencySymbol`
in the import (if `getCurrencyCode` is only used for this display purpose).

Find:
```typescript
return `${value.toFixed(getMoneyDecimals())} ${getCurrencyCode()}`;
```
Replace with:
```typescript
return `${formatDisplayMoney(value)} ${getCurrencySymbol()}`;
```

---

## Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

### Manual checks
1. Open the refill form — gas price `88.15` should show TOTAL `88.15`, not `88`
2. Open the daily report — balance pill amounts must never show raw floats like `409.2999...`
3. All money amounts throughout the app must show the correct number of decimal places
   matching the system setting
4. No amount should ever display `"ILS"` or `"USD"` as a suffix — only the symbol (`₪`, `$`)
