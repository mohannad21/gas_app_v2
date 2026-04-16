# Epic 3 — Tenant Isolation Enforcement

## Branch
All tickets work on branch: `epic/3-tenant-isolation`
Create it from `main` (after Epic 2 is merged) before starting Ticket 1. Do not merge to main until all tickets are done and all tests pass.

## Context

Epic 2 added real user authentication. Every authenticated request now carries a JWT whose `sub` is a real `users.id`. Every `User` row has a `tenant_id` FK pointing to `tenants`.

**Current problem:** All routers hardcode `DEFAULT_TENANT_ID` when inserting records, and no SELECT queries filter by `tenant_id`. This means any authenticated user can read and write data that belongs to another tenant.

**Goal:** Every data-read and data-write operation must be scoped to the tenant of the authenticated user. No data from other tenants should ever be returned or mutated.

## Rules for Codex (Apply to All Tickets in This Epic)

- **Do not touch any existing business logic, response shapes, or validation rules.** Only add the tenant scoping where specified.
- **Do not rename functions, change parameter order, or reformat code.** Mechanical additions only.
- **Do not add a `tenant_id` filter to `PriceCatalog` queries** — that table has no `tenant_id` and is shared globally.
- **Do not touch `system_global.py`** — it is an internal integrity checker, not a tenant-scoped endpoint.
- **Read every file before modifying it.**
- **Run the verification command at the end of each ticket before declaring it done.**

---

## Ticket E3-1 — Add `get_tenant_id` Dependency + Scope Core Transaction Routers

### Objective
Add a `get_tenant_id` FastAPI dependency to `auth.py`. Apply it to `orders.py`, `customers.py`, `customer_adjustments.py`, and `collections.py`.

### Part A — Add `get_tenant_id` to `backend/app/auth.py`

Add the following function **at the end** of `backend/app/auth.py`. Do not modify any existing function.

```python
from typing import Annotated
from fastapi import Depends, HTTPException, status
from sqlmodel import Session

def get_tenant_id(
    user_id: Annotated[str, Depends(get_current_user)],
    session: Annotated[Session, Depends("app.db:get_session")],
) -> str:
    """Resolves the tenant_id for the authenticated user."""
    from app.models import User
    from app.db import get_session as _get_session
    user = session.get(User, user_id)
    if not user or not user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="tenant_not_found")
    return user.tenant_id
```

**Important:** The dependency imports `get_session` from `app.db`. Use the existing `get_session` dependency — do not import a new one. The actual function signature should use `Depends(get_session)` directly (not a string):

```python
from app.db import get_session

def get_tenant_id(
    user_id: Annotated[str, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> str:
    from app.models import User
    user = session.get(User, user_id)
    if not user or not user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="tenant_not_found")
    return user.tenant_id
```

Add to imports at the top of `auth.py`:
```python
from sqlmodel import Session
```
(It may already exist — check before adding.)

---

### Part B — Update `backend/app/routers/orders.py`

**Current imports** include `from app.config import DEFAULT_TENANT_ID`. After this ticket, that import is no longer needed in this file — remove it and replace with:
```python
from app.auth import get_tenant_id
```

**For every handler** (`list_orders`, `create_order`, `update_order`, `delete_order`):
1. Add `tenant_id: Annotated[str, Depends(get_tenant_id)]` as a parameter.
2. Replace `DEFAULT_TENANT_ID` with `tenant_id` in all INSERT/update operations.
3. Add `.where(CustomerTransaction.tenant_id == tenant_id)` (and `.where(Customer.tenant_id == tenant_id)` where customers are queried) to all SELECT statements that currently have no tenant filter.

The `list_orders` handler queries `CustomerTransaction`. Add `.where(CustomerTransaction.tenant_id == tenant_id)` to that query.

All `create_order`, `update_order`, and `delete_order` handlers set `tenant_id=DEFAULT_TENANT_ID` on new records — replace with `tenant_id=tenant_id`.

---

### Part C — Update `backend/app/routers/customers.py`

Add `from app.auth import get_tenant_id` to imports. Remove `from app.config import DEFAULT_TENANT_ID`.

**`list_customers`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. Add `.where(Customer.tenant_id == tenant_id)` to the SELECT.

**`get_customer`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. After fetching the customer, add:
```python
if customer.tenant_id != tenant_id:
    raise HTTPException(status_code=404, detail="not_found")
```

**`get_customer_balances`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. After fetching the customer, check `customer.tenant_id != tenant_id` → 404.

**`create_customer`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. Replace `tenant_id=DEFAULT_TENANT_ID` with `tenant_id=tenant_id`.

**`update_customer`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. Check `customer.tenant_id != tenant_id` → 404.

**`delete_customer`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. Check `customer.tenant_id != tenant_id` → 404.

The private helper functions `_customer_balances`, `_replacement_order_count_query`, `_replacement_order_count_grouped_query` are called with a `customer_id` already resolved from a customer that passed the tenant check — no changes needed to those helpers.

---

### Part D — Update `backend/app/routers/customer_adjustments.py`

Add `from app.auth import get_tenant_id` to imports. Remove `from app.config import DEFAULT_TENANT_ID`.

**`list_adjustments`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. Add `.where(CustomerTransaction.tenant_id == tenant_id)` to the SELECT.

**`create_adjustment`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. Replace all `tenant_id=DEFAULT_TENANT_ID` with `tenant_id=tenant_id`.

**`update_adjustment`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. After fetching the existing transactions, check that the first result's `tenant_id` matches — if not, raise 404. Replace `tenant_id=DEFAULT_TENANT_ID` with `tenant_id=tenant_id` on new records.

**`delete_adjustment`:** Add `tenant_id: Annotated[str, Depends(get_tenant_id)]`. Check tenant ownership of fetched rows before mutating.

---

### Part E — Update `backend/app/routers/collections.py`

Add `from app.auth import get_tenant_id` to imports. Remove `from app.config import DEFAULT_TENANT_ID`.

Apply the same pattern to every handler:
- `list_collections` — add tenant param, filter SELECT by `CustomerTransaction.tenant_id == tenant_id`
- `create_collection` — add tenant param, replace `DEFAULT_TENANT_ID`
- `update_collection` — add tenant param, tenant-check fetched records, replace `DEFAULT_TENANT_ID` on new records
- `delete_collection` — add tenant param, tenant-check fetched records

---

### Verification

```bash
cd backend && python -c "
from app.routers.orders import router
from app.routers.customers import router
from app.routers.customer_adjustments import router
from app.routers.collections import router
from app.auth import get_tenant_id
print('E3-1 imports OK')
"
```

---

## Ticket E3-2 — Scope Remaining Business Routers

### Objective
Apply `get_tenant_id` to `cash.py`, `company.py`, `expenses.py`, `inventory.py`, and `systems.py`.

### General pattern (same for all files in this ticket)

For each file:
1. Add `from app.auth import get_tenant_id` to imports.
2. Remove `from app.config import DEFAULT_TENANT_ID`.
3. Add `tenant_id: Annotated[str, Depends(get_tenant_id)]` to every handler that currently uses `DEFAULT_TENANT_ID` or runs a SELECT without a tenant filter.
4. Replace every `DEFAULT_TENANT_ID` with `tenant_id`.
5. Add `.where(Model.tenant_id == tenant_id)` to all top-level SELECT queries that fetch tenant-owned data.

### `backend/app/routers/cash.py` (7 DEFAULT_TENANT_ID usages)

Models queried/written: `CashAdjustment`, and related ledger operations. Apply tenant filter to all SELECTs and replace all `DEFAULT_TENANT_ID` on inserts.

### `backend/app/routers/company.py` (5 DEFAULT_TENANT_ID usages)

Models queried/written: `CompanyTransaction`. Apply tenant filter to all SELECTs and replace all `DEFAULT_TENANT_ID` on inserts.

### `backend/app/routers/expenses.py` (5 DEFAULT_TENANT_ID usages)

Models queried/written: `Expense`. Apply tenant filter to all SELECTs and replace all `DEFAULT_TENANT_ID` on inserts.

### `backend/app/routers/inventory.py` (10 DEFAULT_TENANT_ID usages)

Models queried/written: `InventoryAdjustment`, `InventoryRefill`, and related. Apply tenant filter to all SELECTs and replace all `DEFAULT_TENANT_ID` on inserts.

Note: `inventory.py` is 522 lines. Read it fully before editing. There are multiple `select()` calls across several handlers — each one must get the tenant filter.

### `backend/app/routers/systems.py` (2 DEFAULT_TENANT_ID usages)

**`list_systems`:** Add tenant param. Add `.where(System.tenant_id == tenant_id)` to the SELECT.

**`create_system`:** Add tenant param. Replace `tenant_id=DEFAULT_TENANT_ID`.

**`update_system`:** Add tenant param. After fetching the system, check `system.tenant_id != tenant_id` → 404.

**`delete_system`:** Add tenant param. After fetching the system, check `system.tenant_id != tenant_id` → 404.

---

### Verification

```bash
cd backend && python -c "
from app.routers.cash import router
from app.routers.company import router
from app.routers.expenses import router
from app.routers.inventory import router
from app.routers.systems import router
print('E3-2 imports OK')
"
```

---

## Ticket E3-3 — Scope Reports Router

### Objective
Update `backend/app/routers/reports.py` so all queries are scoped to the authenticated user's tenant.

### Context

`reports.py` has two public handlers:
- `list_daily_reports_v2` — returns a list of summary cards by day
- `get_daily_report_v2` — returns detailed event breakdown for a specific day

Both handlers run multiple `select()` queries against `CustomerTransaction`, `CompanyTransaction`, `Expense`, `CashAdjustment`, `InventoryAdjustment`, `LedgerEntry`, `Customer`, and `System`. None of these currently filter by `tenant_id`.

All of those models have a `tenant_id` field.

### Changes

1. Add `from app.auth import get_tenant_id` to imports.
2. Add `tenant_id: Annotated[str, Depends(get_tenant_id)]` to both `list_daily_reports_v2` and `get_daily_report_v2`.
3. For **every** `select(...)` call in both handlers that queries a tenant-owned model, add `.where(Model.tenant_id == tenant_id)`.

**Models to filter by tenant in `list_daily_reports_v2`:**
- `CompanyTransaction.tenant_id == tenant_id` (lines ~129, ~169, ~197)
- `CustomerTransaction.tenant_id == tenant_id` (lines ~156, ~177, ~187)
- `Expense.tenant_id == tenant_id` (line ~206)
- `CashAdjustment.tenant_id == tenant_id` (line ~216)
- `Customer.tenant_id == tenant_id` (line ~152)

**Models to filter by tenant in `get_daily_report_v2`:**
- `LedgerEntry.tenant_id == tenant_id` (line ~352)
- `CustomerTransaction.tenant_id == tenant_id` (line ~358)
- `CompanyTransaction.tenant_id == tenant_id` (line ~364)
- `Expense.tenant_id == tenant_id` (line ~370)
- `CashAdjustment.tenant_id == tenant_id` (line ~376)
- `InventoryAdjustment.tenant_id == tenant_id` (line ~382)
- `Customer.tenant_id == tenant_id` (line ~390) — filter the full fetch, not the dict comprehension filter
- `System.tenant_id == tenant_id` (line ~393) — same

**Note:** The line numbers above are approximate. Read the file and apply tenant filters to every top-level `select()` call. Do not add tenant filters inside the `_customer_balances`, `_replacement_order_count_query`, or `_replacement_order_count_grouped_query` private helpers — those are called with specific customer IDs already scoped.

**Do not change any response shape, aggregation logic, or field names.**

---

### Verification

```bash
cd backend && python -c "
from app.routers.reports import router
from app.auth import get_tenant_id
print('E3-3 imports OK')
"
```

Then run the full test suite:

```bash
cd backend && pytest tests/ -q
```

Expected: all tests pass, no import errors.
