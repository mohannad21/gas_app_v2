# Refactoring Decisions — Activity Kind Rename
# R1 Pre-work output

> **Branch:** `refactor/activity-kinds`
> **Date:** 2026-05-18
> **Status:** Decisions made — ready to proceed to R2

---

## Decision 1: Company payment direction

**Question (from R1 ticket):** How to distinguish `payment_to_company` vs `payment_from_company`?
Three options were listed: (a) add direction field to schema, (b) infer from sign, (c) keep as single-direction.

**Finding:**
`CompanyPaymentCreate` has no `direction` field. All payments write `kind="payment"`.
The endpoint validates `amount != 0` but does not treat negative amounts differently.
Negative amounts ARE accepted by the schema (no lower bound validation).

**Decision: Option (b) — infer direction from sign of amount.**

Reason: The UI already sends negative amounts for payments received from the company
(see `post_payment_from_company` in test helpers). Adding a direction field would require
a coordinated frontend schema change before R3 can ship. Sign inference avoids that and
is already the implicit contract. The migration can split on sign:

```sql
UPDATE company_transaction SET kind='payment_to_company'   WHERE kind='payment' AND paid >= 0;
UPDATE company_transaction SET kind='payment_from_company' WHERE kind='payment' AND paid < 0;
```

Backend read paths: infer from `txn.paid >= 0` when mapping to `event_type`.
Backend write paths: `kind = "payment_to_company" if payload.amount >= 0 else "payment_from_company"`.

---

## Decision 2: `payout` vs `return` kinds — CORRECTION to migration SQL

**Finding (corrects REFACTORING_TICKETS.md R2 section):**

The REFACTORING_TICKETS.md stated that `kind="return"` covers BOTH cash payouts to
customers AND cylinder returns from customers. **This is wrong.** The DB already uses
two separate kinds:

- `kind="return"` — cylinder returns only (`received` field > 0, `gas_type` set)
- `kind="payout"` — cash payouts only (`paid` field > 0, `gas_type` = None)

The existing `ck_customer_txn_kind` constraint confirms this:
`kind IN ('order', 'payment', 'return', 'payout', 'adjust')`

The R2 migration SQL in REFACTORING_TICKETS.md that reads:
```sql
-- WRONG — do not use
UPDATE customer_transaction SET kind='customer_return_empties'
  WHERE kind='return' AND (cyl_delta_12 != 0 OR cyl_delta_48 != 0);
UPDATE customer_transaction SET kind='payment_to_customer'
  WHERE kind='return' AND cyl_delta_12 = 0 AND cyl_delta_48 = 0;
```

**Must be replaced with:**
```sql
-- CORRECT
UPDATE customer_transaction SET kind='customer_return_empties' WHERE kind='return';
UPDATE customer_transaction SET kind='payment_to_customer'     WHERE kind='payout';
```

No ambiguity discrimination is needed — the split already exists in the DB.

---

## Decision 3: `mode` field retention

The `mode` column on `CustomerTransaction` is `Optional[str]`, nullable.
Current check constraint: `mode IN ('replacement', 'sell_iron', 'buy_iron') OR mode IS NULL`.

**Decision:** Keep `mode` as a nullable historical column. Stop writing to it after R3.
Do not drop it in this refactoring cycle — schedule as a separate follow-up cleanup.

In R3: write paths continue to set `mode=payload.order_mode` on new order rows (for audit trail).
In a future cleanup: drop the column after verifying no code reads it.

---

## Decision 4: Alembic check constraints to update in R2

Current constraints (after migration m1):

| Constraint | Table | Current allowed values |
|---|---|---|
| `ck_customer_txn_kind` | customer_transactions | 'order', 'payment', 'return', 'payout', 'adjust' |
| `ck_company_txn_kind` | company_transactions | 'refill', 'dist_return_empties', 'buy_iron', 'payment', 'adjust' |
| `ck_customer_txn_mode` | customer_transactions | 'replacement', 'sell_iron', 'buy_iron' OR NULL |

New constraints after R2:

| Constraint | Table | New allowed values |
|---|---|---|
| `ck_customer_txn_kind` | customer_transactions | 'replacement', 'sell_full', 'buy_empty_from_customer', 'payment_from_customer', 'payment_to_customer', 'customer_return_empties', 'adjust_customer_balance' |
| `ck_company_txn_kind` | company_transactions | 'refill', 'dist_return_empties', 'buy_full_from_company', 'payment_to_company', 'payment_from_company', 'adjust_company_balance' |
| `ck_customer_txn_mode` | customer_transactions | keep unchanged (historical values still valid) |

---

## Decision 5: Frontend event_type inventory

Every event_type string hard-coded in the frontend that needs updating in R5:

### Strings that change (old → new)

| Old string | Location(s) | New string |
|---|---|---|
| `"order"` | activityAdapter.ts:202, eventColors.ts, ActivityIcon.tsx, SlimActivityRow.tsx, reports/utils.ts | Split into `"replacement"`, `"sell_full"`, `"buy_empty_from_customer"` |
| `"company_buy_iron"` | eventColors.ts, ActivityIcon.tsx, reports/utils.ts | `"buy_full_from_company"` |
| `"company_buy_full"` | activityAdapter.ts:483, SlimActivityRow.tsx | `"buy_full_from_company"` (already partially updated) |
| `"company_return_empties"` | activityAdapter.ts (getCompanyInventoryEventType), SlimActivityRow.tsx:220, reports/index.tsx:110,150 | `"dist_return_empties"` (backend already emits this) |
| `"customer_adjust"` | activityAdapter.ts:359, eventColors.ts, ActivityIcon.tsx | `"adjust_customer_balance"` |
| `"company_adjustment"` | activityAdapter.ts:414, eventColors.ts, ActivityIcon.tsx | `"adjust_company_balance"` |
| `"adjust"` | activityAdapter.ts (inventory), eventColors.ts, ActivityIcon.tsx, SlimActivityRow.tsx | `"adjust_inventory"` |
| `"cash_adjust"` | activityAdapter.ts:610, eventColors.ts | `"adjust_wallet"` |
| `"payment"` (collection) | activityAdapter.ts | → already `"payment_from_customer"` *(verify)* |
| `"return"` (collection) | activityAdapter.ts | → already `"customer_return_empties"` *(verify)* |
| `"payout"` (collection) | activityAdapter.ts | → `"payment_to_customer"` |

### Strings that stay the same

`"refill"`, `"expense"`, `"bank_deposit"`, `"collection_money"`, `"collection_payout"`, `"collection_empty"`, `"company_payment"`, `"dist_return_empties"` (already live), `"init"`

### Key finding: `company_buy_iron` inconsistency

The frontend uses `"company_buy_iron"` in `eventColors.ts` and `ActivityIcon.tsx` but
`"company_buy_full"` in `activityAdapter.ts` and `SlimActivityRow.tsx`. The backend emits
`"company_buy_full"`. This means the color and icon for buy-full events are currently
silently broken (falling through to defaults). R5 must align all four files to `"buy_full_from_company"`.

### `getCompanyInventoryEventType()` in activityAdapter.ts

This heuristic function guesses the event type from quantity fields:
- `buy qty > 0` → `"company_buy_full"`
- `buy qty == 0` → `"company_return_empties"`

This entire function must be deleted in R5. The backend now emits the correct
`event_type` (`"dist_return_empties"` or `"company_buy_full"`) directly.

---

## R2 Migration SQL (corrected)

This supersedes the SQL in REFACTORING_TICKETS.md section R2.

### CustomerTransaction

```sql
-- order + mode → split into 3 kinds
UPDATE customer_transaction SET kind='replacement'           WHERE kind='order' AND mode='replacement';
UPDATE customer_transaction SET kind='sell_full'             WHERE kind='order' AND mode='sell_iron';
UPDATE customer_transaction SET kind='buy_empty_from_customer' WHERE kind='order' AND mode='buy_iron';

-- payment → payment_from_customer
UPDATE customer_transaction SET kind='payment_from_customer' WHERE kind='payment';

-- return → customer_return_empties  (no ambiguity, already separated from payout)
UPDATE customer_transaction SET kind='customer_return_empties' WHERE kind='return';

-- payout → payment_to_customer
UPDATE customer_transaction SET kind='payment_to_customer'   WHERE kind='payout';

-- adjust → adjust_customer_balance
UPDATE customer_transaction SET kind='adjust_customer_balance' WHERE kind='adjust';
```

### CompanyTransaction

```sql
-- buy_iron → buy_full_from_company
UPDATE company_transaction SET kind='buy_full_from_company' WHERE kind='buy_iron';

-- payment → split on sign of paid column
UPDATE company_transaction SET kind='payment_to_company'   WHERE kind='payment' AND paid >= 0;
UPDATE company_transaction SET kind='payment_from_company' WHERE kind='payment' AND paid < 0;

-- adjust → adjust_company_balance
UPDATE company_transaction SET kind='adjust_company_balance' WHERE kind='adjust';

-- refill and dist_return_empties: already correct from BUG-A fix, no change needed
```

### LedgerEntry

```sql
UPDATE ledger_entry SET source_type='adjust_wallet'    WHERE source_type='cash_adjust';
UPDATE ledger_entry SET source_type='adjust_inventory' WHERE source_type='inventory_adjust';
```

---

## Next step

R1 complete. Proceed to R2 (database migration alembic revision) with the corrected SQL above.
