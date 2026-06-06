# Frontend Features

## 1. Routing

| Activity | Daily Report | Add Entry Tab | Customer Review |
|---|---|---|---|
| `replacement` — Replace | Yes | Customer tab | Yes |
| `sell_full` — Sell full | Yes | Customer tab | Yes |
| `buy_empty_from_customer` — Buy empties | Yes | Customer tab | Yes |
| `payment_from_customer` — Payment from customer | Yes | Customer tab | Yes |
| `payment_to_customer` — Payment to customer | Yes | Customer tab | Yes |
| `customer_return_empties` — Empties from customer | Yes | Customer tab | Yes |
| `adjust_customer_balance` — Adjust customer balance | No | Customer tab | Yes |
| `refill` — Refill | Yes | Company tab | No |
| `buy_full_from_company` — Buy fulls | Yes | Company tab | No |
| `payment_to_company` — Payment to company | Yes | Company tab | No |
| `payment_from_company` — Payment from company | Yes | Company tab | No |
| `dist_return_empties` — Empties to company | Yes | Company tab | No |
| `adjust_company_balance` — Adjust company balance | No | Company tab | No |
| `expense` — Expense | Yes | Money tab | No |
| `bank_to_wallet` — Bank to wallet | Yes | Money tab | No |
| `wallet_to_bank` — Wallet to bank | Yes | Money tab | No |
| `adjust_wallet` — Adjust wallet | Yes | Ledger tab | No |
| `adjust_inventory` — Adjust inventory | Yes | Ledger tab | No |

---

## 2. Filters

Filters are dynamic and data-driven — an option only appears if matching data exists. Fixed order always preserved even when groups are absent.

```
customer  (display label TBD)
  ├─ Replace                    → 12kg debt/credit / 48kg debt/credit / money debt/credit
  ├─ Payment from customer
  ├─ Payment to customer
  ├─ Empties from customer      → 12kg / 48kg
  ├─ Adjust customer balance    → 12kg / 48kg / money
  ├─ Sell full                  → 12kg debt/credit / 48kg debt/credit / money debt/credit
  └─ Buy empties                → 12kg / 48kg

company  (display label TBD)
  ├─ Refill                     → 12kg debt/credit / 48kg debt/credit / money debt/credit
  ├─ Payment to company
  ├─ Payment from company
  ├─ Empties to company         → 12kg / 48kg
  ├─ Buy fulls                  → money debt/credit
  └─ Adjust company balance     → 12kg / 48kg / money

expenses  (display label TBD)
  ├─ Expense                    → [expense category names e.g. Food / Fuel / ...] (data-driven)
  ├─ Bank to wallet
  └─ Wallet to bank

ledger  (display label TBD)
  ├─ Adjust wallet
  └─ Adjust inventory           → 12kg full / 12kg empty / 48kg full / 48kg empty
```

### Filter Placement and Behavior Per Page

| Page | Filter placement | How shown | Active filter indicator |
|---|---|---|---|
| Daily Report | Inline, below date picker, above activity list | Always visible, no button | N/A — always visible |
| Add Entry → Customer tab | Behind a filter button | Tap button to open panel | Button shows badge/dot when filters are active |
| Add Entry → Company tab | Behind a filter button | Tap button to open panel | Button shows badge/dot when filters are active |
| Add Entry → Money tab | Behind a filter button | Tap button to open panel | Button shows badge/dot when filters are active |
| Add Entry → Ledger tab | Behind a filter button | Tap button to open panel | Button shows badge/dot when filters are active |
| Customer Review → history | Behind a filter button | Tap button to open panel | Button shows badge/dot when filters are active |

### Level Stripping Per Page

| Page | Levels shown |
|---|---|
| Daily Report | Full 3 levels |
| Add Entry → Customer tab | Levels 2–3 only (group chip hidden) |
| Add Entry → Company tab | Levels 2–3 only |
| Add Entry → Money tab | Levels 2–3 only |
| Add Entry → Ledger tab | Levels 2–3 only |
| Customer Review → history | Levels 2–3 only (customer kinds only) |

### Rules

- Fixed order preserved even when groups are absent — same at every sub-level
- A filter option only appears when matching data exists in the current view
- Expense category sub-filters are data-driven from actual expense categories recorded — only categories present in the data are shown

---

## 3. Activity Date Restrictions

### Rule 1 — App initialization date

No activity of any kind may be created with a date earlier than the date the app was initialized (tenant setup date).

- The save button is disabled and the date field shows an inline error if the selected date is before the initialization date
- If the user attempts to save anyway, a clear message is shown: **"You cannot add activities before the app was set up."**
- This applies to all 18 activity kinds on all entry surfaces

### Rule 2 — Customer creation date

No customer activity may be created with a date earlier than the date that customer was created in the app.

- The save button is disabled and the date field shows an inline error if the selected date is before the customer's creation date
- If the user attempts to save anyway, a clear message is shown: **"You cannot add activities before this customer was created."**
- This applies to all customer-scoped activity kinds: `replacement`, `sell_full`, `buy_empty_from_customer`, `payment_from_customer`, `payment_to_customer`, `customer_return_empties`, `adjust_customer_balance`

### Validation behavior

| Trigger | Behavior |
|---|---|
| User picks an invalid date | Date field turns red, inline error shown immediately |
| User tries to save with an invalid date | Save button is disabled — cannot be tapped |
| Both rules violated at the same time | Show the more restrictive constraint (customer creation date if it's later than app init date) |

---

## 4. App Start

The app must always open on the **Daily Report** — not the dashboard or any other screen.

- Current behavior: app opens on the dashboard *(needs to be fixed)*
- Required behavior: on every cold launch, the user lands directly on the Daily Report for today's date
- This applies regardless of where the user was when they last closed the app — session state is not restored

---

## 4. Navigation After Save (Highlights)

**App start:** The app always opens on the Daily Report.

| Saved activity | Navigate to | Highlight |
|---|---|---|
| Any kind that appears on Daily Report | Daily Report | Date picker + saved card |
| `adjust_customer_balance` | Add Entry → Customer tab | Saved card |
| `adjust_company_balance` | Add Entry → Company tab | Saved card |

### Highlight Rules

- The highlight is shown once — as soon as the user sees the highlighted card it is considered seen
- If the user navigates away to another tab or page and comes back, the highlight is gone
- The highlight does not persist across sessions

---

## 4. Activity Cards

### Card Source of Truth

Card design is agreed on the **Add Entry pages first**. The same card component is reused on Daily Report and Customer Review. Adjustments for those surfaces are agreed separately after.

---

### Card Visibility Per Surface

"Customer Review kinds" and "Customer kinds" are the same set — no difference.

| Surface | Which kinds appear |
|---|---|
| Daily Report | All 18 except `adjust_customer_balance` and `adjust_company_balance` |
| Add Entry → Customer tab | Customer filterGroup kinds |
| Add Entry → Company tab | Company filterGroup kinds |
| Add Entry → Money tab | Expenses filterGroup kinds |
| Add Entry → Ledger tab | Ledger filterGroup kinds |
| Customer Review | Customer filterGroup kinds (same as Customer tab) |

---

### A. Balance Rows

**Which cards show balance rows:** every customer card and every company card. Expense, wallet, ledger, and bank cards do not.

**Three rows per card:**

| Row | Label |
|---|---|
| Money | `"Money balance"` |
| 12kg cylinders | `"12kg balance"` |
| 48kg cylinders | `"48kg balance"` |

**Hide rule** (from `balanceTransitions.ts → formatTransitionRow`):
A row is hidden only when both `before` and `after` are display-zero (`< 0.01`). All other combinations show the row.

**Text format per state:**

| State | Text |
|---|---|
| No change, non-zero | `"Money balance: unchanged — debts 50.00 ₪ (on customer)"` |
| Was zero → now has value | `"Money balance: Settled → 50 debts (on customer)"` |
| Was non-zero → now zero | `"Money balance: debts 50.00 ₪ → Settled"` |
| Both non-zero, changed | `"Money balance: debts 50.00 ₪ → 30 debts (on customer)"` |

**Wording per scope** (from `wording.ts`):

| Scope | Positive value | Negative value | Zero |
|---|---|---|---|
| Customer money | `Debts on customer {value}` | `Credit for customer {value}` | `Settled` |
| Customer cylinders | `Debts on customer {n}` | `Credit for customer {n}` | `Settled` |
| Company money | `Debts on distributor {value}` | `Credit for distributor {value}` | `Settled` |
| Company cylinders | `Credit for distributor {n}` | `Debts on distributor {n}` | `Settled` |

**Colour intent logic** (from `balanceTransitions.ts → formatTransitionPills`):

| Condition | Intent |
|---|---|
| `\|before\| ≈ \|after\|` (no change) | `neutral` |
| Company cylinders: `after > before` | `good` |
| Company cylinders: `after < before` | `bad` |
| All other: `\|after\| < \|before\|` (debt shrinking) | `good` |
| All other: `\|after\| > \|before\|` (debt growing) | `bad` |

**Pill colours** (from `SlimActivityRow.tsx`):

Current code has 2 visual states — `bad` and `neutral` look identical (both use scoped color). Proposed: adopt 3-state scheme.

| Intent | Background | Border | Text |
|---|---|---|---|
| `good` | `#f0fdf4` | `#86efac` | `#15803d` — green |
| `bad` | `#fee2e2` | `#fca5a5` | `#b91c1c` — red *(proposed, currently not distinct)* |
| `neutral` | scoped fallback | scoped fallback | scoped fallback |

**Scoped fallback colors** (used for `neutral`):

| Scope | Background | Border | Text |
|---|---|---|---|
| Customer | `#f0f9ff` | `#7dd3fc` | `#0369a1` — blue |
| Company | `#fff7ed` | `#fdba74` | `#c2410c` — orange |
| Money | `#f0fdfa` | `#5eead4` | `#0f766e` — teal |
| Ledger | `#f8fafc` | `#cbd5e1` | `#475569` — gray |

**Centralized in:** `frontend/lib/balanceTransitions.ts` + `frontend/lib/wording.ts`

---

### B. Ledger Boxes on Expand — Daily Report Only

| Canonical kind | Ledger boxes shown |
|---|---|
| `replacement` | full 12kg + empty 12kg + wallet (selected gas size only) |
| `sell_full` | full 12kg or full 48kg + wallet |
| `buy_empty_from_customer` | empty 12kg or empty 48kg + wallet |
| `payment_from_customer` | wallet |
| `payment_to_customer` | wallet |
| `customer_return_empties` | empty 12kg + empty 48kg |
| `refill` | full 12kg + empty 12kg + full 48kg + empty 48kg + wallet |
| `buy_full_from_company` | full 12kg + full 48kg + wallet |
| `payment_to_company` | wallet |
| `payment_from_company` | wallet |
| `dist_return_empties` | empty 12kg + empty 48kg |
| `expense` | wallet |
| `bank_to_wallet` | wallet |
| `wallet_to_bank` | wallet |
| `adjust_wallet` | wallet |
| `adjust_inventory` | 12kg full + 12kg empty + 48kg full + 48kg empty |

---

### C. Before / After Continuity

Testing requirement, not a spec item. After each save, the `after` of the previous card must equal the `before` of the next card across all ledger dimensions — including hidden rows.

---

### D. Labels and Wording — Centralized

| File | What it provides |
|---|---|
| `frontend/lib/activityKindMeta.ts` | `ACTIVITY_KIND_META[kind].label` — kind display name |
| `frontend/lib/wording.ts` | `CUSTOMER_WORDING`, `PAYMENT_DIRECTION_WORDING`, `getBalanceDirectionLabel` — balance row text and direction labels |
| `frontend/lib/balanceTransitions.ts` | `formatBalanceTransitions`, `formatTransitionPills` — balance row text formatting and colour intent |

No hard-coded strings in card components.

---

### E. Paid Amount Badge — Top-Right Corner

`x` = amount paid. `/y` = total due, shown only when paid ≠ total (partial payment).

| Canonical kind | Badge | Colour |
|---|---|---|
| `replacement` | +x / y | green |
| `sell_full` | +x / y | green |
| `buy_empty_from_customer` | −x / y | red |
| `payment_from_customer` | +x | green |
| `payment_to_customer` | −x | red |
| `customer_return_empties` | nothing | — |
| `adjust_customer_balance` | nothing | — |
| `refill` | −x / y | red |
| `buy_full_from_company` | −x / y | red |
| `payment_to_company` | −x | red |
| `payment_from_company` | +x | green |
| `dist_return_empties` | nothing | — |
| `adjust_company_balance` | nothing | — |
| `expense` | −x | red |
| `bank_to_wallet` | +x | green |
| `wallet_to_bank` | −x | red |
| `adjust_wallet` | nothing | — |
| `adjust_inventory` | nothing | — |

---

## 5. Tab UX (Add Entry Pages)

Two levels of tab bars exist on the Add Entry page:

1. **Section tabs** — top-level bar: `Customer` | `Company` | `Money` | `Ledger`
2. **Activity tabs** — second bar inside each section listing the specific activities

### Rules

- Both tab bars must be horizontally scrollable when tabs overflow the screen width
- Must be verified working correctly on all tabs — scrolling overflow is currently broken on at least one tab and needs to be checked across all
- Switching activity tabs resets all field values to their defaults

---

## 6. Icons & Visual Design

> **Design point — to be discussed and agreed on later.**
> Icons, colors, and visual identity across the app will be redesigned. Current icon spec in `activityKindMeta.ts` is a placeholder. Full redesign discussion pending.

---

## 7. Activity Forms

> **Keyboard UX rules — apply to all fields in all forms:**
> - Tapping outside any field closes the keyboard. No Done button.
> - The keyboard must never cover the focused field — the form scrolls to keep the active field visible above the keyboard.

### `replacement` — Replace

**Save validation:** Cannot save unless Installed (12kg or 48kg) > 0.

#### Section 1: Cylinders box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Installed | Yes | Yes | number-pad (integer) |
| Received | Yes | Yes | number-pad (integer) |

**Button below Received — 3-state cycle:**

| State | Button | Received value |
|---|---|---|
| 1 | 🔴 Didn't receive | 0 |
| 2 | 🟢 Receive all | = Installed |
| 3 | ⚫ Pay credit / Pay debts | = Installed + customer cylinder balance |
| back to 1 | 🔴 Didn't receive | 0 |

Default on open: State 1.

#### Section 2: Gas Selling Price box — collapsed by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | No (mirrors Installed) | — | — |
| Gas selling price | Yes | Yes | number-pad (integer) |
| Total | No (auto: Quantity × Gas selling price) | — | — |

#### Section 3: Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Total | No (auto calculated) | — | — |
| Payment | Yes | Yes | decimal-pad |

**Button below Payment — 3-state cycle:**

| State | Button | Payment value |
|---|---|---|
| 1 | 🔴 Didn't pay | 0 |
| 2 | 🟢 Pay all | = Total |
| 3 | ⚫ Pay credit / Pay debts | = Total + customer money balance |
| back to 1 | 🔴 Didn't pay | 0 |

Default on open: State 1.

---

### `refill` — Refill

**Save validation:** Cannot save unless 12kg Buy > 0 OR 48kg Buy > 0.

#### Section 1: Cylinders box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| 12kg Buy | Yes | Yes | number-pad (integer) |
| 12kg Return | Yes | Yes | number-pad (integer) |
| 48kg Buy | Yes | Yes | number-pad (integer) |
| 48kg Return | Yes | Yes | number-pad (integer) |

**Button below 12kg Return — 3-state cycle:**

| State | Button | 12kg Return value |
|---|---|---|
| 1 | 🔴 Didn't return | 0 |
| 2 | 🟢 Return all | = 12kg Buy |
| 3 | ⚫ Pay credit / Pay debts | = 12kg Buy + company 12kg cylinder balance |
| back to 1 | 🔴 Didn't return | 0 |

**Button below 48kg Return — 3-state cycle:**

| State | Button | 48kg Return value |
|---|---|---|
| 1 | 🔴 Didn't return | 0 |
| 2 | 🟢 Return all | = 48kg Buy |
| 3 | ⚫ Pay credit / Pay debts | = 48kg Buy + company 48kg cylinder balance |
| back to 1 | 🔴 Didn't return | 0 |

Default on open: State 1 for both buttons.

#### Section 2: Gas Buying Price 12kg box — collapsed by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | No (mirrors 12kg Buy) | — | — |
| Gas buying price | No (only via price configuration page) | — | Button → price config page |
| Total | No (auto: Quantity × Gas buying price) | — | — |

#### Section 3: Gas Buying Price 48kg box — collapsed by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | No (mirrors 48kg Buy) | — | — |
| Gas buying price | No (only via price configuration page) | — | Button → price config page |
| Total | No (auto: Quantity × Gas buying price) | — | — |

#### Section 4: Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Total | No (auto: 12kg total + 48kg total) | — | — |
| Payment | Yes | Yes | decimal-pad |

**Button below Payment — 3-state cycle:**

| State | Button | Payment value |
|---|---|---|
| 1 | 🔴 Didn't pay | 0 |
| 2 | 🟢 Pay all | = Total |
| 3 | ⚫ Pay credit / Pay debts | = Total + company money balance |
| back to 1 | 🔴 Didn't pay | 0 |

Default on open: State 1.

---

### `payment_from_customer` — Payment from customer

#### Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | number-pad (integer) |

**Steppers:** −100, −50, −10, −5, +5, +10, +50, +100

Default on open: 0.

**Button — 2-state toggle:**

| State | Button | Amount value |
|---|---|---|
| 1 | 🟢 Pay all | 0 — click → amount = customer money balance |
| 2 | 🔴 Didn't pay | = customer money balance — click → amount = 0 |

User can always edit the amount field freely via keyboard regardless of button state.

---

### `payment_to_company` — Payment to company

#### Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | decimal-pad |

**Steppers:** −100, −50, −10, −1, −0.1, −0.01, +0.01, +0.1, +1, +10, +50, +100

Default on open: 0.

**Button — 2-state toggle:**

| State | Button | Amount value |
|---|---|---|
| 1 | 🟢 Pay all | 0 — click → amount = company money balance |
| 2 | 🔴 Didn't pay | = company money balance — click → amount = 0 |

User can always edit the amount field freely via keyboard regardless of button state.

---

### `payment_to_customer` — Payment to customer

#### Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | number-pad (integer) |

**Steppers:** −100, −50, −10, −5, +5, +10, +50, +100

Default on open: 0.

**Button — 2-state toggle:**

| State | Button | Amount value |
|---|---|---|
| 1 | 🟢 Pay all | 0 — click → amount = customer money balance |
| 2 | 🔴 Didn't pay | = customer money balance — click → amount = 0 |

User can always edit the amount field freely via keyboard regardless of button state.

---

### `customer_return_empties` — Empties from customer

#### Cylinders box — expanded by default

Tab selector at the top: **12kg** | **48kg**

- If that cylinder size balance is already settled (= 0), the tab is blurred but still tappable.
- The active tab determines which quantity field is shown below.

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | Yes | Yes | number-pad (integer) |

**Steppers:** −1, +1

Default on open: 0.

**Button — 2-state toggle (per tab):**

| State | Button | Quantity value |
|---|---|---|
| 1 | 🟢 Return all | 0 — click → quantity = customer cylinder balance for selected size |
| 2 | 🔴 Didn't return | = customer cylinder balance — click → quantity = 0 |

User can always edit freely via keyboard regardless of button state.

---

### `dist_return_empties` — Empties to company

#### Section 1: 12kg — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | Yes | Yes | number-pad (integer) |

**Steppers:** −1, +1

Default on open: 0.

**Button — 2-state toggle:**

| State | Button | Quantity value |
|---|---|---|
| 1 | 🟢 Return all | 0 — click → quantity = company 12kg cylinder balance |
| 2 | 🔴 Didn't return | = company 12kg cylinder balance — click → quantity = 0 |

#### Section 2: 48kg — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | Yes | Yes | number-pad (integer) |

**Steppers:** −1, +1

Default on open: 0.

**Button — 2-state toggle:**

| State | Button | Quantity value |
|---|---|---|
| 1 | 🟢 Return all | 0 — click → quantity = company 48kg cylinder balance |
| 2 | 🔴 Didn't return | = company 48kg cylinder balance — click → quantity = 0 |

User can always edit freely via keyboard regardless of button state.

---

### `sell_full` — Sell Full

**Save validation:** Cannot save unless Installed > 0, Iron Price > 0, and Gas Price > 0.

#### Section 1: Cylinders box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Installed | Yes | Yes | number-pad (integer) |

**Steppers:** −1, +1

Default on open: 0.

#### Section 2: Iron Selling Price box — collapsed by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | No (mirrors Installed) | — | — |
| Iron price | Yes | Yes | decimal-pad |
| Total | No (auto: Quantity × Iron price) | — | — |

**Steppers (Iron price):** −20, −5, +5, +20

**Button:** "Update iron price" → navigates to price configuration page.

#### Section 3: Gas Selling Price box — collapsed by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | No (mirrors Installed) | — | — |
| Gas price | Yes | Yes | number-pad (integer) |
| Total | No (auto: Quantity × Gas price) | — | — |

**Steppers (Gas price):** −20, −5, +5, +20

**Button:** "Update gas price" → navigates to price configuration page.

#### Section 4: Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Total | No (auto: Iron total + Gas total) | — | — |
| Payment | Yes | Yes | number-pad (integer) |

**Steppers (Payment):** −20, −5, +5, +20

Default on open: 0.

**Button — 2-state toggle:**

| State | Button | Payment value |
|---|---|---|
| 1 | 🟢 Pay all | 0 — click → payment = Total |
| 2 | 🔴 Didn't pay | = Total — click → payment = 0 |

User can always edit freely via keyboard regardless of button state.

---

### `buy_empty_from_customer` — Buy Empties

**Save validation:** Cannot save unless Received > 0 and Iron Price > 0.

#### Section 1: Cylinders box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Received | Yes | Yes | number-pad (integer) |

**Steppers:** −1, +1

Default on open: 0.

#### Section 2: Iron Buying Price box — collapsed by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | No (mirrors Received) | — | — |
| Iron price | Yes | Yes | number-pad (integer) |
| Total | No (auto: Quantity × Iron price) | — | — |

**Steppers (Iron price):** −20, −5, +5, +20

**Button:** "Update iron price" → navigates to price configuration page.

#### Section 3: Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Total | No (auto: Iron total) | — | — |
| Payment | Yes | Yes | number-pad (integer) |

**Steppers (Payment):** −20, −5, +5, +20

Default on open: 0.

**Button — 2-state toggle:**

| State | Button | Payment value |
|---|---|---|
| 1 | 🟢 Pay all | 0 — click → payment = Total |
| 2 | 🔴 Didn't pay | = Total — click → payment = 0 |

User can always edit freely via keyboard regardless of button state.

---

### `adjust_customer_balance` — Adjust Customer Balance

Pre-seeded from current customer balance on open. Save disabled if no values changed.

#### Section 1: Money balance box — expanded by default

3-chip selector: **Debts on customer** | **Balanced** | **Credit for customer**

Amount field (hidden when Balanced):

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | number-pad (integer) |

**Steppers:** −100, −20, −5, +5, +20, +100

#### Section 2: 12kg balance box — expanded by default

3-chip selector: **Debts on customer** | **Balanced** | **Credit for customer**

Amount field (hidden when Balanced):

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | number-pad (integer) |

**Steppers:** −5, −1, +1, +5

#### Section 3: 48kg balance box — expanded by default

Same as 12kg balance box.

#### Section 4: Reason — free text, optional

---

### `buy_full_from_company` — Buy Fulls

**Save validation:** Cannot save unless 12kg Buy > 0 OR 48kg Buy > 0.

#### Section 1: Cylinders box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| 12kg Buy | Yes | Yes | number-pad (integer) |
| 48kg Buy | Yes | Yes | number-pad (integer) |

**Steppers:** −1, +1

Default on open: 0.

#### Section 2: Iron Buying Price 12kg box — collapsed by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | No (mirrors 12kg Buy) | — | — |
| Iron price | No | — | — |
| Total | No (auto: Quantity × Iron price) | — | — |

**Button:** "Set price" → navigates to price configuration page.

#### Section 3: Iron Buying Price 48kg box — collapsed by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | No (mirrors 48kg Buy) | — | — |
| Iron price | No | — | — |
| Total | No (auto: Quantity × Iron price) | — | — |

**Button:** "Set price" → navigates to price configuration page.

#### Section 4: Gas Buying Price 12kg box — collapsed by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Quantity | No (mirrors 12kg Buy) | — | — |
| Gas buying price | No | — | — |
| Total | No (auto: Quantity × Gas buying price) | — | — |

**Button:** "Set price" → navigates to price configuration page.

#### Section 5: Gas Buying Price 48kg box — collapsed by default

Same as Section 4 for 48kg.

#### Section 6: Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Total | No (auto: sum of all price sections) | — | — |
| Payment | Yes | Yes | decimal-pad |

**Steppers (Payment):** −20, −5, +5, +20

Default on open: 0.

**Button — 2-state toggle:**

| State | Button | Payment value |
|---|---|---|
| 1 | 🟢 Pay all | 0 — click → payment = Total |
| 2 | 🔴 Didn't pay | = Total — click → payment = 0 |

User can always edit freely via keyboard regardless of button state.

---

### `payment_from_company` — Payment from company

#### Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | decimal-pad |

**Steppers:** −100, −50, −10, −1, −0.1, −0.01, +0.01, +0.1, +1, +10, +50, +100

Default on open: 0.

**Button — 2-state toggle:**

| State | Button | Amount value |
|---|---|---|
| 1 | 🟢 Receive all | 0 — click → amount = company money balance |
| 2 | 🔴 Didn't receive | = company money balance — click → amount = 0 |

User can always edit freely via keyboard regardless of button state.

---

### `adjust_company_balance` — Adjust Company Balance

Pre-seeded from current company balance on open. Save disabled if no values changed.

#### Section 1: Money balance box — expanded by default

3-chip selector: **Debts on distributor** | **Balanced** | **Credit for distributor**

Amount field (hidden when Balanced):

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | decimal-pad |

**Steppers:** −100, −50, −20, −5, −1, −0.1, −0.01, +0.01, +0.1, +1, +5, +20, +50, +100

#### Section 2: 12kg balance box — expanded by default

3-chip selector: **Debts on distributor** | **Balanced** | **Credit for distributor**

Amount field (hidden when Balanced):

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | number-pad (integer) |

**Steppers:** −5, −1, +1, +5

#### Section 3: 48kg balance box — expanded by default

Same as 12kg balance box.

#### Section 4: Reason / note — free text, optional

---

### `expense` — Expense

#### Category selector — always visible

Chip/card grid — data-driven from configured expense categories. Only active categories shown. Button to manage categories → navigates to expense categories configuration page.

#### Amount box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | decimal-pad |

**Steppers:** −100, −20, −5, −1, −0.1, −0.01, +0.01, +0.1, +1, +5, +20, +100

Default on open: 0.

#### Note — free text, optional

---

### `bank_to_wallet` — Bank to Wallet

#### Money box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes | Yes | number-pad (integer) |

**Steppers:** −100, −20, −5, +5, +20, +100

Default on open: 0.

#### Note — free text, optional

---

### `wallet_to_bank` — Wallet to Bank

Same form as `bank_to_wallet`.

---

### `adjust_wallet` — Adjust Wallet

#### Amount box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Amount | Yes (allows negative) | Yes | number-pad (integer) |

**Steppers:** −100, −20, −5, +5, +20, +100

Default on open: 0.

#### Reason — free text, optional

---

### `adjust_inventory` — Adjust Inventory

Fields represent deltas (positive = add, negative = remove).

#### Section 1: 12kg box — expanded by default

| Field | Editable | Steppers | Keyboard |
|---|---|---|---|
| Full | Yes (allows negative) | Yes | number-pad (integer) |
| Empty | Yes (allows negative) | Yes | number-pad (integer) |

**Steppers:** −1, +1

Default on open: 0.

#### Section 2: 48kg box — expanded by default

Same as 12kg box.

#### Reason — free text, optional
