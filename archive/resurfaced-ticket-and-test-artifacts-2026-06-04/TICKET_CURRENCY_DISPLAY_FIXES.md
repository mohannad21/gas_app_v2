# Ticket: Fix Currency Display — Replace All Hardcoded ₪ / $ / getCurrencyCode Usages

## Branch
Stay on the current branch — do NOT create a new branch.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **No improvisation.** If anything is unclear, stop and ask.
- No logic changes beyond what is described. Do not touch unrelated code.
- Changing the currency only changes the display symbol — no amounts are converted.
- Run the verification commands at the end and confirm they pass.

---

## Background

The app stores `currency_code` and `money_decimals` in `SystemSettings` as display preferences.
The frontend reads them at boot via `getSystemSettings()` which calls `setCurrencyCode()` and
`setMoneyDecimals()` — module-level globals in `frontend/lib/money.ts`. Components should call
`getCurrencySymbol()` (returns "$", "₪", etc.) and `getMoneyDecimals()` everywhere money is
formatted.

Currently many places bypass this and hardcode `₪` or `$`, or call `getCurrencyCode()` (which
returns the 3-letter code like "USD", "ILS") where the symbol is needed. The backend also
hardcodes `₪` in API-generated text strings, which means card body text ignores the currency
setting entirely.

**Nothing converts amounts. Every fix here only changes which symbol is rendered.**

---

## Part A — Backend

### A1 — Add currency symbol helper and update `_format_money` functions

**File:** `backend/app/services/reports_event_fields.py`

Read the file first.

#### A1a — Add a symbol lookup dict and helper near the top of the file

Find the `_format_money` function (around line 805):

```python
def _format_money(amount: int) -> str:
  return f"₪{amount}"


def _money_major(amount: int, decimals: int) -> int:
  if decimals <= 0:
    return int(amount)
  scale = 10 ** decimals
  return int(round(amount / scale))


def _format_money_major(amount: int, decimals: int) -> str:
  return f"₪{_money_major(amount, decimals)}"
```

Replace with:

```python
_CURRENCY_SYMBOLS: dict[str, str] = {
  "USD": "$",
  "ILS": "₪",
  "EUR": "€",
  "GBP": "£",
  "JOD": "JD",
  "EGP": "E£",
  "SAR": "﷼",
  "AED": "د.إ",
}


def currency_symbol_for_code(code: str) -> str:
  return _CURRENCY_SYMBOLS.get(code, code)


def _format_money(amount: int, symbol: str) -> str:
  return f"{symbol}{amount}"


def _money_major(amount: int, decimals: int) -> int:
  if decimals <= 0:
    return int(amount)
  scale = 10 ** decimals
  return int(round(amount / scale))


def _format_money_major(amount: int, decimals: int, symbol: str) -> str:
  return f"{symbol}{_money_major(amount, decimals)}"
```

#### A1b — Update `_hero_text_for_event` to accept and pass `currency_symbol`

Find the function signature:

```python
def _hero_text_for_event(event: DailyReportEvent, money_decimals: int) -> str:
```

Replace with:

```python
def _hero_text_for_event(event: DailyReportEvent, money_decimals: int, currency_symbol: str) -> str:
```

Then find every call to `_format_money_major(` inside this function. Each one currently looks
like `_format_money_major(amount, money_decimals)`. Add `currency_symbol` as the third argument
to every such call:

```python
_format_money_major(amount, money_decimals, currency_symbol)
```

**Do not change any other logic in this function.**

#### A1c — Update `_money_pill` and all action pill builders that call `_format_money`

Read the file carefully. Find every function in the file that calls `_format_money(`. Each such
call currently looks like `_format_money(amount)` or `_format_money(abs(...))`. In every such
function:

1. Add `currency_symbol: str` as a parameter to the function signature.
2. Change every call to `_format_money(...)` inside it to `_format_money(..., currency_symbol)`.

There are calls to `_format_money` in at least two places:
- Inside `_money_pill` (4 calls, one per direction)
- Inside an action-pill builder function for `company_payment` events (inline f-string)

Apply this pattern to all of them.

#### A1d — Update `_apply_ui_fields` to accept `currency_symbol` and propagate it

Find the function signature:

```python
def _apply_ui_fields(
  event: DailyReportEvent,
  *,
  money_decimals: int,
  notes: list[ActivityNote],
) -> None:
```

Replace with:

```python
def _apply_ui_fields(
  event: DailyReportEvent,
  *,
  money_decimals: int,
  currency_symbol: str,
  notes: list[ActivityNote],
) -> None:
```

Then find the call to `_hero_text_for_event` inside this function:

```python
event.hero_text = _hero_text_for_event(event, money_decimals)
```

Replace with:

```python
event.hero_text = _hero_text_for_event(event, money_decimals, currency_symbol)
```

Also find every call to any action-pill builder function inside `_apply_ui_fields` that itself
calls functions which use `_format_money`. Read the function body and pass `currency_symbol`
through to any such callers.

**Do not change anything else in this function.**

---

### A2 — Update `_snapshot_lines_for_customer` and `_snapshot_lines_for_company`

**File:** `backend/app/services/reports_aggregates.py`

Read the file first.

Find `_snapshot_lines_for_customer` (around line 519):

```python
def _snapshot_lines_for_customer(
  *,
  customer_id: str,
  before: CustomerLedgerState,
  after: CustomerLedgerState,
) -> list[tuple[str, str, str]]:
  ...
  if money_after > 0:
    lines.append((customer_id, "cash_outstanding", f"₪{money_after}"))
```

Add `currency_symbol: str` to the keyword-only parameters:

```python
def _snapshot_lines_for_customer(
  *,
  customer_id: str,
  before: CustomerLedgerState,
  after: CustomerLedgerState,
  currency_symbol: str,
) -> list[tuple[str, str, str]]:
```

Replace `f"₪{money_after}"` with `f"{currency_symbol}{money_after}"`.

Find `_snapshot_lines_for_company` (around line 540). Apply the same pattern:
- Add `currency_symbol: str` to keyword-only parameters.
- Replace `f"₪{money_after}"` with `f"{currency_symbol}{money_after}"`.

**Do not change anything else in this file.**

---

### A3 — Read `currency_code` from settings and pass it through

**File:** `backend/app/routers/reports.py`

Read the file first.

#### A3a — Import the new helper and the default constant

Find the import of `_apply_ui_fields` from `app.services.reports_event_fields`. It currently
imports `_apply_ui_fields` among other names. Add `currency_symbol_for_code` to that same import.

Find the import of `DEFAULT_CURRENCY_CODE` from `app.constants` (or add it if not present).

#### A3b — Read `currency_code` alongside `money_decimals`

There are two places in the file where `money_decimals` is read from settings (around lines 214
and 644). Each looks like:

```python
money_decimals = settings.money_decimals if settings else 2
```

Directly after each one, add:

```python
currency_code = settings.currency_code if settings else DEFAULT_CURRENCY_CODE
currency_symbol = currency_symbol_for_code(currency_code)
```

#### A3c — Pass `currency_symbol` to `_apply_ui_fields`

Find every call to `_apply_ui_fields(` in this file. It currently looks like:

```python
_apply_ui_fields(event, money_decimals=money_decimals, notes=notes)
```

Add `currency_symbol=currency_symbol` to every such call:

```python
_apply_ui_fields(event, money_decimals=money_decimals, currency_symbol=currency_symbol, notes=notes)
```

#### A3d — Pass `currency_symbol` to the snapshot line functions

Find every call to `_snapshot_lines_for_customer(` and `_snapshot_lines_for_company(` in this
file. Each currently passes `customer_id`, `before`, `after` (or `before`, `after` for company).
Add `currency_symbol=currency_symbol` to each call.

**Do not change anything else in this file.**

---

## Part B — Frontend

### B1 — `frontend/app/(tabs)/reports/index.tsx`

Read the file first.

Add `getCurrencySymbol` to the import from `@/lib/money`. The import currently includes
`getCurrencyCode` — if it does, replace that with `getCurrencySymbol`. If `getCurrencyCode` is
not used anywhere else in the file after this change, remove it from the import.

Find `formatMoneySigned` (around line 43):

```ts
const formatMoneySigned = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₪${formatMoney(Math.abs(value))}`;
};
```

Replace with:

```ts
const formatMoneySigned = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${getCurrencySymbol()}${formatMoney(Math.abs(value))}`;
};
```

**Do not change anything else in this file.**

---

### B2 — `frontend/components/reports/DaySummaryBox.tsx`

Read the file first.

Add `import { getCurrencySymbol } from "@/lib/money";` to the imports.

Find the local `formatMoney` helper (around line 8):

```ts
const formatMoney = (v: number) => `₪${Math.abs(Number(v || 0)).toFixed(0)}`;
```

Replace with:

```ts
const formatMoney = (v: number) => `${getCurrencySymbol()}${Math.abs(Number(v || 0)).toFixed(0)}`;
```

**Do not change anything else in this file.**

---

### B3 — `frontend/components/reports/DayPickerStrip.tsx`

Read the file first.

Add `import { getCurrencySymbol } from "@/lib/money";` to the imports.

Find the `netStr` assignment (around line 27):

```ts
const netStr = `${net >= 0 ? "+" : ""}₪${Math.abs(net)}`;
```

Replace with:

```ts
const netStr = `${net >= 0 ? "+" : ""}${getCurrencySymbol()}${Math.abs(net)}`;
```

**Do not change anything else in this file.**

---

### B4 — `frontend/app/customers/index.tsx`

Read the file first.

Add `getCurrencySymbol, getMoneyDecimals` to the import from `@/lib/money`. If the file does
not yet import from `@/lib/money`, add the import line.

Find the dashboard card that hardcodes `$` and `.toFixed(2)` (around line 87):

```tsx
<Text style={styles.cardValue}>${dashboard.totalDebt.toFixed(2)}</Text>
```

Replace with:

```tsx
<Text style={styles.cardValue}>{getCurrencySymbol()}{dashboard.totalDebt.toFixed(getMoneyDecimals())}</Text>
```

Find the customer list row that hardcodes `$` and `.toFixed(2)` (around line 162):

```tsx
${item.money_balance.toFixed(2)} |{" "}
```

Replace with:

```tsx
{getCurrencySymbol()}{item.money_balance.toFixed(getMoneyDecimals())} |{" "}
```

**Do not change anything else in this file.**

---

### B5 — `frontend/app/(tabs)/add/index.tsx`

Read the file first.

The file already imports `getCurrencyCode` from `@/lib/money`. Add `getCurrencySymbol` to
that same import. After making the changes below, if `getCurrencyCode` is no longer used
anywhere in the file, remove it from the import.

Find the `moneyLabel` computation (around line 1500):

```ts
const moneyLabel =
  money > 0
    ? `Debts on customer ${money.toFixed(0)} ${getCurrencyCode()}`
    : money < 0
      ? `Credit for customer ${Math.abs(money).toFixed(0)} ${getCurrencyCode()}`
      : "Settled";
```

Replace with:

```ts
const moneyLabel =
  money > 0
    ? `Debts on customer ${money.toFixed(0)} ${getCurrencySymbol()}`
    : money < 0
      ? `Credit for customer ${Math.abs(money).toFixed(0)} ${getCurrencySymbol()}`
      : "Settled";
```

**Do not change anything else in this file.**

---

### B6 — `frontend/components/reports/CompanyBalancesSection.tsx`

Read the file first.

Replace `getCurrencyCode` with `getCurrencySymbol` in the import from `@/lib/money`.

Find the value line (around line 45):

```ts
value: `${formatMoney(Math.abs(moneyNet))} ${getCurrencyCode()}`,
```

Replace with:

```ts
value: `${formatMoney(Math.abs(moneyNet))} ${getCurrencySymbol()}`,
```

**Do not change anything else in this file.**

---

### B7 — `frontend/components/reports/CustomerBalancesSection.tsx`

Read the file first.

Replace `getCurrencyCode` with `getCurrencySymbol` in the import from `@/lib/money`.

Find the value line (around line 60):

```ts
value: entry.label.startsWith("Money") ? `${entry.value} ${getCurrencyCode()}` : `${entry.value} cyl`,
```

Replace with:

```ts
value: entry.label.startsWith("Money") ? `${entry.value} ${getCurrencySymbol()}` : `${entry.value} cyl`,
```

**Do not change anything else in this file.**

---

### B8 — `frontend/app/welcome/index.tsx`

Read the file first.

Add `getCurrencySymbol` to the import from `@/lib/money`. If the file does not yet import from
`@/lib/money`, add the import line.

Find the field label that hardcodes `₪` (around line 234):

```ts
{ key: "cashStart", label: "Starting wallet (₪)", placeholder: "0", unit: "money" },
```

Replace with:

```ts
{ key: "cashStart", label: `Starting wallet (${getCurrencySymbol()})`, placeholder: "0", unit: "money" },
```

Find the review text lines that hardcode `₪` (around lines 290–308). They look like:

```ts
if (companyPayMoneyValue > 0) lines.push(`Debts on distributor: ${companyPayMoneyValue}₪`);
if (companyPayMoneyValue < 0) lines.push(`Credit for distributor: ${Math.abs(companyPayMoneyValue)}₪`);
```

and:

```ts
if (money(state.cashStart) > 0) lines.push(`Wallet balance: ${money(state.cashStart)}₪`);
```

Replace each trailing `₪` with `${getCurrencySymbol()}`. Apply this pattern to every line in
this block that appends a `₪` suffix. Do not change any other text in these lines.

**Do not change anything else in this file.**

---

### B9 — `frontend/lib/reports/utils.ts`

Read the file first.

Add `import { getCurrencySymbol } from "@/lib/money";` to the imports at the top.

Find the `parts` function inside `buildDaySummaryLines` (around line 396). It contains a line
with corrupted Unicode bytes representing a broken `₪` character:

```ts
if (cash !== 0) out.push(`${formatSignedMoney(cash)}\u00c3\u00a2\u00e2\u0082\u00ac\u00c2\u00aa`);
```

Replace with:

```ts
if (cash !== 0) out.push(`${formatSignedMoney(cash)} ${getCurrencySymbol()}`);
```

Also check if there are any other lines in this file with the same corrupted byte sequences
(there is at least one in the `lines.push` label text that starts with an emoji). Find any
other line that contains `\u00c3` or similar corrupted sequences and remove or replace them
appropriately — if the corrupted bytes represent an emoji prefix that is unrecognisable, remove
that prefix entirely, keeping only the label text after the emoji.

**Do not change any other logic in this file.**

---

### B10 — `frontend/components/entry/FieldPair.tsx`

Read the file first.

Add `import { getMoneyDecimals } from "@/lib/money";` to the imports.

Find the `toFixed(2)` call (around line 60):

```ts
return normalized.toFixed(2).replace(/\.?0+$/, "");
```

Replace with:

```ts
return normalized.toFixed(getMoneyDecimals()).replace(/\.?0+$/, "");
```

**Do not change anything else in this file.**

---

### B11 — `frontend/app/(tabs)/account/configuration/expense-categories.tsx`

Read the file first.

Replace `getCurrencyCode` with `getCurrencySymbol` in the import from `@/lib/money`.

Find the format line (around line 42):

```ts
return `${value.toFixed(getMoneyDecimals())} ${getCurrencyCode()}`;
```

Replace with:

```ts
return `${value.toFixed(getMoneyDecimals())} ${getCurrencySymbol()}`;
```

**Do not change anything else in this file.**

---

## Verification

### Backend
```bash
cd backend && python -c "from app.routers.reports import router; from app.services.reports_event_fields import currency_symbol_for_code; print('OK')"
```
Expected: `OK`.

### Frontend
```bash
cd frontend && npm run build
```
Expected: 0 TypeScript errors.

### Manual checks
1. With currency set to ILS — day report strip, summary box, and activity cards all show `₪`.
2. With currency set to USD — all of the above show `$`.
3. Customer list total debt and balance rows show the correct symbol and decimal count.
4. Add screen customer balance preview labels show the correct symbol.
5. Welcome/setup review screen shows the correct symbol in wallet and debt lines.
