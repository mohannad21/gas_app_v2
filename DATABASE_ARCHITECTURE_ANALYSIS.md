# Database Architecture Analysis

## Two Core Timestamps (Clarified)

Every financial activity in this app has two distinct timestamps:

| Timestamp | Column Name | Set By | Meaning | Used For |
|-----------|-------------|--------|---------|----------|
| **System time** | `created_at` | Server on insert | When the distributor entered the activity into the app | Sort activities below the "add" button in newest-first order |
| **Activity time** | `happened_at` | User-picked on the form (`delivered_at` on frontend) | When the activity actually occurred in the real world | Sort cards on daily report; sort activity list on customer review page |

---

## Full Schema Export

### `customers`

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | UUID | No | uuid() | System | Primary key |
| `name` | String | No | — | User | Customer full name |
| `phone` | String | Yes | NULL | User | Contact number |
| `address` | String | Yes | NULL | User | Delivery address |
| `note` | String | Yes | NULL | User | Free-text note |
| `created_at` | DateTime(TZ) | No | now() | System | When customer was registered |

**Missing:** `updated_at` — no way to know when name/address was last changed.

---

### `systems` (Customer Installations)

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | UUID | No | uuid() | System | Primary key |
| `customer_id` | UUID (FK) | No | — | User | Which customer owns this system |
| `name` | String | No | — | User | Location name (e.g., "Kitchen", "Water Heater") |
| `gas_type` | String | No | — | User | Gas type this system uses: `12kg` or `48kg` |
| `note` | String | Yes | NULL | User | Additional info |
| `requires_security_check` | Bool | No | False | User | Policy flag |
| `security_check_exists` | Bool | No | False | User/System | Status flag |
| `last_security_check_at` | Date | Yes | NULL | User | Date of last inspection |
| `next_security_check_at` | Date | Yes | NULL | Computed | Calculated from last check + interval |
| `is_active` | Bool | No | True | User | Whether system is still in use |
| `created_at` | DateTime(TZ) | No | now() | System | When system was registered |

**Missing:** `updated_at`, `deactivated_at` — no timeline of changes.

---

### `price_catalog`

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | UUID | No | uuid() | System | Primary key |
| `effective_from` | DateTime(TZ) | No | now() | User | When this price becomes active (their `happened_at`) |
| `gas_type` | String | No | — | User | `12kg` or `48kg` |
| `sell_price` | Int (cents) | No | — | User | Price to charge customer for a full replacement |
| `buy_price` | Int (cents) | No | — | User | Price paid to supplier per full cylinder |
| `sell_iron_price` | Int (cents) | No | 0 | User | Price to charge for sell_iron (sell full) order |
| `buy_iron_price` | Int (cents) | No | 0 | User | Price to charge for buy_iron (buy empty) order |
| `created_at` | DateTime(TZ) | No | now() | System | When this price record was entered |

**Note:** `effective_from` is this table's equivalent of `happened_at`.

---

### `customer_transactions` ← Central table for all customer activity

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | UUID | No | uuid() | System | Primary key |
| `group_id` | UUID | Yes | NULL | System | Groups multiple rows into one logical event (e.g., payment + return in one collection) |
| `request_id` | String | Yes | NULL | Frontend | Idempotency key — prevents duplicate submission on retry |
| `happened_at` | DateTime(TZ) | No | now()* | **User** | When the delivery/payment actually happened (`delivered_at` on frontend) |
| `created_at` | DateTime(TZ) | No | now() | System | When this was entered into the app |
| `day` | Date | No | Derived | System | Business day extracted from `happened_at` (indexed for day-based queries) |
| `kind` | String | No | — | System | `order` · `payment` · `return` · `payout` · `adjust` |
| `mode` | String | Yes | NULL | System | Order subtype: `replacement` · `sell_iron` · `buy_iron` (only when `kind=order`) |
| `customer_id` | UUID (FK) | No | — | User | Which customer |
| `system_id` | UUID (FK) | Yes | NULL | User | Which system — only for `replacement` and `sell_iron` orders |
| `gas_type` | String | Yes | NULL | User | `12kg` or `48kg` — null for money-only events |
| `installed` | Int | No | 0 | User | Cylinders installed/delivered to customer |
| `received` | Int | No | 0 | User | Cylinders received from customer (empties or returns) |
| `total` | Int (cents) | No | 0 | Calculated | Total price charged — zero for payments/returns |
| `paid` | Int (cents) | No | 0 | User | Amount the customer paid in this transaction |
| `debt_cash` | Int (cents) | No | 0 | **System (snapshot)** | Customer's cash balance AFTER this transaction |
| `debt_cylinders_12` | Int | No | 0 | **System (snapshot)** | Customer's 12kg cylinder debt AFTER this transaction |
| `debt_cylinders_48` | Int | No | 0 | **System (snapshot)** | Customer's 48kg cylinder debt AFTER this transaction |
| `note` | String | Yes | NULL | User | Optional note |
| `reversed_id` | UUID | Yes | NULL | System | If this row is a reversal, points to the original |
| `is_reversed` | Bool | No | False | System | Soft-delete flag |

**Key insight on debt fields:** `debt_cash` / `debt_cylinders_*` are **running balance snapshots**, not deltas. They store what the customer owes *after* this transaction completes. The ledger (`ledger_entries`) is the true source of truth; these fields are a denormalized cache for fast display.

**How each `kind` fills fields:**

| kind | mode | system_id | gas_type | installed | received | total | paid | debt_cash | debt_cyl |
|------|------|-----------|----------|-----------|----------|-------|------|-----------|---------|
| order | replacement | Required | Required | Delivered qty | Empties back | Price | Partial/full | New balance | New balance |
| order | sell_iron | Required | Required | 1 (sold) | 0 | Iron price | Partial/full | New balance | New balance |
| order | buy_iron | NULL | Required | 0 | 1 (bought) | Iron price | Partial/full | New balance | New balance |
| payment | — | NULL | NULL | 0 | 0 | 0 | Amount received | New balance | Unchanged |
| return | — | NULL | Required | 0 | Qty returned | 0 | 0 | Unchanged | New balance |
| payout | — | NULL | NULL | 0 | 0 | 0 | Amount paid out | New balance | Unchanged |
| adjust | — | NULL | NULL | 0 | 0 | 0 | Adjustment amt | New balance | New balance |

---

### `company_transactions` ← Refills, supplier payments, company adjustments

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | UUID | No | uuid() | System | Primary key |
| `request_id` | String | Yes | NULL | Frontend | Idempotency key |
| `happened_at` | DateTime(TZ) | No | now()* | **User** | When the refill/payment actually happened |
| `created_at` | DateTime(TZ) | No | now() | System | When entered into app |
| `day` | Date | No | Derived | System | Business day from `happened_at` |
| `kind` | String | No | `refill` | System | `refill` · `buy_iron` · `payment` · `adjust` |
| `buy12` | Int | No | 0 | User | 12kg full cylinders purchased from supplier |
| `return12` | Int | No | 0 | User | 12kg empty cylinders returned to supplier |
| `buy48` | Int | No | 0 | User | 48kg full cylinders purchased |
| `return48` | Int | No | 0 | User | 48kg empty cylinders returned |
| `new12` | Int | No | 0 | User | New 12kg iron cylinders added to company stock |
| `new48` | Int | No | 0 | User | New 48kg iron cylinders added |
| `total` | Int (cents) | No | 0 | Calculated | Total cost of this refill/transaction |
| `paid` | Int (cents) | No | 0 | User | Amount paid to supplier now |
| `debt_cash` | Int (cents) | No | 0 | **System (snapshot)** | Company cash debt to supplier AFTER this transaction |
| `debt_cylinders_12` | Int | No | 0 | **System (snapshot)** | Company 12kg cylinder debt to supplier AFTER this transaction |
| `debt_cylinders_48` | Int | No | 0 | **System (snapshot)** | Company 48kg cylinder debt AFTER |
| `note` | String | Yes | NULL | User | Optional note |
| `reversed_id` | UUID | Yes | NULL | System | If reversal, points to original |
| `is_reversed` | Bool | No | False | System | Soft-delete flag |

**Note:** `group_id` is **absent** from this table — unlike `customer_transactions`.

---

### `inventory_adjustments` ← Manual inventory count corrections

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | UUID | No | uuid() | System | Primary key |
| `group_id` | UUID | Yes | NULL | System | Groups paired 12kg + 48kg adjustments |
| `request_id` | String | Yes | NULL | Frontend | Idempotency key |
| `happened_at` | DateTime(TZ) | No | now()* | **User** | When the count discrepancy was found |
| `created_at` | DateTime(TZ) | No | now() | System | When entered into app |
| `day` | Date | No | Derived | System | Business day from `happened_at` |
| `gas_type` | String | No | — | User | `12kg` or `48kg` |
| `delta_full` | Int | No | 0 | User | Change in full cylinder count (positive = found more, negative = lost) |
| `delta_empty` | Int | No | 0 | User | Change in empty cylinder count |
| `note` | String | Yes | NULL | User | Reason: "recount", "damage", "loss", etc. |
| `reversed_id` | UUID | Yes | NULL | System | If reversal, points to original |
| `is_reversed` | Bool | No | False | System | Soft-delete flag |

**Key insight:** These store **deltas** (differences), not snapshots. Opposite of `debt_*` fields on transactions.

---

### `expenses` ← Company expenses and bank deposits

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | UUID | No | uuid() | System | Primary key |
| `request_id` | String | Yes | NULL | Frontend | Idempotency key |
| `happened_at` | DateTime(TZ) | No | now()* | **User** | When the expense occurred |
| `created_at` | DateTime(TZ) | No | now() | System | When entered into app |
| `day` | Date | No | Derived | System | Business day from `happened_at` |
| `kind` | String | No | — | System | `expense` · `deposit` |
| `category_id` | UUID (FK) | Yes | NULL | User | Expense category (electricity, rent, fuel…) |
| `amount` | Int (cents) | No | — | User | Amount spent or deposited |
| `paid_from` | String | Yes | NULL | User | `cash` or `bank` |
| `vendor` | String | Yes | NULL | User | Who was paid |
| `note` | String | Yes | NULL | User | Optional note |
| `reversed_id` | UUID | Yes | NULL | System | If reversal, points to original |
| `is_reversed` | Bool | No | False | System | Soft-delete flag |

**Missing:** `group_id` — bank deposits and expenses can't be grouped with related transactions.

---

### `cash_adjustments` ← Manual cash balance corrections

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | UUID | No | uuid() | System | Primary key |
| `request_id` | String | Yes | NULL | Frontend | Idempotency key |
| `happened_at` | DateTime(TZ) | No | now()* | **User** | When the cash correction was made |
| `created_at` | DateTime(TZ) | No | now() | System | When entered into app |
| `day` | Date | No | Derived | System | Business day from `happened_at` |
| `delta_cash` | Int (cents) | No | — | User | Amount to add (positive) or subtract (negative) |
| `note` | String | Yes | NULL | User | Reason for adjustment |
| `reversed_id` | UUID | Yes | NULL | System | If reversal, points to original |
| `is_reversed` | Bool | No | False | System | Soft-delete flag |

**Missing:** `group_id`.

---

### `ledger_entries` ← Double-entry accounting ledger (source of truth for balances)

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | UUID | No | uuid() | System | Primary key |
| `happened_at` | DateTime(TZ) | No | — | Copied from source | Inherited from originating transaction |
| `created_at` | DateTime(TZ) | No | now() | System | When this ledger line was posted |
| `day` | Date | No | — | Copied from source | Inherited from originating transaction |
| `source_type` | String | No | — | System | Which table originated this: `customer_txn` · `company_txn` · `inventory_adjust` · `expense` · `cash_adjust` · `system_init` |
| `source_id` | UUID | No | — | System | ID of the originating row |
| `customer_id` | UUID (FK) | Yes | NULL | System | Set if this entry relates to a customer account |
| `account` | String | No | — | System | Which account: `cash` · `bank` · `inv` · `cust_money_debts` · `cust_cylinders_debts` · `company_money_debts` · `company_cylinders_debts` · `expense` · `cash_adjustments` |
| `gas_type` | String | Yes | NULL | System | `12kg` or `48kg` when relevant |
| `state` | String | Yes | NULL | System | `full` or `empty` for inventory entries |
| `unit` | String | No | — | System | `money` or `count` |
| `amount` | Int | No | — | System | Debit or credit amount (positive or negative) |
| `note` | String | Yes | NULL | System | Copied from source note |

**Unique constraint:** `(source_type, source_id, account, gas_type, state, unit)` — prevents double-posting the same transaction.  
**No FK to source tables** — referential integrity only enforced by application code.

---

### `system_settings` ← Global configuration singleton

| Column | Type | Nullable | Default | Set By | Business Meaning |
|--------|------|----------|---------|--------|-----------------|
| `id` | String | No | `"system"` | Hardcoded | Fixed singleton row |
| `is_setup_completed` | Bool | No | False | System | Setup wizard completion flag |
| `currency_code` | String | No | `"ILS"` | User | ISO 4217 currency code |
| `money_decimals` | Int | No | 2 | User | Decimal places (2 = cents) |
| `created_at` | DateTime(TZ) | No | now() | System | When system was first initialized |

---

### `expense_categories` · `system_type_options` ← Lookup tables

Same structure: `id`, `name` (unique), `is_active`, `created_at`. Configuration only.

---

## Issues Discovered

### 1. No `updated_at` on Master Records
**Affected:** `customers`, `systems`  
You can change a customer's name or address and there's no timestamp of when that happened. No modification audit trail.

---

### 2. `day` Column is Redundant but Intentional
The `day` date column exists on every transaction table alongside `happened_at`. It's derived: `day = business_date(happened_at)`. It's stored rather than computed because it's indexed and queried constantly for day-based filtering. The risk is that if `happened_at` is ever updated without recalculating `day`, they diverge silently. Currently they can only diverge through a direct database write — application always sets both together.

---

### 3. The Reversal/Soft-Delete Pattern Is Ambiguous
The current pattern uses `is_reversed` and `reversed_id`. The problem: when a deletion is requested, the system creates a **new reversal row** (with negated ledger entries). The new row is `is_reversed = False`. The original row's `is_reversed` status is unclear. This means "active records" and "reversal records" are both `is_reversed = False` — the field name is misleading. To find "deleted" records you can't simply check `is_reversed = True`.

---

### 4. Debt Fields: Two Sources of Truth
`debt_cash`, `debt_cylinders_12`, `debt_cylinders_48` on transactions are **snapshots** of balances. The `ledger_entries` table is the **authoritative source**. The balance displayed comes from summing ledger entries, not reading these fields. These snapshot fields are unused in balance calculations — they're stored but their purpose in the current codebase is unclear. If they diverge from the ledger (partial failure), silent corruption occurs.

---

### 5. Five Separate Transaction Tables
To build the daily activity feed you have to query five tables: `customer_transactions`, `company_transactions`, `expenses`, `inventory_adjustments`, `cash_adjustments`. There is no unified view or activity log. Reports require merging results from all five in application code.

---

### 6. `group_id` Inconsistency
`group_id` exists in `customer_transactions` and `inventory_adjustments` but is **absent** from `company_transactions`, `expenses`, and `cash_adjustments`. Company refills and cash corrections cannot be logically grouped.

---

### 7. No Database-Level Enum Constraints
Fields like `kind`, `mode`, `paid_from`, `gas_type`, `state`, `unit` are `String` columns with no `CHECK` constraints. Any string value is accepted at the database level. Business rules enforced only in Python.

---

### 8. No Business Rule Constraints at DB Level
- No constraint that `system_id IS NOT NULL` when `mode IN ('replacement', 'sell_iron')`
- No constraint that `paid <= total`
- No constraint that `cylinders_installed >= 0`
- These are enforced only in application code

---

### 9. `customer_transactions` Field Semantics Shift by `kind`
`installed`, `received`, `total`, `paid` mean different things depending on `kind`:
- For `order`: installed = cylinders delivered, received = empties back
- For `return`: installed = 0, received = cylinders returned
- For `payment`: installed = 0, received = 0, paid = cash received
This reuse of field names for different semantics makes the table harder to reason about.

---

### 10. No `updated_at` on Transaction Records
If a transaction is edited (order update, expense edit), there's no timestamp of when the edit happened. Only `created_at` exists.

---

### 11. `price_catalog` Uses `effective_from` Instead of `happened_at`
Every other transaction table uses `happened_at` for "when this business event occurred." `price_catalog` uses `effective_from`. Inconsistent naming for the same concept.

---

### 12. `Expense.paid_from` Is Semantically Reversed for Deposits
For `kind = expense`: `paid_from = "cash"` means you spent cash.  
For `kind = deposit`: `paid_from = "bank"` means money went TO bank.  
The same column name describes the source for expenses and the destination for deposits. Confusing.

---

### 13. Money Stored as Integer with External Precision Setting
`money_decimals = 2` in `system_settings` means all integer amounts are in cents. If this is ever changed (to 3 for millimes), all existing values are wrong by a factor of 10. No migration guard exists.

---

## Recommended Architecture Improvements

### Priority 1 — Add Without Breaking Anything

**A. Add `updated_at` to master records**
```sql
ALTER TABLE customers ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE systems ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
```
Set on every UPDATE via application code or a database trigger.

**B. Add `group_id` to missing tables**
```sql
ALTER TABLE company_transactions ADD COLUMN group_id UUID;
ALTER TABLE expenses ADD COLUMN group_id UUID;
ALTER TABLE cash_adjustments ADD COLUMN group_id UUID;
```
Consistent grouping across all activity types.

**C. Add database-level enum constraints**
```sql
ALTER TABLE customer_transactions
  ADD CONSTRAINT ck_kind CHECK (kind IN ('order','payment','return','payout','adjust')),
  ADD CONSTRAINT ck_mode CHECK (mode IN ('replacement','sell_iron','buy_iron') OR mode IS NULL);

ALTER TABLE expenses
  ADD CONSTRAINT ck_kind CHECK (kind IN ('expense','deposit')),
  ADD CONSTRAINT ck_paid_from CHECK (paid_from IN ('cash','bank') OR paid_from IS NULL);
```

**D. Add business rule constraint for system_id**
```sql
ALTER TABLE customer_transactions
  ADD CONSTRAINT ck_system_required CHECK (
    (mode IN ('replacement','sell_iron') AND system_id IS NOT NULL)
    OR (mode IS NULL OR mode = 'buy_iron')
  );
```

---

### Priority 2 — Clean Up Soft Delete

**Replace `is_reversed` / `reversed_id` with a cleaner pattern:**

```sql
-- All transaction tables
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE NULL;     -- NULL = active
ADD COLUMN reversal_source_id UUID NULL;                  -- what this reversal undoes
```

- **Active record:** `deleted_at IS NULL`
- **Soft-deleted:** `deleted_at IS NOT NULL`
- **A reversal:** new row with its own `happened_at`, `created_at`, negative amounts, and `reversal_source_id` pointing to the original
- **The original:** marked with `deleted_at` set to when it was reversed

This separates "is this record deleted?" from "is this record a reversal?"

---

### Priority 3 — Resolve Dual Source of Truth for Balances

**Option A (recommended): Drop snapshot debt fields, compute balance from ledger only**
- Remove `debt_cash`, `debt_cylinders_12`, `debt_cylinders_48` from transaction tables
- Always query ledger for balance
- Simpler, single source of truth
- Slightly slower for single-transaction display (one extra query)

**Option B: Keep snapshots but verify on read**
- Keep debt fields as display cache
- On read, verify against ledger sum and alert on divergence
- More resilient but adds complexity

---

### Priority 4 — Unified Activity Log (Long-Term)

Instead of five separate tables, introduce an `activity_log` view or table:

```sql
CREATE VIEW activity_log AS
  SELECT id, 'customer_txn' AS source, customer_id, NULL AS vendor,
         happened_at, created_at, day, note
  FROM customer_transactions WHERE deleted_at IS NULL
  UNION ALL
  SELECT id, 'company_txn', NULL, NULL,
         happened_at, created_at, day, note
  FROM company_transactions WHERE deleted_at IS NULL
  UNION ALL
  SELECT id, 'expense', NULL, vendor,
         happened_at, created_at, day, note
  FROM expenses WHERE deleted_at IS NULL
  UNION ALL
  SELECT id, 'inventory_adj', NULL, NULL,
         happened_at, created_at, day, note
  FROM inventory_adjustments WHERE deleted_at IS NULL
  UNION ALL
  SELECT id, 'cash_adj', NULL, NULL,
         happened_at, created_at, day, note
  FROM cash_adjustments WHERE deleted_at IS NULL;
```

This provides a unified feed for the daily report without changing the underlying tables.

---

### Priority 5 — Naming Consistency

| Current | Recommended | Reason |
|---------|-------------|--------|
| `happened_at` | Keep as-is across all transaction tables | Already consistent (except `price_catalog`) |
| `price_catalog.effective_from` | Rename to `happened_at` | Consistent with all other tables |
| `customer_transactions.mode` | Rename to `order_mode` | Matches schema input name and frontend label |
| `Expense.paid_from` | Split into `payment_method` + `payment_direction` | Semantics differ for expense vs deposit |

---

## Summary Matrix

| Issue | Severity | Breaking Change? | Effort |
|-------|----------|-----------------|--------|
| No `updated_at` on customers/systems | Medium | No | Low |
| `group_id` missing from 3 tables | Low | No | Low |
| No enum CHECK constraints | Medium | No | Low |
| No business rule DB constraints | High | No | Low |
| Ambiguous `is_reversed` pattern | Medium | Yes (migration) | Medium |
| Dual source of truth (debt + ledger) | High | Yes (migration) | High |
| Five separate transaction tables | Medium | Yes (migration) | High |
| No `updated_at` on transactions | Low | No | Low |
| `effective_from` naming inconsistency | Low | Yes (rename) | Low |
| `mode` vs `order_mode` naming | Low | Yes (rename) | Low |
