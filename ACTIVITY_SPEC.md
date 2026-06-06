# Activity Specification

This is the canonical activity reference for `gas_app_v2`.

It replaces `ACTIVITY_KIND_APPROVAL.md` and `ACTIVITY_REFERENCE.md`. Code is the
source of truth when this document and implementation disagree.

Primary code sources:
- Activity kind list: `frontend/lib/activityKinds.ts`
- Labels, colors, filter groups, scopes, and icon specs: `frontend/lib/activityKindMeta.ts`
- Activity icon rendering: `frontend/components/reports/ActivityIcon.tsx`
- Daily Report labels and hero text: `backend/app/services/reports_event_fields.py`
- Add-screen/list adapter labels and hero text: `frontend/lib/activityAdapter.ts`
- Add-screen/list legacy labels: `frontend/lib/eventLabels.ts`

## Source-Of-Truth Policy

- `ActivityKind` is the frontend canonical activity identity type.
- Daily Report API events use canonical `event_type` values for visible activities.
- `ledger_entries.source_type` is a stable ledger discriminator, not an activity kind.
- `system_init` ledger entries are absorbed into opening running balances and are not visible daily-report activities.
- Opening customer balances are represented as customer balance adjustments when non-zero; they are not a separate canonical activity kind.
- Bank transfers are `bank_to_wallet` or `wallet_to_bank`; `bank_deposit` is not a visible activity kind.

## Canonical Activity Kinds

The app has 18 canonical activity kinds.

| # | Canonical kind | Canonical label | Filter group | Scope |
|---|---|---|---|---|
| 1 | `replacement` | Replace | customer | customer |
| 2 | `sell_full` | Sell full | customer | customer |
| 3 | `buy_empty_from_customer` | Buy empties | customer | customer |
| 4 | `payment_from_customer` | Payment from customer | customer | customer |
| 5 | `payment_to_customer` | Payment to customer | customer | customer |
| 6 | `customer_return_empties` | Empties from customer | customer | customer |
| 7 | `adjust_customer_balance` | Adjust customer balance | customer | customer |
| 8 | `refill` | Refill | company | company |
| 9 | `dist_return_empties` | Empties to company | company | company |
| 10 | `buy_full_from_company` | Buy fulls | company | company |
| 11 | `payment_to_company` | Payment to company | company | company |
| 12 | `payment_from_company` | Payment from company | company | company |
| 13 | `adjust_company_balance` | Adjust company balance | company | company |
| 14 | `adjust_inventory` | Adjust inventory | ledger | inventory |
| 15 | `adjust_wallet` | Adjust wallet | ledger | wallet |
| 16 | `expense` | Expense | expenses | wallet |
| 17 | `bank_to_wallet` | Bank to wallet | expenses | wallet |
| 18 | `wallet_to_bank` | Wallet to bank | expenses | wallet |

Group colors from `ACTIVITY_KIND_META`:

| Group | Color |
|---|---|
| customer | `#0ea5e9` |
| company | `#f97316` |
| expenses | `#6366f1` |
| ledger | `#64748b` |

## Icons

Icons are rendered by `ActivityIcon.tsx` from each kind's `IconSpec`.

Arrow values:
`swap-h`, `swap-v`, `in-h`, `out-h`, `in-v`, `out-v`, `none`

Symbol values:
`money`, `full-cyl`, `empty-cyl`, `receipt`, `wallet`, `cube`, `edit`,
`bank-to-wallet`, `wallet-to-bank`, `null`

| Canonical kind | Arrow | Symbol |
|---|---|---|
| `replacement` | `swap-h` | `null` |
| `sell_full` | `out-h` | `full-cyl` |
| `buy_empty_from_customer` | `in-h` | `empty-cyl` |
| `payment_from_customer` | `in-h` | `money` |
| `payment_to_customer` | `out-h` | `money` |
| `customer_return_empties` | `in-h` | `empty-cyl` |
| `adjust_customer_balance` | `none` | `edit` |
| `refill` | `swap-v` | `null` |
| `dist_return_empties` | `out-v` | `empty-cyl` |
| `buy_full_from_company` | `in-v` | `full-cyl` |
| `payment_to_company` | `out-v` | `money` |
| `payment_from_company` | `in-v` | `money` |
| `adjust_company_balance` | `none` | `edit` |
| `adjust_inventory` | `none` | `cube` |
| `adjust_wallet` | `none` | `wallet` |
| `expense` | `none` | `receipt` |
| `bank_to_wallet` | `none` | `bank-to-wallet` |
| `wallet_to_bank` | `none` | `wallet-to-bank` |

Renderer behavior:
- `full-cyl` is a custom filled-cylinder SVG treatment.
- `empty-cyl` is the same cylinder outline without fill.
- `money` is a banknote with a centered dollar symbol.
- `bank-to-wallet` and `wallet-to-bank` are dedicated bank/wallet mini-symbols, not generic money arrows.
- Unknown or non-canonical event types render a fallback icon using the provided row color.

## Labels

Canonical labels come from `ACTIVITY_KIND_META` and backend `_EVENT_LABELS`.
Some Add-screen/list labels still use shorter operational labels from `EVENT_LABELS`.

| Canonical kind | Canonical/Daily Report label | Add-screen/list label when different |
|---|---|---|
| `replacement` | Replace | Replacement |
| `sell_full` | Sell full | Sold full |
| `buy_empty_from_customer` | Buy empties | Bought empty |
| `payment_from_customer` | Payment from customer | Customer paid |
| `payment_to_customer` | Payment to customer | Paid customer |
| `customer_return_empties` | Empties from customer | Returned empties |
| `adjust_customer_balance` | Adjust customer balance | Balance adjustment |
| `refill` | Refill | Same |
| `dist_return_empties` | Empties to company | Returned empties |
| `buy_full_from_company` | Buy fulls | Bought full |
| `payment_to_company` | Payment to company | Paid company |
| `payment_from_company` | Payment from company | Company paid |
| `adjust_company_balance` | Adjust company balance | Balance adjustment |
| `adjust_inventory` | Adjust inventory | Inventory adjustment |
| `adjust_wallet` | Adjust wallet | Wallet adjustment |
| `expense` | Expense | Same |
| `bank_to_wallet` | Bank to wallet | Bank -> Wallet in adapter cards |
| `wallet_to_bank` | Wallet to bank | Wallet -> Bank in adapter cards |

## Hero Text

Daily Report API hero text is generated by `_hero_text_for_event()`.
Add-screen/list card hero text is generated by `activityAdapter.ts` and can differ.

| Canonical kind | Daily Report hero text | Add/list adapter differences |
|---|---|---|
| `replacement` | `Installed {installed}x{gas}` when installed is non-zero | May append ` | Received {received} empties` |
| `sell_full` | `Sold {installed}x{gas}` | Same pattern |
| `buy_empty_from_customer` | `Bought {qty}x{gas}` | Appends ` empties` |
| `payment_from_customer` | `Payment from customer {amount}` or `Payment from customer` | `Payment {amount}` |
| `payment_to_customer` | `Payment to customer {amount}` or `Payment to customer` | `Payout {amount}` |
| `customer_return_empties` | `Returned {qty}x{gas} empties` or `Returned empties` | Same pattern |
| `adjust_customer_balance` | Falls back to label | Adapter hero text is `null` |
| `refill` | `Bought {buy12}x12kg | {buy48}x48kg` when quantities exist | Adapter can include `Buy ...` and `Return ...` parts |
| `dist_return_empties` | `Returned {return12}x12kg | {return48}x48kg empties to company` or `Returned empties` | Adapter may use `Return ...` parts |
| `buy_full_from_company` | `Bought {buy12}x12kg | {buy48}x48kg` | Adapter uses `Buy ...` parts |
| `payment_to_company` | `Payment to company {amount}` or `Payment to company` | Adapter hero text is `null` |
| `payment_from_company` | `Payment from company {amount}` or `Payment from company` | Adapter hero text is `null` |
| `adjust_company_balance` | Falls back to label | Adapter may show `Money {amount} | 12kg {count} | 48kg {count}` |
| `adjust_inventory` | One or more lines like `12kg: full +3 | empty -1`, else `Inventory adjustment` | Same general pattern |
| `adjust_wallet` | `Wallet change: {+/-amount}` or `Wallet adjustment` | Same concept; adapter includes currency symbol in its formatted delta |
| `expense` | Expense category name, else `Expense` | Adapter uses formatted amount as hero text |
| `bank_to_wallet` | `Transferred {amount} to wallet` or `Transferred to wallet` | Adapter uses `Transferred {currency}{amount} to wallet` |
| `wallet_to_bank` | `Transferred {amount} to bank` or `Transferred to bank` | Adapter uses `Transferred {currency}{amount} to bank` |

Money formatting depends on system currency settings and money decimal settings.

## Legacy Aliases And Migration Decisions

Legacy aliases are historical names. New implementation should not introduce them.

| Legacy alias | Canonical meaning |
|---|---|
| `order` with replacement mode | `replacement` |
| `order` with sell-full mode | `sell_full` |
| `order` with buy-empty mode | `buy_empty_from_customer` |
| `collection_money` | `payment_from_customer` |
| `collection_payout` | `payment_to_customer` |
| `collection_empty` | `customer_return_empties` |
| `customer_adjust` | `adjust_customer_balance` |
| `company_payment` with outgoing direction | `payment_to_company` |
| `company_payment` with incoming direction | `payment_from_company` |
| `company_adjustment` | `adjust_company_balance` |
| `company_buy_iron` | `buy_full_from_company` |
| `company_buy_full` | `buy_full_from_company` |
| `company_return_empties` | `dist_return_empties` |
| `buy_iron` | Context-dependent legacy buy-empty/buy-full wording |
| `cash_adjust` | `adjust_wallet` |
| `adjust` | `adjust_inventory` |
| `bank_deposit` with bank-to-wallet direction | `bank_to_wallet` |
| `bank_deposit` with wallet-to-bank direction | `wallet_to_bank` |
| `init`, `init_balance`, `init_credit`, `init_return` | No visible canonical kind |

Bank-transfer decision:
- Backend-visible bank-transfer activities are `bank_to_wallet` and `wallet_to_bank`.
- Dedicated bank-transfer persistence uses `BankTransfer.direction`.
- `bank_deposit` is a route/domain compatibility name, not an activity kind.

Ledger source decision:
- Valid ledger source types are implementation storage labels such as `customer_txn`, `company_txn`, `inventory_adjust`, `expense`, `bank_transfer`, `cash_adjust`, and `system_init`.
- Ledger source types must not be renamed merely to match activity kinds.

## Balance Wording

Balance transition output follows four patterns:

```text
{label}: Settled -> {amount} {direction} {scope}
{label}: {direction} {amount} -> Settled
{label}: {direction} {amount} -> {amount} {direction} {scope}
{label}: unchanged - {direction} {amount} {scope}
```

Labels:
- `Money balance`
- `12kg balance`
- `48kg balance`

Direction words:

| Scope | Component | Positive means | Negative means | Positive suffix | Negative suffix |
|---|---|---|---|---|---|
| customer | money | debts | credit | `(on customer)` | `(for customer)` |
| customer | cyl_12 | debts | credit | `(on customer)` | `(for customer)` |
| customer | cyl_48 | debts | credit | `(on customer)` | `(for customer)` |
| company | money | debts | credit | `(on distributor)` | `(for distributor)` |
| company | cyl_12 | credit | debts | `(for distributor)` | `(on distributor)` |
| company | cyl_48 | credit | debts | `(for distributor)` | `(on distributor)` |

Company cylinder wording is intentionally inverted: positive means the company owes
the distributor full cylinders; negative means the distributor owes the company
empty cylinders.

## Activity Behavior Reference

### Replacement

The distributor delivers full cylinders and collects empties. The customer may pay
all or part of the total.

Changes:
- Customer money balance changes by unpaid amount.
- Customer cylinder balance changes by installed minus received empties.
- Wallet increases by paid amount.
- Full inventory decreases; empty inventory increases.
- Sold totals increase for the delivered gas type.
- Customer last order and lifetime sold stats update.

Does not change company balances.

### Sell Full

The distributor sells full cylinders without collecting empties.

Changes:
- Customer money balance changes by unpaid amount.
- Wallet increases by paid amount.
- Full inventory decreases.
- Sold totals increase.
- Customer last order and lifetime sold stats update.

Does not change customer cylinder balances or company balances.

### Buy Empties

The distributor buys empty cylinders from a customer.

Changes:
- Customer money balance changes by the difference between total and paid.
- Wallet changes by paid amount according to payment direction.
- Empty inventory increases.
- Customer last order/activity count updates.

Does not change sold totals, full inventory, customer cylinder balances, or company balances.

### Payment From Customer

The customer pays money owed from prior activity.

Changes:
- Customer money balance decreases debt or increases credit.
- Wallet increases.
- Customer activity count updates.

Does not change inventory, sold totals, cylinder balances, or company balances.

### Payment To Customer

The distributor pays money to a customer, usually to return credit.

Changes:
- Customer money balance changes.
- Wallet decreases.
- Customer activity count updates.

Does not change inventory, sold totals, cylinder balances, or company balances.

### Empties From Customer

The customer returns empty cylinders.

Changes:
- Customer cylinder balance changes.
- Empty inventory increases.
- Customer activity count updates.

Does not change wallet, sold totals, full inventory, company balances, or customer money balance.

### Adjust Customer Balance

The distributor manually sets customer money and/or cylinder balances.

Changes:
- Customer money, 12kg, and/or 48kg balances change according to the adjustment.
- Customer list and customer detail balances update.
- Daily Report shows an adjustment event.

Does not change wallet, inventory, sold totals, or company balances.

Opening balance behavior:
- Creating a customer with non-zero opening balances records a customer balance adjustment.
- Creating a customer with all-zero opening balances creates no activity event.

### Refill

The distributor receives full cylinders from the company and may return empties,
paying part or all of the amount owed.

Changes:
- Company money balance changes when not fully paid.
- Company cylinder balances change.
- Wallet changes by paid amount.
- Full inventory increases; empty inventory decreases.

Does not change customer balances or customer activity lists.

### Empties To Company

The distributor returns empty cylinders to the company.

Changes:
- Company cylinder balances change.
- Empty inventory decreases.

Usually does not change wallet or company money balance.
Does not change customer balances or sold totals.

### Buy Fulls

The distributor buys full cylinders from the company as stock.

Changes:
- Company money balance changes when not fully paid.
- Wallet decreases by paid amount.
- Full inventory increases.

Does not change customer balances, sold totals, empty inventory, or company cylinder balances.

### Payment To Company

The distributor pays the company.

Changes:
- Company money balance decreases distributor debt.
- Wallet decreases.

Does not change inventory, sold totals, customer balances, or company cylinder balances.

### Payment From Company

The company pays the distributor.

Changes:
- Company money balance changes.
- Wallet increases.

Does not change inventory, sold totals, customer balances, or company cylinder balances.

### Adjust Company Balance

The distributor manually sets company money and/or cylinder balances.

Changes:
- Company money, 12kg, and/or 48kg balances change.
- Daily Report shows a company adjustment event.

Does not change wallet, inventory, sold totals, or customer balances.

### Adjust Inventory

The distributor manually corrects inventory counts.

Changes:
- Full and/or empty inventory changes for the affected gas type.
- Daily Report top inventory state reflects the before/after values.

Does not change wallet, customer balances, company balances, or sold totals.

### Adjust Wallet

The distributor manually corrects wallet cash.

Changes:
- Wallet increases or decreases by adjustment amount.
- Cash end / net today updates.

Does not change inventory, customer balances, company balances, sold totals, or expense totals.

### Expense

The distributor records a business expense paid from wallet or bank.

Changes:
- Wallet or bank decreases depending on payment source.
- Expense totals increase.
- Daily Report shows the expense category as hero text when available.

Does not change customer balances, company balances, inventory, or sold totals.

### Bank To Wallet

The distributor transfers money from bank into wallet.

Changes:
- Bank decreases.
- Wallet increases.
- Daily Report shows a bank-to-wallet transfer event.

Does not change expense totals, customer balances, company balances, inventory, or sold totals.

### Wallet To Bank

The distributor transfers money from wallet to bank.

Changes:
- Wallet decreases.
- Bank increases.
- Daily Report shows a wallet-to-bank transfer event.

Does not change expense totals, customer balances, company balances, inventory, or sold totals.

## Quick Effects Matrix

| Activity | Customer balances | Company balances | Wallet | Bank | Inventory | Sold totals |
|---|---|---|---|---|---|---|
| Replacement | money + cylinders | no | +paid | no | full down, empty up | up |
| Sell full | money only | no | +paid | no | full down | up |
| Buy empties | money only | no | +/-paid | no | empty up | no |
| Payment from customer | money only | no | +amount | no | no | no |
| Payment to customer | money only | no | -amount | no | no | no |
| Empties from customer | cylinders only | no | no | no | empty up | no |
| Adjust customer balance | money + cylinders | no | no | no | no | no |
| Refill | no | money + cylinders | +/-paid | no | full up, empty down | no |
| Empties to company | no | cylinders | usually no | no | empty down | no |
| Buy fulls | no | money only | -paid | no | full up | no |
| Payment to company | no | money only | -amount | no | no | no |
| Payment from company | no | money only | +amount | no | no | no |
| Adjust company balance | no | money + cylinders | no | no | no | no |
| Adjust inventory | no | no | no | no | +/-adjusted | no |
| Adjust wallet | no | no | +/-delta | no | no | no |
| Expense | no | no | maybe down | maybe down | no | no |
| Bank to wallet | no | no | +amount | -amount | no | no |
| Wallet to bank | no | no | -amount | +amount | no | no |

## Known Display Issues To Verify

These were carried forward from the archived activity reference and should be
verified against current behavior before creating new implementation tickets:

| Activity | Reported issue | Area |
|---|---|---|
| Buy fulls | Add screen card may show false company cylinder transition pills | Add-screen display |
| Adjust company balance | Daily Report card may show incomplete amounts or labels | Daily Report display |
| Payment to/from company | Add screen card may omit company before/after balance pills | Add-screen display |
