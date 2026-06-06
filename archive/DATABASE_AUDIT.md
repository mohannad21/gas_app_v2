# Database Audit — Comprehensive Findings

**Last updated:** 2026-05-23
**Sources:** Manual schema review (models.py + posting.py) + cross-verification with Codex
**Status:** Findings only — no changes made yet

---

## How to read this document

Each finding has:
- **What is wrong** — described in plain terms
- **Why it matters** — the real-world consequence
- **Fix** — what needs to change

Findings are grouped by severity, then by topic.

---

## CRITICAL — Wrong data is being produced right now

### C1 · All ledger entries are written to the wrong tenant

**What is wrong:** Every time a transaction is recorded (sale, refill, payment, etc.), the system creates ledger entries to track balances. Every single ledger entry is stamped with a hardcoded "default tenant" ID — the actual tenant who made the transaction is ignored.

**Why it matters:** In a multi-tenant system this means all businesses share one ledger. Tenant A's sales affect Tenant B's balance. Reports and balance calculations are wrong for every tenant except the default one.

**Where:** `posting.py` line 174 — `tenant_id=DEFAULT_TENANT_ID` hardcoded in `_insert_ledger_entries()`

**Fix:** Pass the source transaction's `tenant_id` into the ledger insertion function. Backfill all existing ledger rows by joining back to the source tables.

---

### C2 · Ledger source labels are split — old and new names coexist

**What is wrong:** The code that records balance changes uses two internal labels: `cash_adjust` (for wallet adjustments) and `inventory_adjust` (for inventory changes). A migration apparently renamed these to `adjust_wallet` and `adjust_inventory` in the database — but the posting code still writes the old names.

**Why it matters:** Any query that looks up ledger entries by source label will miss records. Old records have the new name, new records have the old name. Balance lookups break.

**Where:** `posting.py` line 609 writes `"inventory_adjust"`, line 659 writes `"cash_adjust"`

**Fix:** Decide on stable source labels and make the posting code and database consistent. The recommendation is to keep `cash_adjust` and `inventory_adjust` as the permanent ledger labels (they describe the source table, not the activity kind), and undo the migration rename.

---

## HIGH — Data integrity is at risk

### H1 · Two different tenants can accidentally conflict on the same request ID

**What is wrong:** Every transaction table has a `request_id` field — a unique ID the app sends to prevent duplicate submissions. This ID is enforced as globally unique across all tenants. If two different businesses happen to generate the same ID (common with sequential numbering on mobile devices), one of their requests will fail with a confusing error.

**Fix:** Make the unique constraint per-tenant: `UNIQUE(tenant_id, request_id)` instead of `UNIQUE(request_id)`.

**Affects:** `customer_transactions`, `company_transactions`, `expenses`, `inventory_adjustments`, `cash_adjustments`

---

### H2 · The database does not prevent cross-tenant data mixing

**What is wrong:** A customer transaction has a `customer_id` that links to a customer record. The database only checks that the customer exists — it does NOT check that the customer belongs to the same business as the transaction. A software bug could link a transaction from Business A to a customer from Business B.

**Why it matters:** Financial records from one business could become visible in another business's reports.

**Fix:** Add tenant-aware composite constraints, or add a dedicated DB-level validation strategy that enforces `transaction.tenant_id = customer.tenant_id`.

---

### H3 · The ledger allows duplicate money entries due to a NULL loophole

**What is wrong:** The ledger has a uniqueness rule to prevent recording the same balance change twice. But the rule includes optional fields (`gas_type`, `state`) that can be empty (NULL). In SQL, two NULLs are not considered equal in a unique constraint — so two money entries for the same transaction can both be inserted without triggering the duplicate check.

**Why it matters:** A double-posted sale would inflate balances and report totals.

**Fix:** Use a partial unique index, replace NULLs with a sentinel value (e.g. `"_"`), or restructure the ledger to separate money and cylinder entries.

---

### H4 · Customers, users, and tenants cannot be safely deleted

**What is wrong:** Transaction tables support soft delete (they have a `deleted_at` field that marks records as removed without actually deleting them). But `customers`, `users`, and `tenants` have no such field — the only option is hard deletion.

**Why it matters:** Deleting a customer who has orders would break all their historical records. Deleting a user would orphan audit trails. There is currently no safe way to remove these records.

**Fix:** Add `deleted_at` and `deleted_by` to `customers`, `users`, and `tenants`.

---

### H5 · Reversal links are strings that can point to nothing

**What is wrong:** When a transaction is reversed (cancelled after the fact), the system stores the ID of the original transaction — but as a plain text string, not a proper database link. If the original record is deleted or the ID is wrong, the link silently breaks.

**Affects:** All five transaction tables — `reversal_source_id` and `reversed_id`

**Fix:** Add proper foreign key constraints, or build a unified activity event table that owns the reversal relationship.

---

### H6 · `company_transactions.kind` silently defaults to "refill"

**What is wrong:** If code creates a company transaction and forgets to set its kind, the database silently assigns it `"refill"` — a valid business kind. The record looks like a real refill purchase. Other tables have no default and would fail loudly.

**Fix:** Remove the default value so a missing kind causes an error, not a wrong record.

---

### H7 · Three duplicate-entry loopholes in membership and permissions

**What is wrong:** Three tables have no uniqueness protection:
- A user can be added to the same business twice (`tenant_memberships`)
- The same permission can be granted to the same role twice (`role_permissions`)
- A plan can have two conflicting values for the same entitlement key (`plan_entitlements`)

**Fix:** Add `UNIQUE(tenant_id, user_id)` to memberships, `UNIQUE(role_id, permission_code)` to role permissions, `UNIQUE(plan_id, key)` to plan entitlements.

---

## MEDIUM — Design problems that cause bugs under real conditions

### M1 · Two simultaneous transactions in the same second can get the same timestamp

**What is wrong:** The system assigns each event a precise timestamp down to the microsecond so that the daily activity list appears in the correct order. It does this by reading the latest timestamp in a one-second window and adding 1 microsecond. But this read-then-write is not atomic — two requests arriving at the same moment both read the same "latest" and both calculate the same next timestamp. Both succeed, and the ordering is broken.

**Fix:** Use a database lock or a central sequence counter for the same-second ordering, instead of the read-increment-write pattern.

---

### M2 · Gas type is a free-text field across 6 tables

**What is wrong:** A reference table (`system_type_options`) exists that lists the valid gas types (12kg, 48kg, etc.). But none of the tables that store gas type actually link to it — they all accept any text string. A typo ("12KG" instead of "12kg") creates a phantom gas type that won't match any report filter.

**Affects:** `systems`, `customer_transactions`, `inventory_adjustments`, `ledger_entries`, `price_catalog`, `company_transactions`

**Fix:** Either add foreign keys from all `gas_type` columns to `system_type_options.name`, or enforce valid values via check constraints.

---

### M3 · Bank transfers and expenses share the same table

**What is wrong:** The `expenses` table stores two completely different things: actual expenses (fuel, maintenance, etc.) and bank transfers (moving money between wallet and bank). They have different relevant fields — expenses need a category and vendor; bank transfers need neither. The table has a `kind` field (`"expense"` or `"deposit"`) to distinguish them, but they share all the same columns.

**Why it matters:** Reports, audits, and validation logic must always branch on `kind`. Fields like `category_id` and `vendor` are meaningless for deposits, and there's no enforcement that deposits leave them empty.

**Fix (short-term):** Report the two as `wallet_to_bank` / `bank_to_wallet` at the API level. **Fix (long-term):** Move bank transfers to a dedicated `bank_transfers` table.

---

### M4 · The `day` date field can drift out of sync with `happened_at`

**What is wrong:** Every operational table stores both `happened_at` (the precise event time) and `day` (the business date). The `day` is calculated from `happened_at` at write time. If `happened_at` is ever corrected or backdated without also updating `day`, the event appears on the wrong day in reports.

**Fix:** Either enforce the derivation in the service layer with tests, or use a database-generated column if the database supports it.

---

### M5 · Permissions table is bypassed in role assignments

**What is wrong:** There is a `permissions` table that defines valid permission codes. But `role_permissions` stores the permission code as a plain string with no link to that table. A permission can be granted that doesn't exist, and the orphaned assignment causes no error.

**Fix:** Add a foreign key from `role_permissions.permission_code` to `permissions.code`.

---

### M6 · Transaction tables mix multiple activity shapes in one wide table

**What is wrong:** `company_transactions` has columns for buying cylinders, returning cylinders, new cylinders, payments, and adjustments — all in one table. A payment record has `buy12`, `buy48`, `return12`, `return48` columns that simply don't apply to it, but nothing prevents them from being filled in incorrectly.

**Fix (short-term):** Add per-kind check constraints (e.g. a payment row must have `buy12 = 0`). **Fix (long-term):** Normalize into a parent event table with typed payload tables per kind.

---

### M7 · Report queries are missing composite indexes

**What is wrong:** Every filter in the database — by tenant, by date, by deletion status — is a separate single-column index. When a report query needs to filter by all four at once, the database has to do extra work combining them. For large datasets this becomes slow.

**Missing high-impact indexes:**
- All operational tables: `(tenant_id, day, deleted_at, happened_at)`
- Ledger entries: `(tenant_id, day, happened_at)`
- Ledger source lookup: `(tenant_id, source_type, source_id)`
- Balance queries: `(tenant_id, account, customer_id, gas_type, happened_at)`

---

### M8 · Multiple string fields accept any value — no validation

**What is wrong:** Several fields are documented in code comments as accepting only specific values, but the database does not enforce this. Any string can be inserted.

| Table | Field | Should only accept |
|---|---|---|
| `invites` | `status` | `pending`, `accepted`, `expired`, `revoked` |
| `tenant_plan_subscriptions` | `status` | `active`, `cancelled`, etc. |
| `billing_events` | `kind` | Known billing event types |
| `ledger_entries` | `account` | `cash`, `bank`, `inv`, `cust_money_debts`, etc. |
| `ledger_entries` | `unit` | `money`, `count` |
| `ledger_entries` | `state` | `full`, `empty` (or null) |
| `expenses` | `paid_from` | `cash`, `bank` |

> Note: `company_transactions.kind` and `expenses.kind` already have check constraints in the migration — the model code looks unconstrained but the DB is protected.

---

### M9 · Ledger entries have no reversal marker

**What is wrong:** When a transaction is reversed, the transaction itself is marked as reversed. But the ledger entries it created have no matching marker — they remain as if they were still active, with no link back to the reversal event.

**Fix:** Add an explicit reversal linkage to ledger entries (e.g. `reversal_of_id` pointing to the original ledger entry), or add an `is_reversed` flag and populate it when `reverse_source()` is called.

---

## LOW / DESIGN DEBT — Not urgent, but accumulates

### D1 · Config tables have no tenant isolation

**What is wrong:** The price catalog, expense categories, system type options, and system settings have no `tenant_id` — they are shared across all businesses using the app.

**Fix:** Add `tenant_id` to `price_catalog`, `expense_categories`, `system_type_options`. Redesign `system_settings` away from a singleton row.

**Affects:** `price_catalog`, `expense_categories`, `system_type_options`, `system_settings`

---

### D2 · Sessions don't know which tenant they belong to

**What is wrong:** When a user logs in, the session that is created has no record of which business (tenant) they logged in to. If a user belongs to multiple businesses, the system can't tell which one the current session is for.

**Fix:** Add `tenant_id` to `sessions`.

---

### D3 · Roles cannot be customized per business

**What is wrong:** All roles (e.g. "admin", "driver") are system-wide. There is no way for a business to define their own custom roles. The `is_system` flag on roles hints this was planned but never completed.

**Fix:** Add `tenant_id` (nullable) to `roles` — null means system-wide, a value means tenant-specific.

---

### D4 · User-to-tenant link is stored in two places

**What is wrong:** `users.tenant_id` and `tenant_memberships` both record which tenant a user belongs to. These two can disagree. `tenant_memberships` also stores the user's role, which `users.tenant_id` cannot.

**Fix:** Remove `users.tenant_id`. Use only `tenant_memberships` as the source of truth.

---

### D5 · Circular link between users and tenants

**What is wrong:** `tenants` records who owns the tenant (via `owner_user_id → users.id`), and `users` records which tenant they belong to (via `tenant_id → tenants.id`). These two tables reference each other, which is why a special workaround (`use_alter=True`) is needed when creating the database. This is fragile.

**Fix:** Goes away automatically when D4 is fixed (removing `users.tenant_id`).

---

### D6 · `cash_adjustments` table is named differently from its canonical activity kind

**What is wrong:** After the activity kind refactoring, the canonical name for wallet adjustments is `adjust_wallet`. But the database table is still called `cash_adjustments`. This is the same naming inconsistency the frontend refactoring is fixing, but it exists at the table level.

**Fix:** Rename the table to `wallet_adjustments` as part of the broader cleanup, after migrations and references are updated.

---

### D7 · Missing audit trail columns — inconsistent across tables

**What is wrong:** Some tables track who created/changed/deleted records, others don't. This makes it impossible to audit "who changed the price last week" or "who deleted that customer."

**Missing columns by table:**

| Table | Missing |
|---|---|
| `users` | `deleted_at`, `deleted_by`, `updated_by` |
| `tenants` | `deleted_at`, `deleted_by`, `created_by`, `updated_by` |
| `customers` | `deleted_at`, `deleted_by`, `created_by` |
| `systems` | `deleted_at`, `deleted_by`, `created_by` |
| `price_catalog` | `created_by`, `updated_at`, `updated_by` |
| `expense_categories` | `updated_at`, `updated_by` |
| `system_type_options` | `updated_at`, `updated_by` |
| `system_settings` | `updated_at`, `updated_by` |
| `tenant_memberships` | `updated_at`, `updated_by` |
| `plan_entitlements` | `updated_at`, `updated_by` |
| `tenant_plan_subscriptions` | `cancelled_by` |
| `billing_events` | `updated_at`, `updated_by` |
| `tenant_plan_overrides` | `updated_at`, `updated_by` |

---

### D8 · `billing_events` has no currency code

**What is wrong:** Billing events store an `amount` with no currency. If different businesses use different currencies, this amount is ambiguous.

**Fix:** Add `currency_code` (defaulting to the system currency).

---

### D9 · `group_id` exists on 5 tables but the group table doesn't

**What is wrong:** Five tables (`expenses`, `customer_transactions`, `company_transactions`, `inventory_adjustments`, `cash_adjustments`) have a `group_id` field to link related transactions together. There is no `transaction_groups` table that defines what a group is, stores its metadata, or validates that the ID refers to something real.

**Fix:** Create a `transaction_groups` table with at least `id`, `tenant_id`, `kind`, `created_at`, `created_by`.

---

### D10 · FIFO inventory costing is not implemented

**What is wrong:** When a cylinder is sold, the system has no record of what it cost to buy. The price catalog only tells you today's buy price — not the price paid for cylinders already sitting in stock. Profit reports are therefore always wrong when the buy price has changed since the last refill.

**Fix:** Create an `inventory_cost_layers` table that records the cost of each batch of cylinders at refill time. Sales consume from the oldest batch first and record the actual cost per cylinder on the transaction.

---

## Priority Order for Fixes

| Priority | ID | Short description |
|---|---|---|
| Critical | C1 | Ledger tenant isolation — all entries stamped with wrong tenant |
| Critical | C2 | Ledger source type split — old and new names coexist |
| High | H1 | `request_id` not scoped per tenant — collision risk |
| High | H2 | Cross-tenant FK not enforced at DB level |
| High | H3 | Ledger unique constraint NULL trap — duplicate money entries possible |
| High | H4 | No soft delete on customers, users, tenants |
| High | H5 | Reversal links are plain strings — orphan risk |
| High | H6 | `company_transactions.kind` defaults to "refill" silently |
| High | H7 | Three duplicate-entry loopholes in memberships/permissions/entitlements |
| Medium | M1 | `allocate_happened_at()` race condition — same timestamp collision |
| Medium | M2 | `gas_type` free string in 6 tables — typos undetected |
| Medium | M3 | Bank transfers mixed into expenses table |
| Medium | M4 | `day` field can drift from `happened_at` |
| Medium | M5 | `role_permissions.permission_code` not FK to permissions |
| Medium | M6 | Wide transaction tables — invalid column combinations allowed |
| Medium | M7 | Missing composite indexes for report queries |
| Medium | M8 | Multiple unconstrained string fields |
| Medium | M9 | Ledger entries have no reversal marker |
| Low | D1 | Config tables have no tenant isolation |
| Low | D2 | Sessions have no tenant ID |
| Low | D3 | Roles cannot be customized per tenant |
| Low | D4 | User-tenant link stored in two places |
| Low | D5 | Circular FK between users and tenants |
| Low | D6 | `cash_adjustments` table naming inconsistency |
| Low | D7 | Missing audit trail columns across multiple tables |
| Low | D8 | `billing_events` missing currency code |
| Low | D9 | `group_id` references non-existent group table |
| Low | D10 | FIFO inventory costing not implemented |
