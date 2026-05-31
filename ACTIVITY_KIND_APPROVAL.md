# Activity Kind Approval Document

This file is the owner approval record. Once all sections are approved, it becomes the binding contract for T2–T9 implementation.

---

## Gate 1 — Canonical Activity Kinds

One master table. Labels, icon specs, colors, filter groups, and scopes are all here.
Report subtype key = canonical kind for every activity. No exceptions.

### Group Colors

| Group | Color |
|---|---|
| Customer activities | `#0ea5e9` |
| Company activities | `#f97316` |
| Money / wallet activities | `#6366f1` |
| Ledger / internal | `#64748b` |

### Icon Spec Rules

Icons are assembled by `ActivityIcon.tsx` from a centralized `IconSpec` per kind — no icon logic lives in display components.

```
arrow values : swap-h | swap-v | in-h | out-h | in-v | out-v | none
symbol values: money | full-cyl | empty-cyl | receipt | wallet | cube | edit | null

Symbol position (auto-derived from arrow):
  incoming (in-h, in-v)  → [symbol] [arrow]   e.g.  💰 →
  outgoing (out-h, out-v) → [arrow] [symbol]   e.g.  ← 💰
  swap / none             → no symbol

Cylinder icons:
  full-cyl  = custom SVG of a filled gas cylinder (solid body, looks like a real LPG tank)
  empty-cyl = custom SVG of an outlined gas cylinder (same shape, hollow/empty appearance)
  Both are custom assets — not available in Ionicons. Designed and added in T4.
```

### Activity Table

**Customer activities — `#0ea5e9`**

| # | Canonical Kind | English Label | Arrow | Symbol | Visual | Filter Group | Scope |
|---|---|---|---|---|---|---|---|
| 1 | `replacement` | Replace | `swap-h` | none | `↔` | customer | customer |
| 2 | `sell_full` | Sell full | `out-h` | `full-cyl` | `← [full cylinder]` | customer | customer |
| 3 | `buy_empty_from_customer` | Buy empties | `in-h` | `empty-cyl` | `[empty cylinder] →` | customer | customer |
| 4 | `payment_from_customer` | Payment from customer | `in-h` | `money` | `💰 →` | customer | customer |
| 5 | `payment_to_customer` | Payment to customer | `out-h` | `money` | `← 💰` | customer | customer |
| 6 | `customer_return_empties` | Empties from customer | `in-h` | `empty-cyl` | `[empty cylinder] →` | customer | customer |
| 7 | `adjust_customer_balance` | Adjust customer balance | `none` | `edit` | `🔧` | customer | customer |

**Company activities — `#f97316`**

| # | Canonical Kind | English Label | Arrow | Symbol | Visual | Filter Group | Scope |
|---|---|---|---|---|---|---|---|
| 8 | `refill` | Refill | `swap-v` | none | `↕` | company | company |
| 9 | `dist_return_empties` | Empties to company | `out-v` | `empty-cyl` | `↑ [empty cylinder]` | company | company |
| 10 | `buy_full_from_company` | Buy fulls | `in-v` | `full-cyl` | `[full cylinder] ↓` | company | company |
| 11 | `payment_to_company` | Payment to company | `out-v` | `money` | `↑ 💰` | company | company |
| 12 | `payment_from_company` | Payment from company | `in-v` | `money` | `💰 ↓` | company | company |
| 13 | `adjust_company_balance` | Adjust company balance | `none` | `edit` | `🔧` | company | company |

**Money / wallet activities — `#6366f1`**

| # | Canonical Kind | English Label | Arrow | Symbol | Visual | Filter Group | Scope |
|---|---|---|---|---|---|---|---|
| 14 | `expense` | Expense | `out-h` | `receipt` | `← 🧾` | expenses | wallet |
| 15 | `bank_to_wallet` | Bank to wallet | `in-v` | `money` | `💰 ↓` | expenses | wallet |
| 16 | `wallet_to_bank` | Wallet to bank | `out-v` | `money` | `↑ 💰` | expenses | wallet |

**Ledger / internal — `#64748b`**

| # | Canonical Kind | English Label | Arrow | Symbol | Visual | Filter Group | Scope |
|---|---|---|---|---|---|---|---|
| 17 | `adjust_inventory` | Adjust inventory | `none` | `cube` | `📦` | ledger | inventory |
| 18 | `adjust_wallet` | Adjust wallet | `none` | `wallet` | `👜` | ledger | wallet |

STATUS: APPROVED — 2026-05-31
Cylinder icons (full-cyl, empty-cyl) must look like real LPG gas cylinders, not circles. Custom SVG assets to be designed and added in T4.

---

## Gate 2 — Legacy Aliases

Every old name that must be removed by T9. Implementation code must never introduce new aliases after T1.

| Legacy Alias | Maps To | Removed In |
|---|---|---|
| `order` (mode=replacement) | `replacement` | T9 |
| `order` (mode=sell_iron) | `sell_full` | T9 |
| `order` (mode=buy_iron) | `buy_empty_from_customer` | T9 |
| `collection_money` | `payment_from_customer` | T9 |
| `collection_payout` | `payment_to_customer` | T9 |
| `collection_empty` | `customer_return_empties` | T9 |
| `customer_adjust` | `adjust_customer_balance` | T9 |
| `company_payment` (direction=out) | `payment_to_company` | T9 |
| `company_payment` (direction=in) | `payment_from_company` | T9 |
| `company_adjustment` | `adjust_company_balance` | T9 |
| `company_buy_iron` | `buy_full_from_company` | T9 |
| `company_buy_full` | `buy_full_from_company` | T9 |
| `company_return_empties` | `dist_return_empties` | T9 |
| `buy_iron` | `buy_empty_from_customer` | T9 |
| `cash_adjust` | `adjust_wallet` | T9 |
| `adjust` | `adjust_inventory` | T9 |
| `bank_deposit` (direction=bank_to_wallet) | `bank_to_wallet` | T8 |
| `bank_deposit` (direction=wallet_to_bank) | `wallet_to_bank` | T8 |
| `init` | no canonical kind — remove frontend handlers in T9 | T9 |
| `init_balance` | no canonical kind — remove frontend handlers in T9 | T9 |
| `init_credit` | no canonical kind — remove frontend handlers in T9 | T9 |
| `init_return` | no canonical kind — remove frontend handlers in T9 | T9 |

Decision: init aliases were previously visible on the daily report but were removed because they were problematic. The backend currently absorbs `system_init` ledger entries silently into the opening running balance — they never appear as visible events. The 4 frontend aliases are dead code and are removed in T9.

A future ticket (T10) will redesign opening balance visibility properly with 3 scoped kinds: `init_customer`, `init_company`, `init_inventory`. Addressed after T9.

STATUS: APPROVED — 2026-05-31

---

## Gate 3 — Balance Wording

Each balance field shows as a transition line when it changes. Four output patterns:

```
{label}: Settled → {amount} {dir} {scope}        — when going from zero to non-zero
{label}: {dir} {amount} → Settled                 — when going to zero
{label}: {dir} {amount} → {amount} {dir} {scope}  — both sides non-zero and changed
{label}: unchanged — {dir} {amount} {scope}        — non-zero but unchanged
```

Labels: `Money balance`, `12kg balance`, `48kg balance`

Direction words and scope suffix per field:

| Scope | Field | Positive direction word | Negative direction word | Scope suffix (positive) | Scope suffix (negative) |
|---|---|---|---|---|---|
| customer | money | `debts` | `credit` | `(on customer)` | `(for customer)` |
| customer | cyl_12 | `debts` | `credit` | `(on customer)` | `(for customer)` |
| customer | cyl_48 | `debts` | `credit` | `(on customer)` | `(for customer)` |
| company | money | `debts` | `credit` | `(on distributor)` | `(for distributor)` |
| company | cyl_12 | `credit` | `debts` | `(for distributor)` | `(on distributor)` |
| company | cyl_48 | `credit` | `debts` | `(for distributor)` | `(on distributor)` |

Note: company cylinders are flipped — positive means company owes distributor full cylinders (credit for distributor), negative means distributor owes company empty cylinders.

Concrete examples:

**Customer money**
- `Money balance: Settled → 100 SYP debts (on customer)` — customer now owes money
- `Money balance: debts 100 SYP → 50 SYP debts (on customer)` — debt reduced
- `Money balance: debts 100 SYP → 50 SYP credit (for customer)` — flipped from debt to credit
- `Money balance: debts 100 SYP → Settled` — debt fully paid
- `Money balance: unchanged — debts 100 SYP (on customer)` — unchanged but non-zero

**Customer 12kg**
- `12kg balance: Settled → 2 debts (on customer)` — customer now owes empties
- `12kg balance: debts 2 → 1 debts (on customer)` — partially returned
- `12kg balance: debts 2 → Settled` — all empties returned

**Company money**
- `Money balance: Settled → 100 SYP debts (on distributor)` — distributor now owes company
- `Money balance: debts 100 SYP → 50 SYP debts (on distributor)` — partially paid
- `Money balance: debts 100 SYP → Settled` — fully paid

**Company 12kg**
- `12kg balance: Settled → 2 credit (for distributor)` — company now owes distributor full cylinders
- `12kg balance: credit 2 → 1 credit (for distributor)` — partially delivered
- `12kg balance: credit 2 → Settled` — all cylinders delivered

STATUS: APPROVED — 2026-05-31

---

## Gate 4 — Bank Split Migration

| Decision | Value |
|---|---|
| `bank_deposit` stops being emitted | T8 |
| `transfer_direction` field removed from backend | T9 |
| Compatibility window | None — T8 and T9 ship the same day. |

STATUS: APPROVED — 2026-05-31

---

## Gate 5 — DB Ledger Source Repair

| Item | Decision |
|---|---|
| Migration `n1_rename_activity_kinds.py` incorrectly renamed `ledger_entries.source_type` | `cash_adjust → adjust_wallet` and `inventory_adjust → adjust_inventory` (wrong) |
| Repair migration `n2_repair_ledger_source_types.py` reverses only those two changes | Does NOT touch `customer_transactions.kind` or `company_transactions.kind` |
| Ships as | Standalone migration, before any other DB ticket |

STATUS: APPROVED — 2026-05-31
