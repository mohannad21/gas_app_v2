# Epic 1 — Database & Infrastructure Foundation

## Branch
All three tickets work on the same branch: `epic/1-database-foundation`
Create it from `main` before starting Ticket 1. Do not merge to main until all three tickets are done and all tests pass.

## Rules for Codex (Apply to All Tickets in This Epic)

- **Do not touch the frontend.** No `.tsx`, `.ts` file in `frontend/` is touched.
- **Do not change any existing business logic.** Only add columns, add tables, add migrations, and update field references as explicitly described.
- **Do not rename existing columns, tables, or files** unless explicitly instructed.
- **Do not add new API endpoints** unless explicitly instructed.
- **Do not change any existing API response shapes.** Existing endpoint outputs must remain identical.
- **Do not add features.** If something feels missing, add a comment in the code and leave it — do not implement it.
- **One migration file per ticket.** Do not combine or split migrations differently than specified.
- **Run the verification command at the end of each ticket before declaring it done.**

---

## Ticket E1-1 — Add Tenant Foundation

### Objective
Add a `tenants` table and a `tenant_id` column to every operational table. Backfill all existing rows with a default tenant. Ensure every new record written by the application includes a `tenant_id`.

### Context
The app currently has no tenant concept. All data is global. This ticket adds the structural boundary so that when authentication is introduced in Epic 2, every record already has an owner. No query filtering by tenant is added here — that comes in Epic 3.

---

### Step 1 — Add `Tenant` model to `backend/app/models.py`

Add this class **before** the `Customer` class:

```python
class Tenant(SQLModel, table=True):
  __tablename__ = "tenants"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  name: str
  status: str = Field(default="active", index=True)  # "active" | "suspended" | "disabled"
  owner_user_id: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
```

Add `tenant_id` field to the following existing model classes. Add it **after `id`** in each class:

```python
tenant_id: str = Field(foreign_key="tenants.id", index=True)
```

Add it to: `Customer`, `System`, `CustomerTransaction`, `CompanyTransaction`, `InventoryAdjustment`, `CashAdjustment`, `Expense`, `LedgerEntry`

---

### Step 2 — Add `DEFAULT_TENANT_ID` to `backend/app/config.py`

Add this constant at the bottom of the settings class or as a module-level constant — whichever pattern the file already uses:

```python
DEFAULT_TENANT_ID: str = "00000000-0000-0000-0000-000000000001"
```

---

### Step 3 — Write Alembic migration

Create file: `backend/alembic/versions_v2/g1_add_tenant_foundation.py`

The migration must do the following **in order**:

**upgrade():**
1. Create the `tenants` table with columns: `id` (VARCHAR PK), `name` (VARCHAR NOT NULL), `status` (VARCHAR NOT NULL DEFAULT 'active'), `owner_user_id` (VARCHAR NULLABLE), `created_at` (TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()), `updated_at` (TIMESTAMP WITH TIME ZONE NULLABLE)
2. Insert the default tenant row:
   ```sql
   INSERT INTO tenants (id, name, status, created_at)
   VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'active', now())
   ```
3. For each of the 8 tables below, add `tenant_id` as VARCHAR NOT NULL with DEFAULT `'00000000-0000-0000-0000-000000000001'`:
   - `customers`
   - `systems`
   - `customer_transactions`
   - `company_transactions`
   - `inventory_adjustments`
   - `cash_adjustments`
   - `expenses`
   - `ledger_entries`
4. For each table, add a FK constraint: `tenant_id` → `tenants.id`
5. For each table, add an index on `tenant_id`

**downgrade():**
1. Drop indexes on `tenant_id` from all 8 tables
2. Drop FK constraints on `tenant_id` from all 8 tables
3. Drop `tenant_id` column from all 8 tables
4. Drop the `tenants` table

---

### Step 4 — Add `tenant_id` to every record creation in routers and services

Import `DEFAULT_TENANT_ID` from config (or from `app.constants` if that is where it ends up) and add `tenant_id=DEFAULT_TENANT_ID` to every constructor call for the following models.

**`backend/app/routers/orders.py`** — `CustomerTransaction` constructors at lines: 178, 228, 281, 316

**`backend/app/routers/collections.py`** — `CustomerTransaction` constructors at lines: 75, 106, 133, 321, 394

**`backend/app/routers/customer_adjustments.py`** — `CustomerTransaction` constructors at lines: 86, 108, 130

**`backend/app/routers/inventory.py`** — `InventoryAdjustment` constructors at lines: 74, 102, 174, 207, 244 and `CompanyTransaction` constructors at lines: 286, 394, 427, 486

**`backend/app/routers/company.py`** — `CompanyTransaction` constructors at lines: 108, 173, 267, 336

**`backend/app/routers/cash.py`** — `CashAdjustment` constructors at lines: 76, 110, 135, 164 and `Expense` constructors at lines: 256, 288

**`backend/app/routers/expenses.py`** — `Expense` constructors at lines: 91, 133, 186, 220

**`backend/app/services/posting.py`** — Find every `LedgerEntry(` constructor call and add `tenant_id=DEFAULT_TENANT_ID`

Also add `tenant_id=DEFAULT_TENANT_ID` to every `Customer(` and `System(` constructor in:
- `backend/app/routers/customers.py`
- `backend/app/routers/systems.py`

---

### What NOT to do in this ticket

- Do not filter any queries by `tenant_id` — just write it; don't read it yet
- Do not change any query `.where()` clauses
- Do not change any response schemas or API outputs
- Do not add middleware
- Do not touch reports logic
- Do not touch the frontend

---

### Verification

```bash
cd backend
python -c "from app.models import Tenant, Customer, CustomerTransaction, LedgerEntry; print('Models OK')"
python -c "from app.config import Settings; s = Settings(); print('DEFAULT_TENANT_ID:', s.DEFAULT_TENANT_ID)"
alembic upgrade head
python -m pytest tests/ -v
```

Expected: models import without error, migration runs clean, all existing tests pass.

---

---

## Ticket E1-2 — Add Audit Columns, Group ID, and Database Constraints

### Objective
Add `updated_at`, `updated_by`, `created_by` to all records. Add `group_id` to the three tables missing it. Add database-level CHECK constraints for enum fields and the system_id business rule. All changes are additive — no logic changes.

### Context
These columns are nullable for now. `created_by` and `updated_by` will be populated with real user IDs once authentication is implemented in Epic 2. This ticket only adds the columns and constraints.

---

### Step 1 — Add columns to `backend/app/models.py`

**Add to `Customer` and `System`:**
```python
updated_at: Optional[datetime] = Field(
  default=None,
  sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
)
updated_by: Optional[str] = Field(default=None, nullable=True)
```

**Add to `CustomerTransaction`, `CompanyTransaction`, `InventoryAdjustment`, `CashAdjustment`, `Expense`:**
```python
created_by: Optional[str] = Field(default=None, nullable=True)
updated_at: Optional[datetime] = Field(
  default=None,
  sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
)
updated_by: Optional[str] = Field(default=None, nullable=True)
```

**Add `group_id` to `CompanyTransaction`, `Expense`, `CashAdjustment`** (it already exists in `CustomerTransaction` and `InventoryAdjustment`):
```python
group_id: Optional[str] = Field(default=None, index=True)
```

---

### Step 2 — Write Alembic migration

Create file: `backend/alembic/versions_v2/g2_add_audit_columns_and_constraints.py`

**upgrade():**

Part A — Add nullable columns:

```sql
-- customers
ALTER TABLE customers ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE customers ADD COLUMN updated_by VARCHAR;

-- systems
ALTER TABLE systems ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE systems ADD COLUMN updated_by VARCHAR;

-- customer_transactions
ALTER TABLE customer_transactions ADD COLUMN created_by VARCHAR;
ALTER TABLE customer_transactions ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE customer_transactions ADD COLUMN updated_by VARCHAR;

-- company_transactions
ALTER TABLE company_transactions ADD COLUMN created_by VARCHAR;
ALTER TABLE company_transactions ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE company_transactions ADD COLUMN updated_by VARCHAR;
ALTER TABLE company_transactions ADD COLUMN group_id VARCHAR;

-- inventory_adjustments
ALTER TABLE inventory_adjustments ADD COLUMN created_by VARCHAR;
ALTER TABLE inventory_adjustments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE inventory_adjustments ADD COLUMN updated_by VARCHAR;

-- cash_adjustments
ALTER TABLE cash_adjustments ADD COLUMN created_by VARCHAR;
ALTER TABLE cash_adjustments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE cash_adjustments ADD COLUMN updated_by VARCHAR;
ALTER TABLE cash_adjustments ADD COLUMN group_id VARCHAR;

-- expenses
ALTER TABLE expenses ADD COLUMN created_by VARCHAR;
ALTER TABLE expenses ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE expenses ADD COLUMN updated_by VARCHAR;
ALTER TABLE expenses ADD COLUMN group_id VARCHAR;
```

Add indexes on the new `group_id` columns:
```sql
CREATE INDEX ix_company_transactions_group_id ON company_transactions (group_id);
CREATE INDEX ix_cash_adjustments_group_id ON cash_adjustments (group_id);
CREATE INDEX ix_expenses_group_id ON expenses (group_id);
```

Part B — Add CHECK constraints:

```sql
ALTER TABLE customer_transactions
  ADD CONSTRAINT ck_customer_txn_kind
  CHECK (kind IN ('order', 'payment', 'return', 'payout', 'adjust'));

ALTER TABLE customer_transactions
  ADD CONSTRAINT ck_customer_txn_mode
  CHECK (mode IN ('replacement', 'sell_iron', 'buy_iron') OR mode IS NULL);

ALTER TABLE customer_transactions
  ADD CONSTRAINT ck_customer_txn_system_mode
  CHECK (
    (mode IN ('replacement', 'sell_iron') AND system_id IS NOT NULL)
    OR (mode IS NULL OR mode NOT IN ('replacement', 'sell_iron'))
  );

ALTER TABLE company_transactions
  ADD CONSTRAINT ck_company_txn_kind
  CHECK (kind IN ('refill', 'buy_iron', 'payment', 'adjust'));

ALTER TABLE expenses
  ADD CONSTRAINT ck_expense_kind
  CHECK (kind IN ('expense', 'deposit'));

ALTER TABLE expenses
  ADD CONSTRAINT ck_expense_paid_from
  CHECK (paid_from IN ('cash', 'bank') OR paid_from IS NULL);
```

**downgrade():**
Drop constraints first, then drop columns and indexes (reverse order of upgrade).

---

### Step 3 — No router changes required

The new columns are nullable. Existing write paths do not need to set them — they will default to NULL until Epic 2 populates them. Do not touch any router file.

---

### What NOT to do in this ticket

- Do not set `created_by` or `updated_by` in any router — leave them NULL for now
- Do not add middleware
- Do not change any existing query logic
- Do not touch the frontend
- Do not change any response schemas
- Do not add new API endpoints

---

### Verification

```bash
cd backend
python -c "from app.models import Customer, CustomerTransaction, CompanyTransaction, Expense, CashAdjustment, InventoryAdjustment; print('Models OK')"
alembic upgrade head
python -m pytest tests/ -v
```

Expected: migration runs clean on existing data with no constraint violations, all tests pass.

---

---

## Ticket E1-3 — Replace `is_reversed` Soft-Delete Pattern with `deleted_at`

### Objective
Replace the ambiguous `is_reversed` soft-delete pattern with a clean `deleted_at` / `deleted_by` / `reversal_source_id` approach. Backfill existing reversed records. Update every read filter and every write that sets `is_reversed`. The `is_reversed` and `reversed_id` columns are kept in the database but stop being used in application code.

### Context
Currently, "deleting" a record creates a new reversal row and sets `is_reversed = True` on the original. The new pattern is: set `deleted_at = now()` on the original record and set `reversal_source_id` on the new reversal row to point to what it reverses. The `reversed_id` column is kept (it serves a parallel purpose in `order_helpers.py`) but `is_reversed` is fully retired from application code.

---

### Step 1 — Add new columns to `backend/app/models.py`

Add to `CustomerTransaction`, `CompanyTransaction`, `InventoryAdjustment`, `CashAdjustment`, `Expense`:

```python
deleted_at: Optional[datetime] = Field(
  default=None,
  sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True, index=True),
)
deleted_by: Optional[str] = Field(default=None, nullable=True)
reversal_source_id: Optional[str] = Field(default=None, nullable=True, index=True)
```

Do NOT remove `is_reversed` or `reversed_id` from the model yet. They stay but are deprecated.

---

### Step 2 — Write Alembic migration

Create file: `backend/alembic/versions_v2/g3_add_soft_delete_columns.py`

**upgrade():**

1. Add columns to all 5 tables:
```sql
-- For each of: customer_transactions, company_transactions,
--              inventory_adjustments, cash_adjustments, expenses

ALTER TABLE <table> ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE <table> ADD COLUMN deleted_by VARCHAR;
ALTER TABLE <table> ADD COLUMN reversal_source_id VARCHAR;

CREATE INDEX ix_<table>_deleted_at ON <table> (deleted_at);
CREATE INDEX ix_<table>_reversal_source_id ON <table> (reversal_source_id);
```

2. Backfill — mark existing reversed records as deleted:
```sql
UPDATE customer_transactions
SET deleted_at = created_at, reversal_source_id = reversed_id
WHERE is_reversed = TRUE;

UPDATE company_transactions
SET deleted_at = created_at, reversal_source_id = reversed_id
WHERE is_reversed = TRUE;

UPDATE inventory_adjustments
SET deleted_at = created_at, reversal_source_id = reversed_id
WHERE is_reversed = TRUE;

UPDATE cash_adjustments
SET deleted_at = created_at, reversal_source_id = reversed_id
WHERE is_reversed = TRUE;

UPDATE expenses
SET deleted_at = created_at, reversal_source_id = reversed_id
WHERE is_reversed = TRUE;
```

**downgrade():**
Drop indexes and columns (reverse order).

---

### Step 3 — Update all READ filters in router files

Every line that filters `.where(X.is_reversed == False)` must become `.where(X.deleted_at == None)`.

Every line that checks `if not x or x.is_reversed:` must become `if not x or x.deleted_at is not None:`.

**`backend/app/routers/orders.py`**
- Line 124: `.where(CustomerTransaction.is_reversed == False)` → `.where(CustomerTransaction.deleted_at == None)`
- Line 69: `if not order or order.kind != "order" or order.is_reversed:` → `if not order or order.kind != "order" or order.deleted_at is not None:`
- Line 208: `if not existing or existing.kind != "order" or existing.is_reversed:` → `if not existing or existing.kind != "order" or existing.deleted_at is not None:`
- Line 310: `if not existing or existing.kind != "order" or existing.is_reversed:` → `if not existing or existing.kind != "order" or existing.deleted_at is not None:`

**`backend/app/routers/collections.py`**
- Lines 202, 250, 283: `.where(CustomerTransaction.is_reversed == False)` → `.where(CustomerTransaction.deleted_at == None)`

**`backend/app/routers/customer_adjustments.py`**
- Lines 51, 76: `.where(CustomerTransaction.is_reversed == False)` → `.where(CustomerTransaction.deleted_at == None)`

**`backend/app/routers/inventory.py`**
- Line 134: `.where(InventoryAdjustment.is_reversed == False)` → `.where(InventoryAdjustment.deleted_at == None)`
- Line 324: `.where(CompanyTransaction.is_reversed == False)` → `.where(CompanyTransaction.deleted_at == None)`
- Line 167: `if not existing or existing.is_reversed:` → `if not existing or existing.deleted_at is not None:`
- Line 238: `if not existing or existing.is_reversed:` → `if not existing or existing.deleted_at is not None:`
- Line 358: `if not row or row.is_reversed or row.kind != "refill":` → `if not row or row.deleted_at is not None or row.kind != "refill":`
- Line 387: `if not existing or existing.is_reversed or existing.kind != "refill":` → `if not existing or existing.deleted_at is not None or existing.kind != "refill":`
- Line 480: `if not existing or existing.is_reversed or existing.kind != "refill":` → `if not existing or existing.deleted_at is not None or existing.kind != "refill":`

**`backend/app/routers/expenses.py`**
- Line 50: `.where(Expense.is_reversed == False)` → `.where(Expense.deleted_at == None)`
- Line 129: `if expense.is_reversed:` → `if expense.deleted_at is not None:`
- Line 169: `if not expense or expense.kind != "expense" or expense.is_reversed:` → `if not expense or expense.kind != "expense" or expense.deleted_at is not None:`

**`backend/app/routers/cash.py`**
- Line 36: `.where(CashAdjustment.is_reversed == False)` → `.where(CashAdjustment.deleted_at == None)`
- Line 202: `.where(Expense.is_reversed == False)` → `.where(Expense.deleted_at == None)`
- Line 105: `if not existing or existing.is_reversed:` → `if not existing or existing.deleted_at is not None:`
- Line 160: `if not existing or existing.is_reversed:` → `if not existing or existing.deleted_at is not None:`
- Line 284: `if not existing or existing.is_reversed:` → `if not existing or existing.deleted_at is not None:`

**`backend/app/routers/company.py`**
- Line 207: `.where(CompanyTransaction.is_reversed == False)` → `.where(CompanyTransaction.deleted_at == None)`

**`backend/app/routers/reports.py`**
- Lines 133, 172, 200, 366: `.where(CompanyTransaction.is_reversed == False)` → `.where(CompanyTransaction.deleted_at == None)`
- Lines 159, 181, 191, 360: `.where(CustomerTransaction.is_reversed == False)` → `.where(CustomerTransaction.deleted_at == None)`
- Lines 210, 372: `.where(Expense.is_reversed == False)` → `.where(Expense.deleted_at == None)`
- Lines 219, 378: `.where(CashAdjustment.is_reversed == False)` → `.where(CashAdjustment.deleted_at == None)`
- Line 384: `.where(InventoryAdjustment.is_reversed == False)` → `.where(InventoryAdjustment.deleted_at == None)`

**`backend/app/routers/customers.py`**
- Lines 51, 64, 200: `.where(CustomerTransaction.is_reversed == False)` → `.where(CustomerTransaction.deleted_at == None)`

**`backend/app/routers/systems.py`**
- Line 146: `.where(CustomerTransaction.is_reversed == False)` → `.where(CustomerTransaction.deleted_at == None)`

**`backend/app/services/order_helpers.py`**
- Line 138: `while current.is_reversed and current.id not in visited:` → `while current.deleted_at is not None and current.id not in visited:`

---

### Step 4 — Update all WRITE operations (setting is_reversed)

Every line that sets `is_reversed = True` on an existing record must instead set `deleted_at = datetime.now(timezone.utc)`. Every line that creates a NEW reversal record with `is_reversed=True` must instead set `deleted_at=datetime.now(timezone.utc)` AND set `reversal_source_id=<original>.id`.

Every line that creates a NEW record with `is_reversed=False` must simply remove that parameter (False is no longer needed since NULL `deleted_at` means active).

**Import required** — ensure `from datetime import timezone` is imported in every file that sets `deleted_at`.

**`backend/app/routers/orders.py`**
- Line 195: Remove `is_reversed=False,` from constructor
- Line 228 area (reversal creation): Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 258: Replace `existing.is_reversed = True` with `existing.deleted_at = datetime.now(timezone.utc)`
- Line 281 area (reversal creation): Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 297: Remove `is_reversed=False,`
- Line 332 area: Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 346: Replace `existing.is_reversed = True` with `existing.deleted_at = datetime.now(timezone.utc)`

**`backend/app/routers/collections.py`**
- Lines 92, 123, 150: Remove `is_reversed=False,` from constructors
- Line 337 area: Replace `is_reversed=True, reversed_id=txn.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=txn.id`
- Line 351: Replace `txn.is_reversed = True` with `txn.deleted_at = datetime.now(timezone.utc)`
- Line 410 area: Replace `is_reversed=True, reversed_id=txn.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=txn.id`
- Line 424: Replace `txn.is_reversed = True` with `txn.deleted_at = datetime.now(timezone.utc)`

**`backend/app/routers/customer_adjustments.py`**
- Lines 100, 122, 144: Remove `is_reversed=False,` from constructors

**`backend/app/routers/inventory.py`**
- Lines 81, 111, 215, 303, 443: Remove `is_reversed=False,` from constructors
- Line 182 area: Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 196: Replace `existing.is_reversed = True` with `existing.deleted_at = datetime.now(timezone.utc)`
- Line 252 area: Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 266: Replace `existing.is_reversed = True` with `existing.deleted_at = datetime.now(timezone.utc)`
- Line 410 area: Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 424: Replace `existing.is_reversed = True` with `existing.deleted_at = datetime.now(timezone.utc)`
- Line 502 area: Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 516: Replace `existing.is_reversed = True` with `existing.deleted_at = datetime.now(timezone.utc)`

**`backend/app/routers/expenses.py`**
- Lines 101, 230: Remove `is_reversed=False,` from constructors
- Line 144 area: Replace `is_reversed=True, reversed_id=expense.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=expense.id`
- Line 157: Replace `expense.is_reversed = True` with `expense.deleted_at = datetime.now(timezone.utc)`
- Line 197 area: Replace `is_reversed=True, reversed_id=expense.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=expense.id`
- Line 210: Replace `expense.is_reversed = True` with `expense.deleted_at = datetime.now(timezone.utc)`

**`backend/app/routers/cash.py`**
- Lines 82, 141, 266: Remove `is_reversed=False,` from constructors
- Line 117 area: Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 130: Replace `existing.is_reversed = True` with `existing.deleted_at = datetime.now(timezone.utc)`
- Line 171 area: Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 184: Replace `existing.is_reversed = True` with `existing.deleted_at = datetime.now(timezone.utc)`
- Line 299 area: Replace `is_reversed=True, reversed_id=existing.id` with `deleted_at=datetime.now(timezone.utc), reversal_source_id=existing.id`
- Line 312: Replace `existing.is_reversed = True` with `existing.deleted_at = datetime.now(timezone.utc)`

**`backend/app/routers/company.py`**
- Lines 120, 181, 277, 346: Remove `is_reversed=False,` from constructors

---

### Step 5 — Update `is_deleted` display fields

Several places pass `is_deleted=row.is_reversed` to output schemas. Update these to use `deleted_at`:

- `backend/app/routers/cash.py` lines 52, 73: `is_deleted=row.is_reversed` → `is_deleted=row.deleted_at is not None`
- `backend/app/routers/collections.py` line 185: `is_deleted=txns[0].is_reversed` → `is_deleted=txns[0].deleted_at is not None`
- `backend/app/routers/expenses.py` line 74, 224: `is_deleted=row.is_reversed` → `is_deleted=row.deleted_at is not None`
- `backend/app/routers/inventory.py` lines 153, 348, 377: `is_deleted=row.is_reversed` → `is_deleted=row.deleted_at is not None`
- `backend/app/services/order_helpers.py` line 175: `is_deleted=txn.is_reversed` → `is_deleted=txn.deleted_at is not None`

---

### What NOT to do in this ticket

- Do not remove `is_reversed` or `reversed_id` columns from the database — they stay
- Do not remove `is_reversed` or `reversed_id` fields from `models.py` — they stay
- Do not change any business logic beyond the mechanical find-and-replace described above
- Do not touch the frontend
- Do not change any API response shapes
- Do not add new features or endpoints
- Do not change `order_helpers.py` line 143 (the `reversed_id` query) — `reversed_id` is still used there and is not being retired

---

### Verification

```bash
cd backend
python -c "from app.models import CustomerTransaction; print('has deleted_at:', hasattr(CustomerTransaction, 'deleted_at'))"
alembic upgrade head
python -c "
from app.db import get_session
# Check that no code still references is_reversed in a filter
import subprocess
result = subprocess.run(['grep', '-rn', 'is_reversed ==', 'app/'], capture_output=True, text=True)
print('Remaining is_reversed == occurrences:', result.stdout or 'NONE - OK')
"
python -m pytest tests/ -v
```

Expected: no remaining `is_reversed ==` filter usage, migration runs clean, all tests pass.

---

## Merge Criteria

Merge `epic/1-database-foundation` to `main` only when:
- [ ] All three tickets are implemented
- [ ] `alembic upgrade head` runs clean
- [ ] `python -m pytest tests/ -v` passes with 0 failures
- [ ] No `is_reversed ==` filter usage remains in any router or service file
- [ ] No TypeScript/frontend errors (frontend is unchanged; confirm with `npm run lint` in `frontend/`)
- [ ] A manual smoke test confirms: creating an order, creating a collection, creating a refill, deleting an order — all work correctly and the deleted record no longer appears in listings
