# Activity Kind Naming Source of Truth

## Section 1 - Canonical Activity Kinds (18 total)

| # | Canonical Kind | English Label | Description |
|---|---|---|---|
| 1 | `replacement` | Replace | Customer replacement order: distributor installs full cylinders and receives empties. |
| 2 | `sell_full` | Sell full | Customer buys full cylinders without returning empties. |
| 3 | `buy_empty_from_customer` | Buy empties | Distributor buys empty cylinders from a customer. |
| 4 | `payment_from_customer` | Payment from customer | Customer pays money to distributor. |
| 5 | `payment_to_customer` | Payment to customer | Distributor pays money to customer. |
| 6 | `customer_return_empties` | Empties from customer | Customer returns empty cylinders. |
| 7 | `adjust_customer_balance` | Adjust customer balance | Manual customer money or cylinder balance adjustment. |
| 8 | `refill` | Refill | Distributor refills inventory with the company, including buy and return quantities. |
| 9 | `buy_full_from_company` | Buy fulls | Distributor buys new full cylinders from the company. |
| 10 | `payment_to_company` | Payment to company | Distributor pays money to the company. |
| 11 | `payment_from_company` | Payment from company | Company pays money to distributor. |
| 12 | `dist_return_empties` | Empties to company | Distributor returns empty cylinders to the company. |
| 13 | `adjust_company_balance` | Adjust company balance | Manual company money or cylinder balance adjustment. |
| 14 | `adjust_inventory` | Adjust inventory | Manual internal inventory count adjustment. |
| 15 | `adjust_wallet` | Adjust wallet | Manual internal wallet balance adjustment. |
| 16 | `expense` | Expense | Money leaves the wallet for an expense. |
| 17 | `bank_to_wallet` | Bank to wallet | Money transfers from bank into wallet. |
| 18 | `wallet_to_bank` | Wallet to bank | Money transfers from wallet into bank. |

## Section 2 - Namespace Definitions

| Namespace | Values | Location |
|---|---|---|
| `ActivityKind` | 18 canonical strings listed in Section 1 | `frontend/lib/activityKinds.ts` (to be created in T4) |
| `LedgerSourceType` | `customer_txn`, `company_txn`, `inventory_adjust`, `expense`, `cash_adjust`, `system_init` | `backend/app/models.py` |
| `OrderMode` | `replacement`, `sell_iron`, `buy_iron` | `backend/app/schemas/common.py` |
| `TransferDirection` | `wallet_to_bank`, `bank_to_wallet` | backend expense `paid_from` field |
| `UiFilterKind` | filter chip values used in reports screen | `frontend/app/(tabs)/reports/index.tsx` |

Rule: `LedgerSourceType` values are stable discriminators and must never be renamed to match `ActivityKind` values.

## Section 3 - Compatibility Policy

During T1-T8, a single `normalizeEventType()` function is the only place legacy aliases are accepted. All display components must call it before using an event type. In T9, `normalizeEventType()` and all aliases are removed.

## Section 4 - Approval Gate 1: Activity Label Matrix

| Canonical Kind | English Label |
|---|---|
| `replacement` | Replace |
| `sell_full` | Sell full |
| `buy_empty_from_customer` | Buy empties |
| `payment_from_customer` | Payment from customer |
| `payment_to_customer` | Payment to customer |
| `customer_return_empties` | Empties from customer |
| `adjust_customer_balance` | Adjust customer balance |
| `refill` | Refill |
| `buy_full_from_company` | Buy fulls |
| `payment_to_company` | Payment to company |
| `payment_from_company` | Payment from company |
| `dist_return_empties` | Empties to company |
| `adjust_company_balance` | Adjust company balance |
| `adjust_inventory` | Adjust inventory |
| `adjust_wallet` | Adjust wallet |
| `expense` | Expense |
| `bank_to_wallet` | Bank to wallet |
| `wallet_to_bank` | Wallet to bank |

STATUS: NEEDS OWNER APPROVAL

## Section 5 - Approval Gate 2: Activity Metadata Matrix

| Canonical Kind | Label Key (i18n) | Icon (Ionicons) | Color (hex) | Filter Group | Scope |
|---|---|---|---|---|---|
| `replacement` | `activities.replacement.label` | `swap-horizontal-outline` | `#0a7ea4` | customer | customer |
| `sell_full` | `activities.sell_full.label` | `arrow-up-circle-outline` | `#0a7ea4` | customer | customer |
| `buy_empty_from_customer` | `activities.buy_empty_from_customer.label` | `arrow-down-circle-outline` | `#0a7ea4` | customer | customer |
| `payment_from_customer` | `activities.payment_from_customer.label` | `cash-outline` | `#22c55e` | customer | customer |
| `payment_to_customer` | `activities.payment_to_customer.label` | `cash-outline` | `#ef4444` | customer | customer |
| `customer_return_empties` | `activities.customer_return_empties.label` | `refresh-outline` | `#14b8a6` | customer | customer |
| `adjust_customer_balance` | `activities.adjust_customer_balance.label` | `build-outline` | `#64748b` | customer | customer |
| `refill` | `activities.refill.label` | `reload-outline` | `#f97316` | company | company |
| `buy_full_from_company` | `activities.buy_full_from_company.label` | `download-outline` | `#f59e0b` | company | company |
| `payment_to_company` | `activities.payment_to_company.label` | `arrow-up-circle-outline` | `#2563eb` | company | company |
| `payment_from_company` | `activities.payment_from_company.label` | `arrow-down-circle-outline` | `#2563eb` | company | company |
| `dist_return_empties` | `activities.dist_return_empties.label` | `reload-outline` | `#14b8a6` | company | company |
| `adjust_company_balance` | `activities.adjust_company_balance.label` | `build-outline` | `#64748b` | company | company |
| `adjust_inventory` | `activities.adjust_inventory.label` | `cube-outline` | `#64748b` | ledger | inventory |
| `adjust_wallet` | `activities.adjust_wallet.label` | `wallet-outline` | `#64748b` | ledger | wallet |
| `expense` | `activities.expense.label` | `receipt-outline` | `#16a34a` | expenses | wallet |
| `bank_to_wallet` | `activities.bank_to_wallet.label` | `card-outline` | `#0ea5e9` | expenses | wallet |
| `wallet_to_bank` | `activities.wallet_to_bank.label` | `card-outline` | `#0ea5e9` | expenses | wallet |

STATUS: NEEDS OWNER APPROVAL

## Section 6 - Approval Gate 3: Report Subtype / Filter Matrix

| Canonical Kind | Report Subtype Key | Level-2 Chip Label | Notes |
|---|---|---|---|
| `replacement` | `replacement` | Replacement | `order` legacy alias also maps here when `order_mode === "replacement"`. |
| `sell_full` | `sell_full` | Sold full | `order` legacy alias also maps here when `order_mode === "sell_iron"`. |
| `buy_empty_from_customer` | `buy_empty` | Bought empty | Current chip key is shortened to `buy_empty`. |
| `payment_from_customer` | `customer_payment` | Customer paid | Also used by legacy `collection_money`. |
| `payment_to_customer` | `customer_payout` | Paid customer | Derived from legacy `collection_payout`; canonical kind is not explicitly handled in `getEventSubtype()` today. |
| `customer_return_empties` | `customer_return` | Returned empties | Also used by legacy `collection_empty`. |
| `adjust_customer_balance` | `adjust_customer_balance` | Balance adjustment | Falls through current default path; canonical kind is not explicitly handled in `getEventSubtype()` today. |
| `refill` | `company_refill` or `company_return` | Refill or Returned empties | Runtime exception: splits into `company_refill` vs `company_return` based on `event.buy12` / `event.buy48` and return quantities. |
| `buy_full_from_company` | `company_buy_full` | Bought full | Also used by legacy `company_buy_full`. |
| `payment_to_company` | `company_payment` | Paid company | Current logic also checks `money_direction`; this canonical kind should be outgoing. |
| `payment_from_company` | `received_from_company` | Company paid | Derived from legacy `company_payment` with `money_direction === "in"`; canonical kind is not explicitly handled in `getEventSubtype()` today. |
| `dist_return_empties` | `company_return` | Returned empties | Also used by legacy `company_return_empties`. |
| `adjust_company_balance` | `adjust_company_balance` | Balance adjustment | Falls through current default path; canonical kind is not explicitly handled in `getEventSubtype()` today. |
| `adjust_inventory` | `inventory_adjustment` | Inventory adjustment | Also used by legacy `adjust`. |
| `adjust_wallet` | `wallet_adjustment` | Wallet adjustment | Also used by legacy `cash_adjust`. |
| `expense` | `expense` | Expense | Explicitly handled. |
| `bank_to_wallet` | `bank_to_wallet` | Bank to wallet | Derived from current `bank_deposit` with `transfer_direction === "bank_to_wallet"`; canonical kind is not explicitly handled today. |
| `wallet_to_bank` | `wallet_to_bank` | Wallet to bank | Derived from current `bank_deposit` with `transfer_direction !== "bank_to_wallet"`; canonical kind is not explicitly handled today. |

STATUS: NEEDS OWNER APPROVAL

## Section 7 - Approval Gate 4: Legacy Alias Matrix

| Legacy Alias | Canonical Kind | Location | Removed in Ticket |
|---|---|---|---|
| `order` | `replacement`, `sell_full`, `buy_empty_from_customer` via `order_mode` | `frontend/lib/activityAdapter.ts`; `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts` | T9 |
| `collection_money` | `payment_from_customer` | `frontend/lib/activityAdapter.ts`; `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts` | T9 |
| `collection_payout` | `payment_to_customer` | `frontend/lib/activityAdapter.ts`; `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts` | T9 |
| `collection_empty` | `customer_return_empties` | `frontend/lib/activityAdapter.ts`; `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts` | T9 |
| `customer_adjust` | `adjust_customer_balance` | `frontend/lib/activityAdapter.ts`; `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts` | T9 |
| `company_payment` | `payment_to_company`, `payment_from_company` via direction | `frontend/lib/activityAdapter.ts`; `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts` | T9 |
| `company_adjustment` | `adjust_company_balance` | `frontend/lib/activityAdapter.ts`; `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts` | T9 |
| `company_buy_iron` | `buy_full_from_company` | `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts` | T9 |
| `company_buy_full` | `buy_full_from_company` | `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts`; `frontend/app/(tabs)/reports/index.tsx` | T9 |
| `company_return_empties` | `dist_return_empties` | `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts`; `frontend/app/(tabs)/reports/index.tsx` | T9 |
| `buy_iron` | `buy_full_from_company` when used as legacy company inventory/refill kind | `frontend/lib/activityAdapter.ts` | T9 |
| `cash_adjust` | `adjust_wallet` | `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts`; `frontend/app/(tabs)/reports/index.tsx` | T9 |
| `adjust` | `adjust_inventory` | `frontend/lib/activityAdapter.ts`; `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts`; `frontend/app/(tabs)/reports/index.tsx` | T9 |
| `bank_deposit` | `wallet_to_bank`, `bank_to_wallet` via `transfer_direction` | `frontend/lib/activityAdapter.ts`; `frontend/lib/reports/eventColors.ts`; `frontend/app/(tabs)/reports/index.tsx` | T8 emission stops; T9 alias removal |
| `init` | UNKNOWN - needs investigation | `frontend/lib/reports/eventColors.ts`; `frontend/lib/reports/utils.ts` | T9 |
| `init_balance` | UNKNOWN - needs investigation | `frontend/lib/reports/utils.ts` | T9 |
| `init_credit` | UNKNOWN - needs investigation | `frontend/lib/reports/utils.ts` | T9 |
| `init_return` | UNKNOWN - needs investigation | `frontend/lib/reports/utils.ts` | T9 |

STATUS: NEEDS OWNER APPROVAL

## Section 8 - Approval Gate 5: Balance Wording / Sign Matrix

| Scope | Component | Positive value means | Label shown | Example |
|---|---|---|---|---|
| customer | money | Customer owes distributor money. | Positive: `debts`; Negative: `credit` | `+100` -> `debts 100 SYP`; `-100` -> `credit 100 SYP` |
| customer | `cyl_12` | Customer owes distributor 12kg empty cylinders. | Positive: `debts`; Negative: `credit` | `+2` -> `debts 2`; `-2` -> `credit 2` |
| customer | `cyl_48` | Customer owes distributor 48kg empty cylinders. | Positive: `debts`; Negative: `credit` | `+1` -> `debts 1`; `-1` -> `credit 1` |
| company | money | Distributor owes company money. | Positive: `debts`; Negative: `credit` | `+100` -> `debts 100 SYP`; `-100` -> `credit 100 SYP` |
| company | `cyl_12` | Company owes distributor 12kg full cylinders. | Positive: `credit`; Negative: `debts` | `+2` -> `credit 2`; `-2` -> `debts 2` |
| company | `cyl_48` | Company owes distributor 48kg full cylinders. | Positive: `credit`; Negative: `debts` | `+1` -> `credit 1`; `-1` -> `debts 1` |

STATUS: NEEDS OWNER APPROVAL

## Section 9 - Approval Gate 6: Bank Migration Matrix

| Item | Decision |
|---|---|
| `bank_deposit` backend event type | Split into `wallet_to_bank` / `bank_to_wallet` in T8 |
| `transfer_direction` field | Retained in backend responses during T8; removed in T9 |
| Compatibility window | NEEDS OWNER DECISION: how long before T9 ships? |
| Frontend adapter | `bankDepositToEvent()` must stop emitting `bank_deposit` in T8 |

STATUS: NEEDS OWNER APPROVAL

## Section 10 - Approval Gate 7: DB Ledger Source Repair Matrix

| Item | Value |
|---|---|
| Migration to repair | `n1_rename_activity_kinds.py` |
| Incorrect change | `ledger_entries.source_type`: `cash_adjust` -> `adjust_wallet` and `inventory_adjust` -> `adjust_inventory` |
| Repair migration | `n2_repair_ledger_source_types.py` - reverses only the `source_type` changes |
| Transaction kind columns | NOT reversed - `customer_transactions.kind` and `company_transactions.kind` renames in `n1` were correct |
| Ship as | Standalone migration, immediately, before any other DB ticket |

STATUS: NEEDS OWNER APPROVAL
