# Activity Kind Refactoring — Ticket Plan

**Last updated:** 2026-06-04
**Status:** T1–T9 complete. **T4-CLEANUP** complete. **T10** is future work.

---

## Introduction

This document defines the complete, ordered refactoring plan to eliminate activity kind naming inconsistencies across the gas_app_v2 codebase.

### The Problem

The same business event (e.g. a replacement order, a customer payment) is referred to by different names depending on where in the code you look:

- The **database and reports API** use canonical names like `replacement`, `payment_from_customer`
- The **add-screen adapter** (`activityAdapter.ts`) emits synthetic names like `"order"`, `"collection_money"`, `"company_payment"` — none of which are canonical
- **Color maps, icon handlers, and filter logic** still reference a third set of legacy aliases like `cash_adjust`, `company_buy_iron`, `adjust`

This fragmentation causes:
- Silent rendering bugs — unrecognized kinds fall through to a default icon/color with no error
- `payment_from_company` has **zero** frontend handlers — it renders as a grey circle (`ellipse-outline`) on all screens
- Activity labels are hardcoded English strings in dozens of places, making Arabic translation impossible without touching every file
- `bank_deposit` encodes direction via a secondary `transfer_direction` field instead of using two distinct event types

### The Goal

Every canonical activity kind is represented by exactly one name in every layer of the codebase. Labels, icons, colors, and filter groups are owned by a single source of truth (`activityKindMeta.ts`). During migration, a single `normalizeEventType()` gateway is the only place where legacy aliases are accepted. After Ticket 9, legacy aliases are removed from production display code entirely.

### Canonical Activity Kinds (18 total)

| # | Canonical Kind | Description |
|---|---|---|
| 1 | `replacement` | Deliver full cylinders, collect empties |
| 2 | `sell_full` | Deliver full cylinders only |
| 3 | `buy_empty_from_customer` | Collect empty cylinders only |
| 4 | `payment_from_customer` | Cash received from customer |
| 5 | `payment_to_customer` | Cash refunded to customer |
| 6 | `customer_return_empties` | Customer returns empties at shop |
| 7 | `adjust_customer_balance` | Manual correction on customer account |
| 8 | `refill` | Receive full cylinders from company, return empties |
| 9 | `dist_return_empties` | Return empties to company only |
| 10 | `buy_full_from_company` | Buy full cylinders from company |
| 11 | `payment_to_company` | Pay money to company |
| 12 | `payment_from_company` | Receive money from company |
| 13 | `adjust_company_balance` | Manual correction on company account |
| 14 | `expense` | Business expense |
| 15 | `wallet_to_bank` | Transfer from wallet to bank |
| 16 | `bank_to_wallet` | Transfer from bank to wallet |
| 17 | `adjust_wallet` | Manual wallet adjustment |
| 18 | `adjust_inventory` | Manual inventory adjustment |

Note: `bank_deposit` is split into `wallet_to_bank` and `bank_to_wallet` as part of this refactoring (Ticket 2).

### Namespace Definitions

| Namespace | Examples | Used where |
|---|---|---|
| `ActivityKind` | `replacement`, `payment_from_customer` | Report event types — the canonical list above |
| `LedgerSourceType` | `cash_adjust`, `customer_txn` | Backend ledger DB keys — never used in display code |
| `OrderMode` | `replacement`, `sell_iron`, `buy_iron` | Adapter/input only — maps to canonical kinds in Ticket 8 |
| `TransferDirection` | `wallet_to_bank`, `bank_to_wallet` | Temporary field during bank split migration |
| `UiFilterKind` | `customer`, `company`, `expenses`, `ledger` | Frontend filter grouping only |
| `AddScreenFilterKind` | `company_payment`, `received_from_company`, `cash_adjustment` | Add-screen UI filters only - not report event types |
| `AddListItemKind` | `bank_transfer`, `company_payment`, `cash_adjustment` | Add-screen local row/list kinds only - not report event types |
| `QueryKey` | `bank_deposits` | Frontend cache keys only - not report event types |

### Standing Acceptance Rule

> **No code should decide activity identity from label text, hero text, amount sign, or quantities — unless it is a documented migration/backfill shim with a `TODO(T9)` removal comment.**

This rule applies to every layer: backend routers, report builder, frontend adapters, display components, and tests. Any code that infers what *kind* of activity something is from indirect signals (quantities, signs, label strings) instead of reading the stored canonical `kind` is a bug. The only acceptable exceptions are:
- One-time Alembic backfill migrations for historical bad rows
- Temporary defensive shims marked `TODO(T9)` for the migration window

### Compatibility Policy

- During migration, legacy aliases are accepted **only** inside `normalizeEventType()` — nowhere else in the frontend
- After Ticket 9, legacy aliases are removed from `normalizeEventType()` as well; canonical `ActivityKind` values are the only accepted production display values
- `LedgerSourceType` values (e.g. `"cash_adjust"`, `"inventory_adjust"`) are internal DB keys and **must never appear in display code**
- `AddScreenFilterKind`, `AddListItemKind`, and `QueryKey` values are separate frontend namespaces and must not be blindly migrated as `ActivityKind` values in Ticket 8
- Frontend display **never** reads `event.label` as its primary source — it derives the label from `event_type` via `activityKindMeta`; `event.label` is a fallback only
- `transfer_direction` is kept for one migration window after the bank split and removed in Ticket 9
- Ticket 9 (cleanup) runs **only** after Ticket 8 is complete, Ticket 7 tests pass, and a UI walkthrough confirms migration is complete
- `normalizeEventType()` legacy aliases are removed **only** after the migration window has closed and no old app version or cached data can still send them

### Source of Truth for Labels

`activity_feature_matrix.csv` is the approved source for agreed English label strings. All backend and frontend labels must align to it.

### Execution Order

```
T1 (docs) → T2 (backend contract) → T2b (write path canonicalization) → T3 (backend tests) → T4 (frontend metadata)
  → T5 (translation-ready labels) → T6 (balance wording) → T6-TESTS (test fixes)
  → T-ICONS (icon renderer) → T-ICON-LAYOUT (icon layout fixes)
  → T7 (frontend tests) → T8 (adapter migration) → T9 (cleanup) → T10 (opening balance)
```

---

## Ticket 1 — Source of Truth Documentation

**Goal:** Lock the naming/refactor contract before any code moves.

**Preconditions:** None.

**Work:**
- Finalize `ACTIVITY_KIND_NAMING.md` with the 18-kind matrix
- Confirm `activity_feature_matrix.csv` is the approved label source of truth
- Define all namespaces (ActivityKind, LedgerSourceType, OrderMode, TransferDirection, UiFilterKind, AddScreenFilterKind, AddListItemKind, QueryKey)
- Add the compatibility policy (see Introduction above)

### 1b — Approval Gates Before Implementation

The following matrices must be reviewed and approved by the project owner before any ticket beyond T1 begins implementation:

1. **Activity label matrix:** All 18 canonical kinds with exact English labels from `activity_feature_matrix.csv`.
2. **Activity metadata matrix:** Canonical kind, label key, icon, color, filter group, scope for all 18 kinds.
3. **Report subtype/filter matrix:** How each canonical kind maps to a second-level filter chip in the reports screen; which kinds share a chip (e.g. return-only refill vs normal refill).
4. **Legacy alias matrix:** Every old frontend alias mapped to a canonical kind, and which ticket removes it.
5. **Balance wording/sign matrix:** Debt/credit wording for customer/company money and cylinders (already code-derived in `balanceTransitions.ts`; confirm it matches user expectations).
6. **Bank migration matrix:** `bank_deposit → wallet_to_bank / bank_to_wallet` split; how long `transfer_direction` stays in backend responses before T9 drops it.
7. **DB ledger-source repair matrix:** Confirm repair backfill (`adjust_wallet → cash_adjust`, `adjust_inventory → inventory_adjust`) is correct and should ship as a standalone migration.

**Final-state rule:** Backend and frontend must eventually use the same canonical `ActivityKind` values everywhere. `normalizeEventType()` is a temporary migration gateway; all legacy alias handling is removed in T9.

**Files:**
- `ACTIVITY_SPEC.md`

**Done when:** `ACTIVITY_SPEC.md` is reviewed and approved by the project owner; all approval gate matrices from section 1b are signed off.

**STATUS: COMPLETE** — activity-kind decisions finalized and owner-approved 2026-05-31; current canonical reference is `ACTIVITY_SPEC.md`.

---

## Ticket 2 — Backend Event Contract

**Goal:** Backend emits canonical report events with aligned labels and hero text.

**Files:**
- `backend/app/constants/activity_kinds.py` (new)
- `backend/app/routers/reports.py`
- `backend/app/services/reports_event_fields.py`
- `backend/app/schemas/report.py` (only if introducing a typed `ActivityKind` enum)

**Work:**

### 2a — Constants
Create `backend/app/constants/activity_kinds.py` with string constants for all 18 canonical kinds. Replace all hardcoded report event strings in `reports.py` and `reports_event_fields.py` with these constants.

### 2b — Label alignment
Update `_EVENT_LABELS` and `_ORDER_LABELS` in `reports_event_fields.py` to match the CSV-agreed labels:

| Kind | Label |
|---|---|
| `replacement` | Replace |
| `sell_full` | Sell full |
| `buy_empty_from_customer` | Buy empties |
| `payment_from_customer` | Payment from customer |
| `payment_to_customer` | Payment to customer |
| `customer_return_empties` | Empties from customer |
| `adjust_customer_balance` | Adjust customer balance |
| `dist_return_empties` | Empties to company |
| `buy_full_from_company` | Buy fulls |
| `payment_to_company` | Payment to company |
| `payment_from_company` | Payment from company |
| `adjust_company_balance` | Adjust company balance |
| `adjust_inventory` | Adjust inventory |
| `adjust_wallet` | Adjust wallet |
| `wallet_to_bank` | Wallet to bank |
| `bank_to_wallet` | Bank to wallet |

### 2c — Hero text alignment
Align all `hero_text` values to the matrix. Where the matrix specifies null/empty (e.g. `adjust_customer_balance`, `adjust_company_balance`), the backend must return null — not a placeholder string.

### 2d — Bank split
In `reports.py` around line 569, replace `event_type="bank_deposit"` with `event_type="wallet_to_bank"` or `event_type="bank_to_wallet"` based on `transfer_direction`. Keep `transfer_direction` in the response for one migration window.

Rules:
- `/reports/day` must emit `wallet_to_bank` or `bank_to_wallet` — never `event_type="bank_deposit"` after this ticket.
- Backend must not infer bank direction from label text; direction comes only from the stored `transfer_direction` field.
- `transfer_direction` stays in the response temporarily for frontend compatibility only.

### 2e — Schema
If introducing an `ActivityKind` `Literal`/`Enum` on `event_type` in `backend/app/schemas/report.py`, include all 18 canonical kinds. If `event_type` remains `str`, no schema change is needed.

### 2f — Consolidate company-payment label logic
`reports_event_fields.py` has duplicate company-payment sign logic: `_company_payment_label()` (line 48) is the named helper, but `_event_label()` has an inline copy of the same sign check at lines 64-68. While aligning backend labels in 2b, route both `_event_label()` and hero-text generation through `_company_payment_label()` to eliminate the duplication. Do not leave two copies of the same sign logic.

**Protected:** `source_type="cash_adjust"` and `source_type="inventory_adjust"` are DB ledger lookup keys. Do not rename or remove them while changing report `event_type` values.

**Done when:** `/reports/day` emits canonical event types, matrix-aligned labels, and correctly set hero text; bank events use canonical types only; company-payment label logic is in one place.

**STATUS: COMPLETE** — backend emits canonical event types; bank split (`wallet_to_bank` / `bank_to_wallet`) shipped; label alignment done.

---

## Ticket 2b — Write Path Canonicalization

**Goal:** Every write path stores the correct canonical `ActivityKind` in the database at creation time. No downstream layer (report builder, frontend display) should infer, compute, or guess the activity kind from quantities, signs, or amounts.

**Guiding rule:** `user intent → canonical kind in API payload → canonical kind in DB → canonical event_type in reports → frontend renders by event_type`

**Preconditions:** Ticket 2 done.

**Confirmed bugs:**
- `/inventory/refill` always writes `CompanyTransaction.kind = "refill"` regardless of whether the user action was return-only (`dist_return_empties`). **Buy-full is NOT affected** — the Buy tab routes to `/company/buy_iron` which already hardcodes `kind="buy_full_from_company"` correctly.
- `/company/payments` infers `kind` from amount sign (`kind="payment_to_company" if payload.amount >= 0 else "payment_from_company"`) — the UI action already knows the direction; it should send it explicitly.
- Multiple read/edit/delete paths in `inventory.py` guard on `kind == "refill"` only, so they will silently fail or 404 for `dist_return_empties` rows after the write-path fix.

**Files:**
- `backend/app/schemas/inventory.py` (`InventoryRefillCreate`, `InventoryRefillUpdate`, `InventoryRefillDetails`)
- `backend/app/schemas/transaction.py` (`CompanyPaymentCreate`)
- `backend/app/routers/inventory.py`
- `backend/app/routers/company.py`
- `backend/app/routers/reports.py` (refill_days filter + temporary shim)
- `frontend/types/inventory.ts` (`InventoryRefillDetailsSchema`)
- `frontend/types/transaction.ts` (company payment type if applicable)
- `frontend/lib/api/inventory.ts` (`createInventoryRefill`, `updateInventoryRefill`)
- `frontend/lib/api/company.ts`
- `frontend/components/AddRefillModal.tsx`
- New Alembic migration
- `tests/backend/test_write_path_canonicalization.py` (new)

---

### 2b-a — Audit all write paths

Before implementing any fix, read each endpoint and verify that the stored kind equals the canonical `ActivityKind`, set explicitly from the request — not inferred from quantities or signs. For every path where inference or hardcoding is found, apply the same pattern as 2b-b.

| Canonical Kind | Write Endpoint | Field to verify |
|---|---|---|
| `replacement` / `sell_full` / `buy_empty_from_customer` | `POST /orders` | `CustomerTransaction.kind` = canonical kind derived from `order_mode` (e.g. `buy_iron` → `buy_empty_from_customer`) |
| `payment_from_customer` | `POST /collections` | `CustomerTransaction.kind` = `"payment_from_customer"` |
| `payment_to_customer` | `POST /collections` | `CustomerTransaction.kind` = `"payment_to_customer"` |
| `customer_return_empties` | `POST /collections` | `CustomerTransaction.kind` = `"customer_return_empties"` |
| `adjust_customer_balance` | `POST /customer-adjustments` | `CustomerTransaction.kind` = `"adjust_customer_balance"` |
| `refill` | `POST /inventory/refill` with `kind="refill"` | `CompanyTransaction.kind` — **BROKEN: always writes "refill"** |
| `dist_return_empties` | `POST /inventory/refill` with `kind="dist_return_empties"` | `CompanyTransaction.kind` — **BROKEN** |
| `buy_full_from_company` | `POST /company/buy_iron` | `CompanyTransaction.kind` — **CORRECT: hardcodes `"buy_full_from_company"` at line 659** |
| `payment_to_company` | `POST /company/payments` | `CompanyTransaction.kind` — **BROKEN: infers from `payload.amount >= 0`** |
| `payment_from_company` | `POST /company/payments` | `CompanyTransaction.kind` — **BROKEN: infers from amount sign** |
| `adjust_company_balance` | `POST /company/adjustments` | `CompanyTransaction.kind` |
| `expense` | `POST /expenses` | Kind/type field |
| `wallet_to_bank` | `POST /cash/bank_deposit` | `direction` field — fixed in T2 |
| `bank_to_wallet` | `POST /cash/bank_deposit` | `direction` field — fixed in T2 |
| `adjust_wallet` | `POST /cash/adjust` | Verify no hardcoded kind |
| `adjust_inventory` | `POST /inventory/adjustments` | Verify no hardcoded kind |

For any path found to be inferring or hardcoding the wrong kind, fix it using the same pattern: accept an explicit canonical kind from the request payload and store it directly.

---

### 2b-b — Fix `/inventory/refill` write path (confirmed)

**Schema — `backend/app/schemas/inventory.py`:**

Add `kind` to `InventoryRefillCreate` and `InventoryRefillUpdate`. Only two values are valid — buy-full uses a separate endpoint:
```python
kind: Literal["refill", "dist_return_empties"] = "refill"
```

**Router — `backend/app/routers/inventory.py` — all affected locations:**

There are 9 locations in `inventory.py` that hardcode or filter on `"refill"`. All must be updated:

| Line | Location | Change |
|------|----------|--------|
| 32 | `_resolve_active_refill` entry check | Accept `"dist_return_empties"`: `current.kind not in ("refill", "dist_return_empties")` |
| 40 | `_resolve_active_refill` traversal query | Add `dist_return_empties` to `.where(CompanyTransaction.kind.in_(["refill", "dist_return_empties"]))` |
| 369 | Idempotency guard in `create_refill` | Use `payload.kind`: `.where(CompanyTransaction.kind == payload.kind)` |
| 379 | Create write path | Use `payload.kind`: `kind=payload.kind` |
| 418 | List endpoint filter | Add `dist_return_empties`: `.in_(["refill", "dist_return_empties", "buy_full_from_company"])` — keep `buy_full_from_company` so Add page buy-full history remains visible |
| 480 | Detail endpoint guard | Accept both: `row.kind not in ("refill", "dist_return_empties")` |
| 518 | Update endpoint guard | Accept both: `existing.kind not in ("refill", "dist_return_empties")` |
| 563 | Update reversal write path | Preserve existing kind: `kind=existing.kind` instead of hardcoded `"refill"` |
| 624 | Delete endpoint guard | Accept both: `existing.kind not in ("refill", "dist_return_empties")` |

**Frontend API — `frontend/lib/api/inventory.ts`:**

Add `kind` to both `createInventoryRefill` and `updateInventoryRefill` payload types:
```typescript
kind?: "refill" | "dist_return_empties";
```
Pass in the POST/PUT body: `kind: payload.kind ?? "refill"`. Without adding it to `updateInventoryRefill`, editing an existing return-only row will send no `kind` and the backend will default to `"refill"`, overwriting the correct kind on update.

**Schema addition — `InventoryRefillDetails` in `backend/app/schemas/inventory.py`:**

`InventoryRefillDetails` currently has no `kind` field. Add it so the edit flow can open the correct tab:
```python
kind: Literal["refill", "dist_return_empties"] = "refill"
```
Populate it from `row.kind` in the detail endpoint handler.

**Frontend type — `InventoryRefillDetailsSchema` in `frontend/types/inventory.ts`:**

`InventoryRefillDetailsSchema` (line 68) has no `kind` field. Add:
```typescript
kind: z.enum(["refill", "dist_return_empties"]).default("refill"),
```
Without this, `detail.kind` is undefined in the edit screen regardless of what the backend returns.

**Frontend — `frontend/components/AddRefillModal.tsx`:**

Send `kind` in the POST/PUT body from the active modal tab — the tab is the source of truth, not the quantities:
- Return tab (`isReturnMode`) → `kind: "dist_return_empties"`
- Refill tab (default) → `kind: "refill"`
- Buy tab (`isBuyMode`) → routes to `createCompanyBuyIron`, no `kind` field needed

Do NOT compute `kind` from `buy12`, `return12`, etc. Do NOT add any inference logic. The user's tab selection is authoritative.

**Edit flow — `frontend/app/inventory/new.tsx` (or wherever refill edit is initiated):**

When opening an existing refill for editing, read `detail.kind` from `InventoryRefillDetails` to select the correct tab. Currently the edit flow defaults to the Refill tab regardless of the stored kind. After this ticket:
- `detail.kind === "dist_return_empties"` → open Return tab
- `detail.kind === "refill"` → open Refill tab (default unchanged)

Do NOT infer the tab from quantities. The `kind` field is the authoritative source.

---

### 2b-c — Fix `/company/payments` write path (confirmed)

**Amount/sign contract (decided):**
- `amount` stays signed (positive = payment to company, negative = payment from company)
- `kind` is added as an explicit field — the authoritative source of direction
- Backend validates that sign and kind are consistent:
  - `kind="payment_to_company"` requires `amount >= 0`
  - `kind="payment_from_company"` requires `amount <= 0`
- Backend stores `paid=payload.amount` unchanged — no ledger math change
- Backward-compatibility: if old clients call without `kind`, a temporary inference shim derives kind from the sign, storing it correctly, and continues to work. Mark the shim `# TODO(T9): remove, require explicit kind`. New clients must always send `kind`.

**Schema — `backend/app/schemas/transaction.py` (`CompanyPaymentCreate`):**

Add:
```python
kind: Optional[Literal["payment_to_company", "payment_from_company"]] = None
```
In the router, resolve kind:
```python
# TODO(T9): Remove inference shim — require explicit kind once all clients send it
resolved_kind = payload.kind or ("payment_to_company" if payload.amount >= 0 else "payment_from_company")
if payload.kind and payload.amount > 0 and payload.kind != "payment_to_company":
    raise HTTPException(status_code=422, detail="kind/amount sign mismatch")
if payload.kind and payload.amount < 0 and payload.kind != "payment_from_company":
    raise HTTPException(status_code=422, detail="kind/amount sign mismatch")
```
Store: `kind=resolved_kind`.

**Frontend API — `frontend/lib/api/company.ts`:**

Add `kind: "payment_to_company" | "payment_from_company"` to the `createCompanyPayment` payload type and pass it in the POST body.

**Frontend form — wherever company payment is initiated:**

Pass the explicit `kind` based on the user action (pay-to-company form → `"payment_to_company"`, receive-from-company form → `"payment_from_company"`). Do NOT infer from the amount sign.

---

### 2b-d — Rename `refill_days` in report builder

In `backend/app/routers/reports.py` lines 188–198, the internal set `refill_days` queries only `kind == "refill"` and is used to populate `has_refill` in the day strip response.

Changes:
- Rename internal variable to `company_inventory_days`
- Extend filter: `.where(CompanyTransaction.kind.in_(["refill", "dist_return_empties", "buy_full_from_company"]))`
- Keep the API output field named `has_refill` in `DailyReportSummary` — renaming it is a breaking frontend change, out of scope for T2b
- Add `# TODO(T9): rename has_refill → has_company_inventory in API and frontend` comment at the field definition in `backend/app/schemas/report.py`

This ensures return-only and buy-full rows appear in the day strip indicator after migration.

---

### 2b-e — Alembic migration (one-time backfill of historical bad rows)

Write a migration that repairs existing `company_transactions` rows where the stored kind is wrong due to the old write path. Quantity-based inference is acceptable **only here** because old rows carry no action intent — quantities are the only available signal.

```sql
UPDATE company_transactions
SET kind = 'dist_return_empties'
WHERE kind = 'refill'
  AND COALESCE(buy12, 0) = 0
  AND COALESCE(buy48, 0) = 0
  AND (COALESCE(return12, 0) > 0 OR COALESCE(return48, 0) > 0);
```

If the audit in 2b-a finds similar write-path bugs on other tables, add equivalent repair statements to the same migration.

---

### 2b-f — Temporary defensive shim in report builder

In `backend/app/routers/reports.py`, around line 552 where `event_type=txn.kind` is assigned, add a guard for any unmigrated rows that survive between code deploy and the migration running.

**Important:** `_is_company_return_only_refill()` in `reports_event_fields.py` takes a `DailyReportEvent`, not a `CompanyTransaction`. The shim operates on `txn` (a `CompanyTransaction`), so it must use an inline field check instead:

```python
# TODO(T9): Remove after migration 2b_backfill_company_kinds has run in all environments
_no_buys = (txn.buy12 or 0) == 0 and (txn.buy48 or 0) == 0
_has_returns = (txn.return12 or 0) > 0 or (txn.return48 or 0) > 0
if txn.kind == AK.REFILL and _no_buys and _has_returns:
    txn_event_type = AK.DIST_RETURN_EMPTIES
```

Requiring `_has_returns` prevents a row with no buys and no returns (a degenerate/empty row) from being incorrectly reclassified. Do NOT call `_is_company_return_only_refill(txn)` — that function expects a `DailyReportEvent`, not a `CompanyTransaction`, and will fail at runtime. This is not permanent logic — it is a safety net for the migration window only.

---

### 2b-g — Tests

Create `tests/backend/test_write_path_canonicalization.py`. For each write path audited in 2b-a, add tests that:
1. POST the activity via the API with the explicit canonical kind
2. Assert the stored DB row carries the correct `kind`
3. Assert `/reports/day` emits the correct `event_type`

Minimum required tests for the confirmed `/inventory/refill` bug:
- `POST /inventory/refill` with `kind="dist_return_empties"` → DB `kind = "dist_return_empties"`, report emits `event_type = "dist_return_empties"`
- `POST /inventory/refill` with `kind="refill"` → DB `kind = "refill"`, report emits `event_type = "refill"`
- Assert report never emits `event_type = "refill"` for a `dist_return_empties` transaction
- `GET /inventory/refills` includes rows with `kind="dist_return_empties"`
- `GET /inventory/refills/{id}` resolves a `dist_return_empties` row (does not 404)
- `PUT /inventory/refills/{id}` updates a `dist_return_empties` row and preserves its kind
- `DELETE /inventory/refills/{id}` deletes a `dist_return_empties` row
- Retry/idempotency: `POST /inventory/refill` with same `request_id` and `kind="dist_return_empties"` returns the existing row, not a duplicate

For company payments:
- `POST /company/payments` with `kind="payment_to_company"` and `amount=500` → DB stores `kind="payment_to_company"`, `paid=500`
- `POST /company/payments` with `kind="payment_from_company"` and `amount=-300` → DB stores `kind="payment_from_company"`, `paid=-300`
- `POST /company/payments` with `kind="payment_to_company"` and `amount=-100` (sign mismatch) → 422 validation error
- `POST /company/payments` without `kind` and `amount=200` (old client path) → compatibility shim stores `kind="payment_to_company"` from sign; no error

For any other write-path bugs found in 2b-a, add equivalent tests.

**Do NOT compute kind from quantities in these tests.** Pass `kind` explicitly in the POST body.

**Protected:** `source_type="cash_adjust"` and `source_type="inventory_adjust"` in `ledger_entries` are DB ledger keys — separate from `CompanyTransaction.kind`. Do not touch them.

**Done when:** All activity tables with a display `kind` column store the correct canonical `ActivityKind` at creation time (other endpoints must emit the correct canonical `event_type` from explicit action fields, not infer it); `InventoryRefillDetails` includes `kind`; the Alembic migration is written; `refill_days` is renamed to `company_inventory_days` internally with `has_refill` kept in the API response and a `TODO(T9)` rename comment; the report builder shim is in place with a `TODO(T9)` removal comment; `test_write_path_canonicalization.py` passes; no test infers kind from quantities.

**STATUS: COMPLETE** — all write paths store canonical kinds; `/inventory/refill` accepts explicit `kind`; `/company/payments` accepts explicit `kind` with sign validation; Alembic migration backfills bad rows; `refill_days` renamed internally; report builder shim in place.

---

## Ticket 3 — Backend Tests

**Goal:** Freeze backend behavior before frontend migration begins.

**Preconditions:** The activity label matrix (approval gate 1 from T1) must be approved before `test_activity_wording.py` is written — tests assert exact label strings and will need to be rewritten if labels change after they are committed.

**Files:**
- `tests/backend/test_activity_wording.py`
- `tests/backend/test_date_picker_strip.py`
- `tests/backend/test_customer_review_summary.py`
- `tests/backend/test_activity_coverage.py`
- `tests/backend/test_expanded_details.py`
- Existing history cascade test files

**Work:**
- For every canonical kind, assert:
  - `event_type` equals the canonical name exactly
  - `label` equals the CSV-agreed English label
  - `hero_text` equals the matrix expectation — **including null/empty where the matrix specifies it**
  - Structured balance transitions (quantity and money fields)
- Add day strip tests
- Add customer review summary tests
- Add kind coverage tests (assert `"bank_deposit"`, `"cash_adjust"`, and `"adjust"` never appear as report `event_type`)
- Add bank split tests:
  - Assert wallet-to-bank event emits `event_type="wallet_to_bank"`
  - Assert bank-to-wallet event emits `event_type="bank_to_wallet"`
  - Assert `/reports/day` never emits `event_type="bank_deposit"`
  - Tests may allow `transfer_direction` to exist temporarily, but must not depend on it for display identity
- Update bank split expectations in existing backend tests that currently assert `event_type == "bank_deposit"`, especially:
  - `tests/backend/test_bank_deposit.py`
  - `tests/backend/test_ledger_smoke.py`
  - `tests/backend/test_expanded_details.py`
- Add cascade and isolation tests

**Done when:** All backend tests pass with no skips on covered paths.

**STATUS: COMPLETE** — all backend tests passing.

---

## Ticket 4 — Frontend Canonical Metadata

**Goal:** One frontend source of truth for labels, icons, colors, scope, and filter group per activity kind.

**Files:**
- `frontend/lib/activityKinds.ts` (new)
- `frontend/lib/activityKindMeta.ts` (new)
- `frontend/lib/reports/utils.ts`
- `frontend/lib/reports/eventColors.ts`
- `frontend/components/reports/ActivityIcon.tsx`
- `frontend/components/reports/SlimActivityRow.tsx`
- `frontend/components/reports/EventExpandedPanel.tsx`
- `frontend/components/CashExpensesView.tsx`
- `frontend/app/(tabs)/reports/index.tsx`
- `frontend/app/customers/[id].tsx`

**Work:**

### 4a — `activityKinds.ts`
Define the `ActivityKind` union type:
```typescript
export type ActivityKind =
  | "replacement" | "sell_full" | "buy_empty_from_customer"
  | "payment_from_customer" | "payment_to_customer" | "customer_return_empties"
  | "adjust_customer_balance" | "refill" | "dist_return_empties"
  | "buy_full_from_company" | "payment_to_company" | "payment_from_company"
  | "adjust_company_balance" | "expense" | "wallet_to_bank" | "bank_to_wallet"
  | "adjust_wallet" | "adjust_inventory";
```

### 4b — `activityKindMeta.ts`
Create a record keyed by canonical kind:
```typescript
type IconSpec = { arrow: ArrowDirection; symbol: IconSymbol };
// arrow: "swap-h" | "swap-v" | "in-h" | "out-h" | "in-v" | "out-v" | "none"
// symbol: "money" | "full-cyl" | "empty-cyl" | "receipt" | "wallet" | "cube" | "edit" | null

type ActivityKindMeta = {
  label: string;           // English display label
  labelKey: string;        // i18n key, e.g. "activities.replacement.label"
  icon: IconSpec;          // arrow direction + symbol — rendered by ActivityIcon.tsx
  color: string;           // hex color
  filterGroup: "customer" | "company" | "expenses" | "ledger";
  scope: "customer" | "company" | "wallet" | "inventory";
  reportSubtype?: string;  // second-level filter chip key; defaults to canonical kind if absent
};
export const ACTIVITY_KIND_META: Record<ActivityKind, ActivityKindMeta> = { ... };
```

Note: `icon` uses `IconSpec` (arrow + symbol), not a raw Ionicons string. `ActivityIcon.tsx` renders the spec as an SVG. Customer activities use horizontal arrows; company activities use vertical arrows. See T-ICONS for the full icon renderer implementation.
Cover all 18 canonical kinds. Add **new** entries for `payment_to_customer`, `payment_from_company`, `wallet_to_bank`, `bank_to_wallet` — these have no current handlers and are active bugs.

`reportSubtype` is static for most kinds (one kind → one chip key). The `refill` kind is a **runtime exception**: a return-only refill (`buy12=0`, `buy48=0`) shows as chip key `"company_return"`, a normal refill shows as `"company_refill"`. This cannot be encoded statically — it depends on event data.

Create a `getReportSubtype(event)` helper in `activityKindMeta.ts` that:
- Normalizes `event.event_type` via `normalizeEventType()`
- Returns `ACTIVITY_KIND_META[kind].reportSubtype ?? kind` for all kinds except `refill`
- For `refill`: reads `event.buy12` and `event.buy48` at runtime — returns `"company_return"` when both are zero/absent, `"company_refill"` otherwise

This helper replaces `getEventSubtype()` in `reports/index.tsx` for all kinds. The refill runtime case is explicitly carved out here — do not try to encode it as static metadata.

### 4c — `normalizeEventType()`
Create in `activityKindMeta.ts` or a companion utility. The **only** place in the frontend that accepts legacy aliases:
```
"order"              → kind from context
"collection_money"   → "payment_from_customer"
"collection_payout"  → "payment_to_customer"
"collection_empty"   → "customer_return_empties"
"customer_adjust"    → "adjust_customer_balance"
"company_payment"    → "payment_to_company" | "payment_from_company" (context)
"company_adjustment" → "adjust_company_balance"
"adjust"             → "adjust_inventory"
"cash_adjust"        → "adjust_wallet"
"bank_deposit"       → reads transfer_direction to pick "wallet_to_bank" or "bank_to_wallet"
```

### 4d — Wire up consumers
Replace scattered lookups with `ACTIVITY_KIND_META`:
- `SlimActivityRow.tsx` — replace local event-type predicates (`_isCollectionMoney`, `_isCompanyPayment`, `_isWalletAdjust`, etc.) with `normalizeEventType()` and metadata; fix `_isCompanyPayment` which currently misses `payment_from_company`; fix `transitionIntentForEvent` which checks `event.event_type === "customer_adjust"` and silently skips `adjust_customer_balance`
- `SlimActivityRow.tsx` — ensure `payment_from_company` has full parity with `payment_to_company` in all display paths: label, icon, color, grouping, balance transitions, payment ratio, money display; it currently renders as a grey circle with no data
- `EventExpandedPanel.tsx` — normalize these specific branches: `event_type === "bank_deposit"`, `event_type === "cash_adjust"`, `event_type === "adjust_wallet"`; note that after T2 `bank_deposit` will not arrive from the backend, but may still arrive from local adapter events during the T8 migration window
- `CashExpensesView.tsx` — update highlight/display behavior to work with canonical `wallet_to_bank` and `bank_to_wallet` kinds (currently highlights `bank_deposit` and `cash_adjust`)
- `ActivityIcon.tsx` — replace `getActivityIcon()` if-chain
- `eventColors.ts` — `getEventColor()` delegates to meta
- `reports/index.tsx` — replace `getEventGroupKey()` with `ACTIVITY_KIND_META[normalizeEventType(et)].filterGroup`; replace `getEventSubtype()` with `getReportSubtype(event)` from section 4b above
- `customers/[id].tsx` — this file has the same event-type checks in **three separate locations** (filter visibility ~line 283, event filtering ~line 365, row rendering ~line 794); all three must be converted using `normalizeEventType()`; extract a shared local predicate rather than converting each independently; the `e.event_type === "customer_adjust"` check appears in all three and must be replaced in each

Display components must use canonical `event_type` (after normalization), not `transfer_direction`, to determine label, icon, color, or filter grouping.

Note: `frontend/app/(tabs)/add/index.tsx` gets Ticket 4 benefits automatically via `SlimActivityRow` — no direct changes needed there in this ticket.

**Done when:** TypeScript builds; no if-chain or switch in display code branches on a raw event type string; `payment_from_company` renders a correct icon, color, and label; all three filter blocks in `customers/[id].tsx` use normalized kinds.

**STATUS: COMPLETE** — `activityKinds.ts`, `activityKindMeta.ts`, `normalizeEventType()`, and `ActivityIcon.tsx` all shipped. `IconSpec` (arrow + symbol) is the icon format; Ionicons fallback (`resolveIonicon`) exists but is superseded by T-ICONS. Raw `event_type` display branches in `SlimActivityRow.tsx`, `reports/index.tsx`, and `customers/[id].tsx` were cleaned up in T4-CLEANUP.

---

## T4-CLEANUP — Eliminate Raw event_type String Branches

**Branch:** `fix/t4-cleanup` branched from `main`

**Scope:**
- CHANGE: `frontend/components/reports/SlimActivityRow.tsx`
- CHANGE: `frontend/app/customers/[id].tsx`
- CHANGE: `frontend/app/(tabs)/reports/index.tsx`
- DO NOT TOUCH: `frontend/lib/activityKindMeta.ts`, `frontend/lib/activityKinds.ts`, `frontend/lib/reports/utils.ts`, any test file

### Background

`normalizeEventType()` is the canonical router for all `event_type` strings → `ActivityKind | null`. After T4, most of the codebase uses it. Three files still contain raw `event.event_type === "legacy_string"` comparisons that bypass it. This ticket replaces every raw branch with `normalizeEventType` calls, making the codebase robust against backend aliases sending either old or new event_type strings.

**Timing constraint:** The `isSettleOnly` check inside `transitionIntentForEvent` in `SlimActivityRow.tsx` uses label string + quantity inference to map a `"refill"` event to `"company_settle"`. This branch is transitional — it exists because old DB rows store `kind="refill"` for what should be `"dist_return_empties"`. Do NOT remove this branch in this ticket. After T2b migration is confirmed complete in all environments and the app cache window has closed, this branch becomes dead code and is removed in T9. Mark it with a `// TODO(T9): remove after T2b migration confirmed` comment.

```ts
// normalizeEventType signature
normalizeEventType(raw: string, ctx?: { order_mode?: string; money_direction?: string; transfer_direction?: string }): ActivityKind | null
```

`ActivityKind` is exported from `@/lib/activityKinds`, not from `@/lib/activityKindMeta`. Use:
```ts
import type { ActivityKind } from "@/lib/activityKinds";
import { ACTIVITY_KIND_META, normalizeEventType } from "@/lib/activityKindMeta";
```

---

### Implementation

#### FILE 1: `frontend/components/reports/SlimActivityRow.tsx`

**Change 1 — Add `ActivityKind` to imports (line 13)**

Current:
```ts
import { ACTIVITY_KIND_META, normalizeEventType } from "@/lib/activityKindMeta";
```
Replace with:
```ts
import type { ActivityKind } from "@/lib/activityKinds";
import { ACTIVITY_KIND_META, normalizeEventType } from "@/lib/activityKindMeta";
```

---

**Change 2 — Fix `_ORDER_KINDS` / `_isOrderKind` helper (lines 125–126)**

Current:
```ts
const _ORDER_KINDS = new Set(["order", "replacement", "sell_full", "buy_empty_from_customer"]);
const _isOrderKind = (et: string) => _ORDER_KINDS.has(et);
```
Replace with:
```ts
const _ORDER_KINDS = new Set<ActivityKind>(["replacement", "sell_full", "buy_empty_from_customer"]);
const _isOrderKind = (et: string) => {
  const k = normalizeEventType(et);
  return k !== null && _ORDER_KINDS.has(k);
};
```

> `normalizeEventType("order")` returns `"replacement"` by default (no order_mode), which is in `_ORDER_KINDS`, so `_isOrderKind("order")` stays `true`. Call sites that already pass the specific event_type ("replacement", "sell_full", etc.) are unaffected.

---

**Change 3 — Fix `_isCompanyPayment` helper (line 129)**

Current:
```ts
const _isCompanyPayment = (et: string) => et === "company_payment" || et === "payment_to_company" || et === "payment_from_company";
```
Replace with:
```ts
const _isCompanyPayment = (et: string) => {
  const k = normalizeEventType(et);
  return k === "payment_to_company" || k === "payment_from_company";
};
```

---

**Change 4 — Fix `formatOrderMetric` function (lines 150–165)**

Current:
```ts
const formatOrderMetric = (event: DailyReportEvent) => {
  const lines: string[] = [];
  const isSystemAttached =
    event.order_mode === "replacement" || event.order_mode === "sell_iron" ||
    event.event_type === "replacement" || event.event_type === "sell_full";
  const resolvedSystemName = event.system_name ?? (event as any).system?.display_name ?? null;
  if (resolvedSystemName && isSystemAttached) lines.push(`System: ${resolvedSystemName}`);
  const gas = event.gas_type ? `${event.gas_type}` : "";
  const installed = Number(event.order_installed ?? 0);
  const received = Number(event.order_received ?? 0);
  if (installed > 0) lines.push(`Installed: ${installed}x ${gas}`);
  if (event.order_mode !== "sell_iron" && event.event_type !== "sell_full") {
    lines.push(`Received: ${received}x ${gas}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
};
```
Replace with:
```ts
const formatOrderMetric = (event: DailyReportEvent) => {
  const lines: string[] = [];
  const _fomKind = normalizeEventType(event.event_type, { order_mode: event.order_mode ?? undefined });
  const isSystemAttached = _fomKind === "replacement" || _fomKind === "sell_full";
  const resolvedSystemName = event.system_name ?? (event as any).system?.display_name ?? null;
  if (resolvedSystemName && isSystemAttached) lines.push(`System: ${resolvedSystemName}`);
  const gas = event.gas_type ? `${event.gas_type}` : "";
  const installed = Number(event.order_installed ?? 0);
  const received = Number(event.order_received ?? 0);
  if (installed > 0) lines.push(`Installed: ${installed}x ${gas}`);
  if (_fomKind !== "sell_full") {
    lines.push(`Received: ${received}x ${gas}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
};
```

---

**Change 5 — Fix `buildHeroAction` function (lines 167–227)**

Add a `_bhKind` local at the top of `buildHeroAction`. Replace:
- `event.event_type === "refill"` → `_bhKind === "refill"`
- `event.event_type === "collection_payout" || event.event_type === "payment_to_customer"` → `_bhKind === "payment_to_customer"`
- `event.event_type === "expense"` → `_bhKind === "expense"`
- The three-branch bank check (lines 219–225) → `_bhKind === "bank_to_wallet"` / `_bhKind === "wallet_to_bank"`

Full revised function:
```ts
const buildHeroAction = (event: DailyReportEvent, formatMoney: (v: number) => string) => {
  const _bhKind = normalizeEventType(event.event_type, {
    order_mode: event.order_mode ?? undefined,
    transfer_direction: event.transfer_direction ?? undefined,
  });
  if (_isOrderKind(event.event_type)) {
    return formatOrderMetric(event);
  }
  if (_bhKind === "refill") {
    const bought = formatGasSummary(event.buy12, event.buy48);
    const returned = formatGasSummary(event.return12, event.return48);
    const lines: string[] = [];
    if (bought) lines.push(`Bought: ${bought}`);
    lines.push(`Returned: ${returned ?? `${Number(event.return12 ?? 0)}x 12kg | ${Number(event.return48 ?? 0)}x 48kg`}`);
    return lines.length > 0 ? lines.join("\n") : null;
  }
  if (_isCompanyBuyFull(event.event_type)) {
    const parts: string[] = [];
    if (event.buy12 && event.buy12 !== 0) parts.push(`${event.buy12}x 12kg`);
    if (event.buy48 && event.buy48 !== 0) parts.push(`${event.buy48}x 48kg`);
    return parts.length > 0 ? `Bought: ${parts.join(" | ")}` : null;
  }
  if (event.hero_primary) return event.hero_primary;
  if (event.hero_text) return event.hero_text;
  if (_isCollectionMoney(event.event_type)) {
    const amount = Number(event.money_received ?? event.money?.amount ?? 0);
    return amount ? `Payment from customer ${formatMoneyValue(amount, formatMoney)}` : "Payment from customer";
  }
  if (_bhKind === "payment_to_customer") {
    const amount = Number(event.money_amount ?? event.money?.amount ?? 0);
    return amount ? `Payment to customer ${formatMoneyValue(amount, formatMoney)}` : "Payment to customer";
  }
  if (_isCompanyPayment(event.event_type)) {
    const amount = Number(event.money_amount ?? event.money?.amount ?? 0);
    const direction = event.money_direction === "in" ? "Payment from company" : "Payment to company";
    return amount ? `${direction} ${formatMoneyValue(amount, formatMoney)}` : direction;
  }
  if (_isCollectionEmpty(event.event_type)) {
    const parts = formatGasSummary(event.return12, event.return48);
    return parts ? `Returned ${parts} empties` : "Returned empties";
  }
  if (_bhKind === "expense") {
    return null;
  }
  if (_isWalletAdjust(event.event_type)) {
    return event.reason ?? null;
  }
  if (_isInventoryAdjust(event.event_type)) {
    const gas = event.gas_type ? `${event.gas_type}` : null;
    const note = event.reason ?? null;
    if (gas && note) return `${gas} · ${note}`;
    if (gas) return gas;
    if (note) return note;
    return null;
  }
  if (_bhKind === "bank_to_wallet") return EVENT_LABELS.BANK_TO_WALLET;
  if (_bhKind === "wallet_to_bank") return EVENT_LABELS.WALLET_TO_BANK;
  return null;
};
```

---

**Change 6 — Fix `transitionIntentForEvent` function (lines 241–258)**

Add `_tiKind` local. Replace:
- `event.event_type === "collection_payout"` → `_tiKind === "payment_to_customer"`
- `event.event_type === "customer_adjust" || event.event_type === "adjust_customer_balance"` → `_tiKind === "adjust_customer_balance"`
- `event.event_type === "refill"` → `_tiKind === "refill"`

Full revised function:
```ts
const transitionIntentForEvent = (event: DailyReportEvent) => {
  const _tiKind = normalizeEventType(event.event_type, {
    order_mode: event.order_mode ?? undefined,
    money_direction: event.money_direction ?? undefined,
  });
  if (_isOrderKind(event.event_type)) return "customer_order" as const;
  if (_isCollectionMoney(event.event_type)) return "customer_payment" as const;
  if (_tiKind === "payment_to_customer") return "customer_payout" as const;
  if (_isCollectionEmpty(event.event_type)) return "customer_return" as const;
  if (_isDistReturn(event.event_type)) return "company_settle" as const;
  if (_tiKind === "adjust_customer_balance") return "customer_adjust" as const;
  if (_isCompanyPayment(event.event_type)) return "company_payment" as const;
  if (_isCompanyBuyFull(event.event_type)) return "company_buy_full" as const;
  if (_tiKind === "refill") {
    const isSettleOnly =
      event.label === "Returned empties" ||
      (!(event.buy12 || event.buy48) && !!(event.return12 || event.return48) &&
        !event.total_cost && !event.paid_amount);
    return isSettleOnly ? ("company_settle" as const) : ("company_refill" as const);
  }
  return "generic" as const;
};
```

---

**Change 7 — Replace inline `_isBankTransfer` function + component body bank transfer block (lines 341–387)**

`activityKind` is already computed at lines 305–309 with full context (including `transfer_direction`). Replace the bankTransferDirection chain and inline `_isBankTransfer` function with `activityKind`-based equivalents.

Current (lines 341–361):
```ts
  const bankTransferDirection =
    event.event_type === "bank_to_wallet"
      ? "in"
      : event.event_type === "wallet_to_bank"
        ? "out"
        : event.event_type === "bank_deposit"
          ? event.transfer_direction === "bank_to_wallet"
            ? "in"
            : event.transfer_direction === "wallet_to_bank"
              ? "out"
              : /bank\s*[→-]\s*wallet/i.test(String(event.label ?? event.display_name ?? event.context_line ?? ""))
                ? "in"
                : /wallet\s*[→-]\s*bank/i.test(String(event.label ?? event.display_name ?? event.context_line ?? ""))
                  ? "out"
                  : /to wallet/i.test(bankTransferText)
                    ? "in"
                    : /to bank/i.test(bankTransferText)
                      ? "out"
                      : "none"
          : "none";
  const _isBankTransfer = (et: string) => et === "bank_deposit" || et === "bank_to_wallet" || et === "wallet_to_bank";
```
Replace with:
```ts
  const bankTransferDirection =
    activityKind === "bank_to_wallet"
      ? "in"
      : activityKind === "wallet_to_bank"
        ? "out"
        : "none";
  // bank_deposit without transfer_direction defaults to wallet_to_bank per normalizeEventType
  const _isBankTransfer = activityKind === "bank_to_wallet" || activityKind === "wallet_to_bank";
```

Then update all three downstream uses of `_isBankTransfer(event.event_type)` to the boolean `_isBankTransfer`:

- Line ~363: `_isBankTransfer(event.event_type)` → `_isBankTransfer`
- Line ~375: `_isBankTransfer(event.event_type)` → `_isBankTransfer`
- Line ~385: `_isBankTransfer(event.event_type)` → `_isBankTransfer`

---

**Change 8 — Fix remaining raw event_type comparisons in component body**

Replace each of the following (use `activityKind` which is already computed):

| Location | Current | Replace with |
|---|---|---|
| Line 319 (headerNameRaw) | `event.event_type === "expense"` | `activityKind === "expense"` |
| Line 377 (moneyAmount) | `event.event_type === "collection_payout" \|\| event.event_type === "payment_to_customer"` | `activityKind === "payment_to_customer"` |
| Line 389 (paymentAmount) | `event.event_type === "refill"` | `activityKind === "refill"` |
| Line 393 (paymentTotal) | `event.event_type === "refill"` | `activityKind === "refill"` |
| Line 401 (showPaymentRatio) | `event.event_type === "refill"` | `activityKind === "refill"` |
| Line 418 (ratioMoneyDirection) | `event.event_type === "refill"` | `activityKind === "refill"` |
| Line 554 (isReplacementReceivedLine) | `(event.event_type === "order" && event.order_mode === "replacement") \|\| event.event_type === "replacement"` | `activityKind === "replacement"` |
| Line 556 (isRefillReturnedLine) | `event.event_type === "refill"` | `activityKind === "refill"` |

---

#### FILE 2: `frontend/app/customers/[id].tsx`

**Change 1 — Add import for `normalizeEventType` (after EVENT_LABELS import, line 9)**

Current:
```ts
import { EVENT_LABELS } from "@/lib/eventLabels";
```
Replace with:
```ts
import { EVENT_LABELS } from "@/lib/eventLabels";
import { normalizeEventType } from "@/lib/activityKindMeta";
```

---

**Change 2 — Fix `availableActivityFilters` useMemo (lines 285–291)**

Current:
```ts
      if ((event.event_type === "order" && event.order_mode === "replacement") || event.event_type === "replacement") visible.add("replacement");
      if (event.event_type === "collection_money" || event.event_type === "payment_from_customer") visible.add("late_payment");
      if (event.event_type === "collection_payout") visible.add("payout");
      if (event.event_type === "collection_empty" || event.event_type === "customer_return_empties") visible.add("return_empties");
      if ((event.event_type === "order" && event.order_mode === "buy_iron") || event.event_type === "buy_empty_from_customer") visible.add("buy_empty");
      if ((event.event_type === "order" && event.order_mode === "sell_iron") || event.event_type === "sell_full") visible.add("sell_full");
      if (event.event_type === "customer_adjust" || event.event_type === "adjust_customer_balance") visible.add("adjustment");
```
Replace with:
```ts
      const _kind = normalizeEventType(event.event_type, { order_mode: event.order_mode ?? undefined });
      if (_kind === "replacement") visible.add("replacement");
      if (_kind === "payment_from_customer") visible.add("late_payment");
      if (_kind === "payment_to_customer") visible.add("payout");
      if (_kind === "customer_return_empties") visible.add("return_empties");
      if (_kind === "buy_empty_from_customer") visible.add("buy_empty");
      if (_kind === "sell_full") visible.add("sell_full");
      if (_kind === "adjust_customer_balance") visible.add("adjustment");
```

---

**Change 3 — Fix `filteredActivities` switch cases (lines 366–379)**

Current:
```ts
          case "replacement":
            return (e.event_type === "order" && e.order_mode === "replacement") || e.event_type === "replacement";
          case "late_payment":
            return e.event_type === "collection_money" || e.event_type === "payment_from_customer";
          case "payout":
            return e.event_type === "collection_payout";
          case "return_empties":
            return e.event_type === "collection_empty" || e.event_type === "customer_return_empties";
          case "buy_empty":
            return (e.event_type === "order" && e.order_mode === "buy_iron") || e.event_type === "buy_empty_from_customer";
          case "sell_full":
            return (e.event_type === "order" && e.order_mode === "sell_iron") || e.event_type === "sell_full";
          case "adjustment":
            return e.event_type === "customer_adjust" || e.event_type === "adjust_customer_balance";
```
Replace with:
```ts
          case "replacement": {
            const k = normalizeEventType(e.event_type, { order_mode: e.order_mode ?? undefined });
            return k === "replacement";
          }
          case "late_payment": {
            const k = normalizeEventType(e.event_type);
            return k === "payment_from_customer";
          }
          case "payout": {
            const k = normalizeEventType(e.event_type);
            return k === "payment_to_customer";
          }
          case "return_empties": {
            const k = normalizeEventType(e.event_type);
            return k === "customer_return_empties";
          }
          case "buy_empty": {
            const k = normalizeEventType(e.event_type, { order_mode: e.order_mode ?? undefined });
            return k === "buy_empty_from_customer";
          }
          case "sell_full": {
            const k = normalizeEventType(e.event_type, { order_mode: e.order_mode ?? undefined });
            return k === "sell_full";
          }
          case "adjustment": {
            const k = normalizeEventType(e.event_type);
            return k === "adjust_customer_balance";
          }
```

---

**Change 4 — Fix `isOrder` / `isCollection` / `isAdjustment` in render (lines 795–803)**

Current:
```ts
          const isOrder =
            event.event_type === "order" || event.event_type === "replacement" ||
            event.event_type === "sell_full" || event.event_type === "buy_empty_from_customer";
          const isCollection =
            event.event_type === "collection_money" || event.event_type === "payment_from_customer" ||
            event.event_type === "collection_empty" || event.event_type === "customer_return_empties" ||
            event.event_type === "collection_payout";
          const isAdjustment = event.event_type === "customer_adjust" || event.event_type === "adjust_customer_balance";
```
Replace with:
```ts
          const _evKind = normalizeEventType(event.event_type, { order_mode: event.order_mode ?? undefined });
          const isOrder = _evKind === "replacement" || _evKind === "sell_full" || _evKind === "buy_empty_from_customer";
          const isCollection =
            _evKind === "payment_from_customer" ||
            _evKind === "customer_return_empties" ||
            _evKind === "payment_to_customer";
          const isAdjustment = _evKind === "adjust_customer_balance";
```

---

#### FILE 3: `frontend/app/(tabs)/reports/index.tsx`

`normalizeEventType` is already imported at line 34.

**Change 1 — Fix adjustment event filter at line 335–337**

Current:
```ts
    ((selectedDayInfo?.events ?? []) as any[]).filter(
      (ev) => ev?.event_type !== "adjust_customer_balance" && ev?.event_type !== "adjust_company_balance"
    )
```
Replace with:
```ts
    ((selectedDayInfo?.events ?? []) as any[]).filter((ev) => {
      const k = normalizeEventType(ev?.event_type ?? "");
      return k !== "adjust_customer_balance" && k !== "adjust_company_balance";
    })
```

---

**Change 2 — Fix `EventExpandedPanel`-equivalent branches at lines 1216–1238**

At line 1004, `eventType` is a raw string:
```ts
const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type ?? "event");
```

Add a normalized kind immediately after:
```ts
const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type ?? "event");
const _evKind = normalizeEventType(eventType, {
  order_mode: ev?.order_mode,
  transfer_direction: ev?.transfer_direction,
  money_direction: ev?.money_direction,
});
```

Then replace the branches at lines 1216–1238 using `_evKind`. Do NOT change the `eventType` argument passed to `renderCenteredWalletOnly(eventType)` — only the if-conditions change:

| Current condition | Replace with |
|---|---|
| `eventType === "order"` | `_evKind === "replacement" \|\| _evKind === "sell_full" \|\| _evKind === "buy_empty_from_customer"` |
| `eventType === "collection_empty"` | `_evKind === "customer_return_empties"` |
| `eventType === "collection_money" \|\| eventType === "collection_payout"` | `_evKind === "payment_from_customer" \|\| _evKind === "payment_to_customer"` |
| `eventType === "expense" \|\| eventType === "bank_deposit" \|\| eventType === "cash_adjust"` | `_evKind === "expense" \|\| _evKind === "bank_to_wallet" \|\| _evKind === "wallet_to_bank" \|\| _evKind === "adjust_wallet"` |
| `eventType === "refill" \|\| eventType === "company_buy_full"` | `_evKind === "refill" \|\| _evKind === "buy_full_from_company"` |
| `eventType === "adjust"` | `_evKind === "adjust_inventory"` |

---

### Tests

Do NOT run any tests or build commands. Return the exact commands for the developer to run.

Affected test files (all live under `tests/frontend/__tests__/`):
```
npx jest tests/frontend/__tests__/slim-activity-row-orders.test.tsx --no-coverage
npx jest tests/frontend/__tests__/slim-activity-row-replacement.test.tsx --no-coverage
npx jest tests/frontend/__tests__/slim-activity-row-collections.test.tsx --no-coverage
npx jest tests/frontend/__tests__/slim-activity-row-company.test.tsx --no-coverage
```

---

### Return Section

When done, return:
1. The four test commands above (verbatim)
2. A list of every line changed in each file (file + approximate old line number + brief description)
3. Confirm: no new helper functions introduced outside the three files in scope
4. Confirm: no changes to `activityKindMeta.ts`, `activityKinds.ts`, `reports/utils.ts`, or any test file

---

### Acceptance Criteria

- [ ] `_ORDER_KINDS` is typed as `Set<ActivityKind>` and does not contain `"order"`
- [ ] `_isOrderKind("order")` still returns `true` (normalizeEventType("order") → "replacement" → in set)
- [ ] `_isCompanyPayment` has zero legacy raw string literals (e.g. `"company_payment"`) — canonical comparisons like `k === "payment_to_company"` are expected and correct
- [ ] `_isBankTransfer` is a `boolean` constant (not a function) in the component body; uses `activityKind`
- [ ] `buildHeroAction` has no `event.event_type ===` comparisons — only `_bhKind ===`, `_isX()` helpers, or `hero_primary`/`hero_text` fields
- [ ] `transitionIntentForEvent` has no `event.event_type ===` comparisons — only `_tiKind ===` or `_isX()` helpers
- [ ] `headerNameRaw` uses `activityKind === "expense"`, not `event.event_type`
- [ ] `bankTransferDirection` uses `activityKind`, not `event.event_type`
- [ ] `moneyAmount`, `paymentAmount`, `paymentTotal`, `showPaymentRatio`, `ratioMoneyDirection` all use `activityKind` or `_isX()` helpers — no bare `event.event_type ===`
- [ ] Hero line dimming logic (`isReplacementReceivedLine`, `isRefillReturnedLine`) uses `activityKind`
- [ ] `customers/[id].tsx` imports `normalizeEventType`; no `event.event_type ===` raw strings in `availableActivityFilters`, `filteredActivities`, or `isOrder`/`isCollection`/`isAdjustment`
- [ ] `reports/index.tsx` line 336 filter uses `normalizeEventType`
- [ ] `reports/index.tsx` expanded panel branches (line ~1216) use `_evKind` from `normalizeEventType`
- [ ] All 4 slim-activity-row test files pass with 0 failures

**STATUS: COMPLETE** — all raw `event_type` string branches replaced with `normalizeEventType()` calls in `SlimActivityRow.tsx`, `customers/[id].tsx`, and `reports/index.tsx`. Verified clean 2026-06-04.

---

## Ticket 5 — Translation-Ready Activity Labels

**Goal:** Activity labels come from a centralized translation-ready lookup, not hardcoded backend English strings. English is the only active language in this ticket; full language switching is intentionally deferred.

**Preconditions:**
- Ticket 4 done
- Translation lookup foundation (`frontend/lib/i18n/`) does **not** exist yet — this ticket creates the minimal infrastructure needed to add language switching later

**Files:**
- `frontend/lib/i18n/translations.ts` (new)
- `frontend/components/reports/SlimActivityRow.tsx`

**Work:**

### 5a — Create translation-ready foundation
Create `frontend/lib/i18n/translations.ts`:
```typescript
export const translations = {
  en: {
    activities: {
      replacement:              { label: "Replace" },
      sell_full:                { label: "Sell full" },
      buy_empty_from_customer:  { label: "Buy empties" },
      payment_from_customer:    { label: "Payment from customer" },
      payment_to_customer:      { label: "Payment to customer" },
      customer_return_empties:  { label: "Empties from customer" },
      adjust_customer_balance:  { label: "Adjust customer balance" },
      refill:                   { label: "Refill" },
      dist_return_empties:      { label: "Empties to company" },
      buy_full_from_company:    { label: "Buy fulls" },
      payment_to_company:       { label: "Payment to company" },
      payment_from_company:     { label: "Payment from company" },
      adjust_company_balance:   { label: "Adjust company balance" },
      expense:                  { label: "Expense" },
      wallet_to_bank:           { label: "Wallet to bank" },
      bank_to_wallet:           { label: "Bank to wallet" },
      adjust_wallet:            { label: "Adjust wallet" },
      adjust_inventory:         { label: "Adjust inventory" },
    },
    filterGroups: {
      customer: "Customer",
      company: "Company",
      expenses: "Expenses",
      ledger: "Ledger",
    }
  }
};
```
The `event_type` value IS the translation key namespace. No separate `label_key` API field is needed.

Labels are display text only. Direction logic (e.g. which bank transfer direction this event represents) must never be derived from label text — canonical `event_type` is the meaning; translation text is only presentation.

### 5b — Wire in `SlimActivityRow`
Change from:
```typescript
if (event?.label) return event.label;  // backend English overrides — wrong for i18n
```
To:
```typescript
const meta = ACTIVITY_KIND_META[normalizeEventType(event.event_type)];
return t(meta.labelKey) ?? event.label;  // frontend translation lookup primary, backend label as fallback
```

**Out of scope:** Arabic strings, a language selector, persisted language preference, RTL layout wiring, and runtime language switching.

**Done when:** Activity row labels are read through the translation lookup using canonical `event_type` keys; English is the only active language; backend `event.label` is used only as a fallback. Adding Arabic later should require adding translated strings and language-switching infrastructure, not rewriting activity display components.

**STATUS: COMPLETE** — `translations.ts` created; `SlimActivityRow` reads labels via `ACTIVITY_KIND_META[kind].label`; backend label is fallback only.

---

## Ticket 6 — Frontend Balance Wording Renderer

**Goal:** Every customer and company activity card shows balance transition pills for all three components (money, cyl_12, cyl_48) where data is available — including unchanged non-zero values. Settled-to-settled (both sides zero) is the only case where a pill is omitted.

**Files:**
- `frontend/lib/balanceTransitions.ts` (extend existing file)
- `frontend/components/reports/SlimActivityRow.tsx`
- `frontend/lib/activityAdapter.ts`

**Work:**
Implement the matrix rules:
- Customer-facing and company-facing transitions only
- Cover money, `cyl_12`, `cyl_48`
- Omit settled-to-settled (both before and after are zero/display-zero) — this is the only omission case
- Show changed transitions AND unchanged non-zero values — e.g. a payment that doesn't touch cylinders still shows "12kg balance: unchanged — 3 debts (on customer)" if the cylinder balance is non-zero
- Apply the code-derived sign wording:
  - Customer money/cylinders: positive = `debts on customer`, negative = `credit for customer`
  - Company money: positive = `debts on distributor`, negative = `credit for distributor`
  - Company cylinders: positive = `credit for distributor`, negative = `debts on distributor`
- Singular/plural (`1 debt`, `2 debts`, `1 credit`, `2 credits`) — applies to cylinder counts only; money amounts keep existing wording
- No wording for internal-only events (ledger adjustments with no display counterparty): `adjust_wallet` and `adjust_inventory`
- `payment_from_company`: render as the mirror of `payment_to_company` — money received from company into wallet. Use structured `balance_transitions`, not label text, to derive the wording. Apply the existing company money sign rule (positive = debts on distributor, negative = credit for distributor).
- Fix `pushTransition` in `activityAdapter.ts` to use the same settled-to-settled skip condition as `pushEventTransition` in `SlimActivityRow` — the `balance_transitions` array built by the adapter serves as the fallback in `buildDisplayTransitions` and must not skip unchanged non-zero values either
- **Do not change refill "Returned:" rendering** — showing `Returned: 0x 12kg | 0x 48kg` when no empties were returned is correct and intentional; it explicitly communicates that the distributor kept the empties

**Known gap — company payment cylinder pills:**
`CompanyPayment` API response does not include `live_debt_cylinders_12` or `live_debt_cylinders_48`. Company payment cards in the add-screen list will not show cylinder pills even after this ticket, because the data does not exist in the frontend. A company payment does not change cylinder balances, but the existing non-zero cylinder debt should appear as an unchanged pill. **Fixing this requires the backend `/api/company/payments` endpoint to return cylinder balance snapshots alongside each payment record.** This is a separate backend ticket and does not block T6, T7, or T8.

**Done when:** Every customer and company activity card (daily report, customer detail, add-screen) shows transition pills for all non-zero balance components; settled-to-settled rows are the only omission; `pushTransition` and `pushEventTransition` use the same skip condition.

**STATUS: COMPLETE** — `balanceTransitions.ts` updated; singular/plural cylinder wording (`1 debt` / `2 debts`); unchanged non-zero pills shown; settled-to-settled is the only omission case. A `T6-TESTS` sub-ticket was also executed: 10 frontend test files updated to match new T6 behavior (label changes from T5 + balance wording changes from T6). All 63 frontend test suites now pass.

---

## Ticket T-ICONS — Symbol+Arrow SVG Icon Renderer

**Goal:** Replace the Ionicons fallback (`resolveIonicon`) with a proper SVG renderer that draws the approved `IconSpec` design: a directional arrow (horizontal for customer activities, vertical for company activities) with a symbol beside it.

**Preconditions:** T4 complete (`activityKindMeta.ts` and `IconSpec` in place).

**Branch:** `feat/activity-icons`

**Files:**
- `frontend/components/reports/ActivityIcon.tsx` (rewrite)
- `frontend/components/reports/SlimActivityRow.tsx` (swap render call)

**Approved icon design:**

```
Customer activities — horizontal arrows (#0ea5e9)
  replacement            ↔   (swap-h, no symbol)
  sell_full              ← [full-cyl]
  buy_empty_from_customer  [empty-cyl] →
  payment_from_customer  💰 →
  payment_to_customer    ← 💰
  customer_return_empties  [empty-cyl] →
  adjust_customer_balance  🔧  (no arrow, edit symbol)

Company activities — vertical arrows (#f97316)
  refill                 ↕   (swap-v, no symbol)
  dist_return_empties    ↑ [empty-cyl]
  buy_full_from_company  [full-cyl] ↓
  payment_to_company     ↑ 💰
  payment_from_company   💰 ↓
  adjust_company_balance 🔧  (no arrow, edit symbol)

Money/wallet (#6366f1)
  expense                ← 🧾
  bank_to_wallet         💰 ↓
  wallet_to_bank         ↑ 💰

Ledger (#64748b)
  adjust_inventory       📦  (no arrow, cube symbol)
  adjust_wallet          👜  (no arrow, wallet symbol)
```

Symbol placement rule:
- `in-h` / `in-v` (incoming): symbol first, then arrow — `[symbol] →` or `[symbol] ↓`
- `out-h` / `out-v` (outgoing): arrow first, then symbol — `← [symbol]` or `↑ [symbol]`
- `swap-*` / `none`: no symbol

Symbol and arrow must share the same center axis (vertical center for horizontal layouts, horizontal center for vertical layouts). Symbol and arrow occupy separate non-overlapping halves of the 22×22 SVG viewbox.

**Work:**
- Rewrite `renderIconSpec()` in `ActivityIcon.tsx` to draw arrows and symbols as SVG paths
- Remove `resolveIonicon()`, `getActivityIcon()`, and `iconTypeForEvent()` — no longer needed
- In `SlimActivityRow.tsx`: remove `getActivityIcon()` call; `<ActivityIcon>` already renders the full icon
- Keep `<Ionicons>` import in `SlimActivityRow` (still used for `create-outline` and `trash-outline` action buttons)

**Acceptance criteria:**
- All 18 activity kinds show a visible SVG icon — no Ionicons names, no blank spaces
- Customer activities render horizontal arrows; company activities render vertical arrows
- `replacement` and `refill` show bidirectional arrows with no symbol
- Symbol and arrow are on the same center axis, no overlap
- `npm run build` passes (do not run tests)

**STATUS: COMPLETE** — SVG renderer shipped. Custom icons for all 18 kinds including distinct full/empty cylinders and banknote money symbol. Merged into main (commits 1306bcf, 073876e). Design summary is now captured in `ACTIVITY_SPEC.md`.

---

## Ticket T-ICON-LAYOUT — Fix Icon Position and Size in Activity Row

**Goal:** Fix four visual defects visible in the daily report after T-ICONS ships.

**Preconditions:** T-ICONS complete.

**Branch:** `fix/icon-layout`

**Files:**
- `frontend/components/reports/SlimActivityRow.tsx` (styles only)
- `frontend/components/reports/ActivityIcon.tsx` (internal SVG coordinate fixes)

**Defects and fixes:**

| # | Problem | Fix |
|---|---|---|
| 1 | Too much space between icon and left screen edge | `railCol.width: 42` → `34` |
| 2 | Icon not vertically aligned with activity label | `railCol.paddingTop: 1` → `0`; add `paddingTop: 2` to `content` |
| 3 | Icon too small | `size={33}` → `size={40}` on `<ActivityIcon>` |
| 4 | Symbol and arrow not centered on same axis inside SVG | For `in-h`/`out-h`: fix arrow `center` — always `y=11`, not `y=16.1`; layout symbol in left half and arrow in right half (or vice versa) with no overlap |

**Acceptance criteria:**
- Icon left edge is flush with row content left edge (no extra left gap)
- Icon top aligns visually with the activity label text
- Icons are visibly larger than before
- Symbol and arrow within each icon sit on the same horizontal or vertical center line
- `npm run build` passes (do not run tests)

**STATUS: COMPLETE** — Layout fixes shipped alongside T-ICONS. All 63 frontend tests passing.

---

## Ticket 7 — Frontend Tests Safety Net

**Goal:** Freeze frontend behavior with tests **before** Ticket 8 migrates the adapter. Tests document current legacy output as the baseline — regressions introduced by T8 will be caught here.

**Preconditions:** Tickets 4, 5, and 6 are complete.

**Scope:** Frontend test files only. Some additions go into new files, some into existing files.

**Files (new):**
- `tests/frontend/__tests__/activityKindMeta.test.ts`
- `tests/frontend/__tests__/activity-adapter-baselines.test.ts`

**Files (extend existing):**
- `tests/frontend/__tests__/slim-activity-row-company.test.tsx` — add `payment_from_company` + bank split tests
- `tests/frontend/__tests__/payment-direction-wording.test.ts` — add cylinder balance wording tests
- `tests/frontend/__tests__/event-expanded-panel-company.test.tsx` — add `payment_from_company` panel test

**Work:**

### 7a — Metadata and normalizer tests
- Assert `ACTIVITY_KIND_META` has an entry for all 18 kinds
- Assert `normalizeEventType()` maps every legacy alias to a canonical kind
- Assert unknown strings return `null` (not the original string — `normalizeEventType` returns `ActivityKind | null`)

### 7b — Balance renderer tests
Customer money and company money wording are already partially covered in `payment-direction-wording.test.ts`. Add the missing cases:
- Customer cylinder: `1` → `"1 debt (on customer)"` (singular), `2` → `"2 debts (on customer)"` (plural)
- Customer cylinder negative: `1` → `"1 credit (for customer)"`, `2` → `"2 credits (for customer)"`
- Company cylinder: positive → `"credit X (for distributor)"`, negative → `"debts X (on distributor)"` (note: company cylinders flip direction)
- Unchanged non-zero: `formatBalanceTransitions` with `before === after` non-zero → `"12kg balance: unchanged — debts 3 (on customer)"`
- Balance-row transition wording: `before → after` format for both customer and company scope

### 7c — Adapter output tests (document current state)
For each adapter function, assert the **current** (legacy) `event_type` output — clearly commented as pre-migration baseline:
- `orderToEvent` → currently `"order"`
- `collectionToEvent` → currently `"collection_money"` / `"collection_payout"` / `"collection_empty"`
- `customerAdjustmentToEvent` → currently `"customer_adjust"`
- `companyPaymentToEvent` → currently `"company_payment"` — **highest-risk path**: collapses `payment_to_company` and `payment_from_company` into one kind; direction is lost; `payment_from_company` has zero display handlers
- `companyBalanceAdjustmentToEvent` → currently `"company_adjustment"`
- `inventoryAdjustmentToEvent` → currently `"adjust"` (single) / `"adjust_inventory"` (group)
- `bankDepositToEvent` → currently `"bank_deposit"`

### 7d — Display component tests
- `ActivityIcon` and `SlimActivityRow` for all 18 canonical kinds including `payment_from_company`
- `payment_from_company` row: assert correct label, icon, color, grouping (company), money display, and balance transition wording (mirrors `payment_to_company` with opposite sign)
- `payment_from_company` expanded panel: assert it renders correctly — not a grey circle with empty data
- Reports grouping: read `getReportSubtype` in `frontend/lib/activityKindMeta.ts` before writing assertions. The function currently returns `ActivityKind | null` — it does NOT return `"company_refill"` or `"company_return"`. Those chip values are UI display logic inside `SlimActivityRow`, not a named output of `getReportSubtype`. Assert `getReportSubtype({ event_type: "refill", buy12: 3 })` returns `"refill"` (the canonical kind), not `"company_refill"`. Do not assert chip split values that don't exist as a named function output — that would require production changes, which violates T7 scope.
- Customer detail filters: assert all three event-type filter blocks in `customers/[id].tsx` produce consistent results for the same input event

### 7e — Add screen integration
- Explicit coverage for `companyPaymentToEvent` from both payment directions (to company and from company)

### 7f — Bank split compatibility
- Assert `"bank_deposit"` + `transfer_direction="wallet_to_bank"` renders with label "Wallet to bank" via `normalizeEventType`
- Assert `"bank_deposit"` + `transfer_direction="bank_to_wallet"` renders with label "Bank to wallet" via `normalizeEventType`
- Assert canonical `"wallet_to_bank"` renders with label "Wallet to bank" without needing `transfer_direction`
- Assert canonical `"bank_to_wallet"` renders with label "Bank to wallet" without needing `transfer_direction`
- Assert that rendering does **not** parse label text to determine bank direction — direction must come from `event_type` or `transfer_direction`, never from string matching on the label

**Done when:** All tests pass; pre-migration adapter behavior is documented; `npm test` covers all 18 canonical kinds.

---

### Implementation

#### FILE 1 (new): `tests/frontend/__tests__/activityKindMeta.test.ts`

Create this file with the following content:

```ts
import { ACTIVITY_KIND_META, normalizeEventType, getReportSubtype } from "@/lib/activityKindMeta";
import type { ActivityKind } from "@/lib/activityKinds";

const ALL_KINDS: ActivityKind[] = [
  "replacement",
  "sell_full",
  "buy_empty_from_customer",
  "payment_from_customer",
  "payment_to_customer",
  "customer_return_empties",
  "adjust_customer_balance",
  "refill",
  "dist_return_empties",
  "buy_full_from_company",
  "payment_to_company",
  "payment_from_company",
  "adjust_company_balance",
  "expense",
  "wallet_to_bank",
  "bank_to_wallet",
  "adjust_wallet",
  "adjust_inventory",
];

describe("ACTIVITY_KIND_META", () => {
  it("has an entry for all 18 canonical kinds", () => {
    for (const kind of ALL_KINDS) {
      expect(ACTIVITY_KIND_META[kind]).toBeDefined();
    }
  });

  it("has a valid scope for every kind", () => {
    for (const kind of ALL_KINDS) {
      const meta = ACTIVITY_KIND_META[kind];
      expect(["customer", "company", "wallet", "inventory"]).toContain(meta.scope);
    }
  });

  it("has a non-empty label for every kind", () => {
    for (const kind of ALL_KINDS) {
      const meta = ACTIVITY_KIND_META[kind];
      expect(typeof meta.label).toBe("string");
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeEventType", () => {
  it("passes through canonical kinds unchanged", () => {
    expect(normalizeEventType("replacement")).toBe("replacement");
    expect(normalizeEventType("sell_full")).toBe("sell_full");
    expect(normalizeEventType("payment_from_customer")).toBe("payment_from_customer");
    expect(normalizeEventType("payment_to_company")).toBe("payment_to_company");
    expect(normalizeEventType("payment_from_company")).toBe("payment_from_company");
    expect(normalizeEventType("adjust_inventory")).toBe("adjust_inventory");
    expect(normalizeEventType("wallet_to_bank")).toBe("wallet_to_bank");
    expect(normalizeEventType("bank_to_wallet")).toBe("bank_to_wallet");
  });

  it('maps legacy "order" to "replacement" with no order_mode', () => {
    expect(normalizeEventType("order")).toBe("replacement");
  });

  it('maps legacy "order" using order_mode context', () => {
    expect(normalizeEventType("order", { order_mode: "replacement" })).toBe("replacement");
    expect(normalizeEventType("order", { order_mode: "sell_iron" })).toBe("sell_full");
    expect(normalizeEventType("order", { order_mode: "buy_iron" })).toBe("buy_empty_from_customer");
  });

  it("maps legacy collection aliases", () => {
    expect(normalizeEventType("collection_money")).toBe("payment_from_customer");
    expect(normalizeEventType("collection_payout")).toBe("payment_to_customer");
    expect(normalizeEventType("collection_empty")).toBe("customer_return_empties");
  });

  it('maps legacy "customer_adjust" to "adjust_customer_balance"', () => {
    expect(normalizeEventType("customer_adjust")).toBe("adjust_customer_balance");
  });

  it('maps legacy "company_buy_full" to "buy_full_from_company"', () => {
    expect(normalizeEventType("company_buy_full")).toBe("buy_full_from_company");
  });

  it('maps legacy "company_payment" using money_direction', () => {
    expect(normalizeEventType("company_payment", { money_direction: "in" })).toBe("payment_from_company");
    expect(normalizeEventType("company_payment", { money_direction: "out" })).toBe("payment_to_company");
    expect(normalizeEventType("company_payment")).toBe("payment_to_company");
  });

  it('maps legacy "company_adjustment" to "adjust_company_balance"', () => {
    expect(normalizeEventType("company_adjustment")).toBe("adjust_company_balance");
  });

  it('maps legacy "cash_adjust" to "adjust_wallet"', () => {
    expect(normalizeEventType("cash_adjust")).toBe("adjust_wallet");
  });

  it('maps legacy "adjust" to "adjust_inventory"', () => {
    expect(normalizeEventType("adjust")).toBe("adjust_inventory");
  });

  it('maps legacy "bank_deposit" using transfer_direction', () => {
    expect(normalizeEventType("bank_deposit", { transfer_direction: "wallet_to_bank" })).toBe("wallet_to_bank");
    expect(normalizeEventType("bank_deposit", { transfer_direction: "bank_to_wallet" })).toBe("bank_to_wallet");
    expect(normalizeEventType("bank_deposit")).toBe("wallet_to_bank");
  });

  it("returns null for unknown strings", () => {
    expect(normalizeEventType("unknown_xyz")).toBeNull();
    expect(normalizeEventType("")).toBeNull();
    expect(normalizeEventType("ORDER")).toBeNull();
  });
});

describe("getReportSubtype", () => {
  it('returns "refill" for a refill event', () => {
    expect(getReportSubtype({ event_type: "refill", buy12: 3 })).toBe("refill");
  });

  it("returns null for an unknown event_type", () => {
    expect(getReportSubtype({ event_type: "unknown_xyz" })).toBeNull();
  });

  it("does not return UI display strings like 'company_refill'", () => {
    const result = getReportSubtype({ event_type: "refill", buy12: 3 });
    expect(result).not.toBe("company_refill");
    expect(result).not.toBe("company_return");
  });
});
```

---

#### FILE 2 (new): `tests/frontend/__tests__/activity-adapter-baselines.test.ts`

This file documents the **current (pre-T8) event_type output** of every adapter function. T8 will change these; these tests will fail after T8 and must be updated to the canonical values at that point.

Create this file with the following content:

```ts
import {
  bankDepositToEvent,
  cashAdjustmentToEvent,
  collectionToEvent,
  companyBalanceAdjustmentToEvent,
  companyPaymentToEvent,
  customerAdjustmentToEvent,
  inventoryAdjustmentGroupToEvent,
  inventoryAdjustmentToEvent,
  orderToEvent,
} from "@/lib/activityAdapter";
import type {
  BankDeposit,
  CompanyBalanceAdjustment,
  CustomerAdjustment,
  InventoryAdjustment,
  Order,
} from "@/types/domain";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    customer_id: "cust-1",
    system_id: "sys-1",
    order_mode: "replacement",
    gas_type: "12kg",
    cylinders_installed: 1,
    cylinders_received: 0,
    price_total: 100,
    paid_amount: 0,
    debt_cash: 0,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    delivered_at: "2026-05-14T09:00:00Z",
    created_at: "2026-05-14T09:00:00Z",
    updated_at: null,
    note: null,
    is_deleted: false,
    ...overrides,
  };
}

function makeCustomerAdjustment(overrides: Partial<CustomerAdjustment> = {}): CustomerAdjustment {
  return {
    id: "adj-1",
    customer_id: "cust-1",
    amount_money: 50,
    count_12kg: 0,
    count_48kg: 0,
    effective_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    debt_cash: 100,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    ...overrides,
  };
}

function makeBankDeposit(overrides: Partial<BankDeposit> = {}): BankDeposit {
  return {
    id: "bank-deposit-1",
    happened_at: "2026-05-14T12:00:00Z",
    amount: 200,
    direction: "wallet_to_bank",
    note: null,
    ...overrides,
  };
}

function makeInventoryAdj(overrides: Partial<InventoryAdjustment> = {}): InventoryAdjustment {
  return {
    id: "inventory-adj-1",
    gas_type: "12kg",
    delta_full: 2,
    delta_empty: -1,
    effective_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    ...overrides,
  };
}

function makeCompanyAdjustment(overrides: Partial<CompanyBalanceAdjustment> = {}): CompanyBalanceAdjustment {
  return {
    id: "company-adj-1",
    happened_at: "2026-05-14T11:00:00Z",
    created_at: "2026-05-14T11:00:00Z",
    money_balance: 120,
    cylinder_balance_12: 3,
    cylinder_balance_48: -1,
    delta_money: 20,
    delta_cylinder_12: -2,
    delta_cylinder_48: 1,
    live_debt_cash: 120,
    live_debt_cylinders_12: 3,
    live_debt_cylinders_48: -1,
    note: null,
    is_deleted: false,
    ...overrides,
  };
}

// PRE-MIGRATION BASELINES: All event_type values below are legacy strings.
// T8 will migrate each adapter to emit canonical ActivityKind values.
// When T8 is done, update each .toBe() to the canonical value listed in the comment.

describe("adapter event_type baselines — pre-T8", () => {
  describe("orderToEvent", () => {
    it('emits legacy "order" for replacement mode (T8 → "replacement")', () => {
      expect(orderToEvent(makeOrder({ order_mode: "replacement" })).event_type).toBe("order");
    });

    it('emits legacy "order" for sell_iron mode (T8 → "sell_full")', () => {
      expect(orderToEvent(makeOrder({ order_mode: "sell_iron" })).event_type).toBe("order");
    });

    it('emits legacy "order" for buy_iron mode (T8 → "buy_empty_from_customer")', () => {
      expect(orderToEvent(makeOrder({ order_mode: "buy_iron" })).event_type).toBe("order");
    });
  });

  describe("collectionToEvent", () => {
    it('emits legacy "collection_money" for payment action (T8 → "payment_from_customer")', () => {
      const event = collectionToEvent({
        id: "col-1",
        customer_id: "cust-1",
        action_type: "payment",
        amount_money: 50,
        debt_cash: 0,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        effective_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
      } as any);
      expect(event.event_type).toBe("collection_money");
    });

    it('emits legacy "collection_payout" for payout action (T8 → "payment_to_customer")', () => {
      const event = collectionToEvent({
        id: "col-2",
        customer_id: "cust-1",
        action_type: "payout",
        amount_money: 30,
        debt_cash: 0,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        effective_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
      } as any);
      expect(event.event_type).toBe("collection_payout");
    });

    it('emits legacy "collection_empty" for return action (T8 → "customer_return_empties")', () => {
      const event = collectionToEvent({
        id: "col-3",
        customer_id: "cust-1",
        action_type: "return",
        qty_12kg: 2,
        qty_48kg: 0,
        debt_cash: 0,
        debt_cylinders_12: 2,
        debt_cylinders_48: 0,
        effective_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
      } as any);
      expect(event.event_type).toBe("collection_empty");
    });
  });

  describe("customerAdjustmentToEvent", () => {
    it('emits legacy "customer_adjust" (T8 → "adjust_customer_balance")', () => {
      expect(customerAdjustmentToEvent(makeCustomerAdjustment()).event_type).toBe("customer_adjust");
    });
  });

  describe("companyPaymentToEvent — highest-risk path", () => {
    it('emits legacy "company_payment" when paying TO company — direction is lost in event_type (T8 → "payment_to_company")', () => {
      const event = companyPaymentToEvent({
        id: "pay-1",
        amount: 50,
        live_debt_cash: 100,
        happened_at: "2026-05-14T10:00:00Z",
        note: null,
      } as any);
      // PRE-MIGRATION: both directions collapse to "company_payment"; direction only survives in money_direction
      expect(event.event_type).toBe("company_payment");
      expect(event.money_direction).toBe("out");
    });

    it('emits legacy "company_payment" when receiving FROM company — direction is lost in event_type (T8 → "payment_from_company")', () => {
      const event = companyPaymentToEvent({
        id: "pay-2",
        amount: -30,
        live_debt_cash: 70,
        happened_at: "2026-05-14T10:00:00Z",
        note: null,
      } as any);
      // PRE-MIGRATION: negative amount means company paid us; T8 will emit "payment_from_company"
      expect(event.event_type).toBe("company_payment");
      expect(event.money_direction).toBe("in");
    });
  });

  describe("bankDepositToEvent", () => {
    it('emits legacy "bank_deposit" for wallet_to_bank direction (T8 → "wallet_to_bank")', () => {
      const event = bankDepositToEvent(makeBankDeposit({ direction: "wallet_to_bank" }));
      expect(event.event_type).toBe("bank_deposit");
      expect(event.transfer_direction).toBe("wallet_to_bank");
    });

    it('emits legacy "bank_deposit" for bank_to_wallet direction (T8 → "bank_to_wallet")', () => {
      const event = bankDepositToEvent(makeBankDeposit({ direction: "bank_to_wallet" }));
      expect(event.event_type).toBe("bank_deposit");
      expect(event.transfer_direction).toBe("bank_to_wallet");
    });
  });

  describe("companyBalanceAdjustmentToEvent", () => {
    it('emits legacy "company_adjustment" (T8 → "adjust_company_balance")', () => {
      expect(companyBalanceAdjustmentToEvent(makeCompanyAdjustment()).event_type).toBe("company_adjustment");
    });
  });

  describe("inventoryAdjustmentToEvent — single adjustment", () => {
    it('emits legacy "adjust" for a single adjustment (T8 → "adjust_inventory")', () => {
      expect(inventoryAdjustmentToEvent(makeInventoryAdj()).event_type).toBe("adjust");
    });

    it("hero_text is '<gas>: full +<n> | empty <n>' format", () => {
      const event = inventoryAdjustmentToEvent(makeInventoryAdj({ delta_full: 3, delta_empty: -2, gas_type: "12kg" }));
      expect(event.hero_text).toBe("12kg: full +3 | empty -2");
    });
  });

  describe("inventoryAdjustmentGroupToEvent — already canonical", () => {
    it('already emits canonical "adjust_inventory" — no migration needed in T8', () => {
      const event = inventoryAdjustmentGroupToEvent([
        makeInventoryAdj({ id: "inventory-adj-1", gas_type: "12kg", delta_full: 2, delta_empty: -1 }),
        makeInventoryAdj({ id: "inventory-adj-2", gas_type: "48kg", delta_full: 1, delta_empty: 0 }),
      ]);
      expect(event.event_type).toBe("adjust_inventory");
    });
  });

  describe("cashAdjustmentToEvent — already canonical", () => {
    it('already emits canonical "adjust_wallet" — no migration needed in T8', () => {
      const event = cashAdjustmentToEvent({
        id: "cash-1",
        delta_cash: 25,
        reason: null,
        effective_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
      } as any);
      expect(event.event_type).toBe("adjust_wallet");
    });
  });
});
```

---

#### FILE 3: `tests/frontend/__tests__/slim-activity-row-company.test.tsx`

**Change 1 — Add `payment_from_company` and bank split tests (after line 229, before the closing `});` on line 230)**

Insert six tests immediately before the closing `});` of the outermost `describe` block:

```tsx
  it("renders payment_from_company label and icon", () => {
    const { getByTestId, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "payment_from_company",
          id: "payment-from-company-1",
          source_id: "payment-from-company-1",
          display_name: "Company",
          label: "Payment from company",
          context_line: "Payment from company",
          money_amount: 300,
          money_direction: "in",
          counterparty: { type: "company", display_name: "Company", description: null, display: null },
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByTestId("activity-icon")).toBeTruthy();
    expect(getByText("Payment from company")).toBeTruthy();
  });

  it("payment_from_company renders icon, label, and positive money amount", () => {
    const { getByTestId, getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "payment_from_company",
          id: "payment-from-company-2",
          source_id: "payment-from-company-2",
          display_name: "Company",
          label: "Payment from company",
          context_line: "Payment from company",
          money_amount: 300,
          money_direction: "in",
          counterparty: { type: "company", display_name: "Company", description: null, display: null },
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByTestId("activity-icon")).toBeTruthy();
    expect(getByText("Payment from company")).toBeTruthy();
    expect(getByText("+300 $")).toBeTruthy();
  });

  it("bank_deposit + transfer_direction='bank_to_wallet' renders Bank to wallet label and positive amount", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "bank_deposit",
          id: "bank-btw-1",
          source_id: "bank-btw-1",
          display_name: "Bank transfer",
          label: "Bank to wallet",
          context_line: "Bank to wallet",
          money_amount: 200,
          money_direction: "in",
          transfer_direction: "bank_to_wallet",
          wallet_before: 280,
          wallet_after: 480,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("Bank to wallet")).toBeTruthy();
    expect(getByText("+200 $")).toBeTruthy();
  });

  it("canonical event_type 'wallet_to_bank' renders without needing transfer_direction field", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "wallet_to_bank",
          id: "wtb-canonical-1",
          source_id: "wtb-canonical-1",
          display_name: "Bank transfer",
          label: "Wallet to bank",
          context_line: "Wallet to bank",
          money_amount: 150,
          money_direction: "out",
          wallet_before: 500,
          wallet_after: 350,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("Wallet to bank")).toBeTruthy();
    expect(getByText("-150 $")).toBeTruthy();
  });

  it("canonical event_type 'bank_to_wallet' renders without needing transfer_direction field", () => {
    const { getByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "bank_to_wallet",
          id: "btw-canonical-1",
          source_id: "btw-canonical-1",
          display_name: "Bank transfer",
          label: "Bank to wallet",
          context_line: "Bank to wallet",
          money_amount: 150,
          money_direction: "in",
          wallet_before: 350,
          wallet_after: 500,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("Bank to wallet")).toBeTruthy();
    expect(getByText("+150 $")).toBeTruthy();
  });

  it("bank direction comes from transfer_direction, not from label text (anti-label-parsing)", () => {
    // transfer_direction says bank_to_wallet but label says "Wallet to bank" — transfer_direction wins
    const { getByText, queryByText } = render(
      <SlimActivityRow
        event={makeEvent({
          event_type: "bank_deposit",
          id: "bank-anti-label-1",
          source_id: "bank-anti-label-1",
          display_name: "Bank transfer",
          label: "Wallet to bank",
          context_line: "Wallet to bank",
          money_amount: 100,
          money_direction: "in",
          transfer_direction: "bank_to_wallet",
          wallet_before: 200,
          wallet_after: 300,
          counterparty: null,
        })}
        formatMoney={(value) => String(value)}
      />
    );

    expect(getByText("+100 $")).toBeTruthy();
    expect(queryByText("-100 $")).toBeNull();
  });
```

---

#### FILE 4: `tests/frontend/__tests__/payment-direction-wording.test.ts`

**Change 1 — Add cylinder balance wording tests (before the final `}` that closes the file)**

Append a new `describe` block after the last existing `it(...)` test (after line 39), before the final `}`:

```ts
  describe("cylinder balance wording (balance_row layout)", () => {
    it("singular debt: before=0, after=1 on customer", () => {
      const result = formatBalanceTransitions(
        [makeBalanceTransition("customer", "cyl_12", 0, 1)],
        { layout: "balance_row" }
      );
      expect(result).toEqual(["12kg balance: Settled → 1 debt (on customer)"]);
    });

    it("plural debts: before=0, after=2 on customer", () => {
      const result = formatBalanceTransitions(
        [makeBalanceTransition("customer", "cyl_12", 0, 2)],
        { layout: "balance_row" }
      );
      expect(result).toEqual(["12kg balance: Settled → 2 debts (on customer)"]);
    });

    it("singular credit: before=0, after=-1 on customer", () => {
      const result = formatBalanceTransitions(
        [makeBalanceTransition("customer", "cyl_12", 0, -1)],
        { layout: "balance_row" }
      );
      expect(result).toEqual(["12kg balance: Settled → 1 credit (for customer)"]);
    });

    it("plural credits: before=0, after=-2 on customer", () => {
      const result = formatBalanceTransitions(
        [makeBalanceTransition("customer", "cyl_12", 0, -2)],
        { layout: "balance_row" }
      );
      expect(result).toEqual(["12kg balance: Settled → 2 credits (for customer)"]);
    });

    it("company scope: positive after is credits for distributor (direction flip vs customer)", () => {
      const result = formatBalanceTransitions(
        [makeBalanceTransition("company", "cyl_12", 0, 2)],
        { layout: "balance_row" }
      );
      expect(result).toEqual(["12kg balance: Settled → 2 credits (for distributor)"]);
    });

    it("company scope: negative after is debts on distributor", () => {
      const result = formatBalanceTransitions(
        [makeBalanceTransition("company", "cyl_12", 0, -2)],
        { layout: "balance_row" }
      );
      expect(result).toEqual(["12kg balance: Settled → 2 debts (on distributor)"]);
    });

    it("unchanged non-zero balance shows current state, not a transition", () => {
      const result = formatBalanceTransitions(
        [makeBalanceTransition("customer", "cyl_12", 3, 3)],
        { layout: "balance_row" }
      );
      expect(result).toEqual(["12kg balance: unchanged — debts 3 (on customer)"]);
    });
  });
```

> `makeBalanceTransition` signature: `(scope, component, before, after)`. Do NOT pass `formatMoney` — cylinder balance_row layout does not render money amounts.

---

#### FILE 5: `tests/frontend/__tests__/event-expanded-panel-company.test.tsx`

**Change 1 — Add `payment_from_company` expanded panel test (after line 92, before the closing `}`)**

Insert one test before the closing `}` of the outermost `describe` block (after the bank_deposit test at line 91):

```tsx
  it("renders payment_from_company without cylinder boxes", () => {
    const { queryByText } = render(
      <EventExpandedPanel
        ev={{
          event_type: "payment_from_company",
          money_direction: "in",
          money_amount: 300,
          company_before: 400,
          company_after: 100,
          wallet_before: 500,
          wallet_after: 500,
        }}
        formatMoney={formatMoney}
        formatCount={formatCount}
      />
    );

    expect(queryByText("12kg Full")).toBeNull();
    expect(queryByText("48kg Full")).toBeNull();
    expect(queryByText("12kg Empty")).toBeNull();
    expect(queryByText("48kg Empty")).toBeNull();
  });
```

---

### Tests

Do NOT run any tests or build commands. Return the exact commands for the developer to run.

Run from the `frontend/` directory:
```
npx jest ../tests/frontend/__tests__/activityKindMeta.test.ts --no-coverage
npx jest ../tests/frontend/__tests__/activity-adapter-baselines.test.ts --no-coverage
npx jest ../tests/frontend/__tests__/slim-activity-row-company.test.tsx --no-coverage
npx jest ../tests/frontend/__tests__/payment-direction-wording.test.ts --no-coverage
npx jest ../tests/frontend/__tests__/event-expanded-panel-company.test.tsx --no-coverage
```

---

### Return Section

When done, return:
1. The five test commands above (verbatim, noting they must be run from `frontend/`)
2. Confirmation that `activityKindMeta.test.ts` and `activity-adapter-baselines.test.ts` were created as new files
3. A list of every line changed or inserted in each of the three extended files
4. Confirm: no production source files were modified (only `tests/frontend/__tests__/` files)
5. Confirm: `makeBalanceTransition` was called with positional args `(scope, component, before, after)` — not an object literal
6. Confirm: `activity-adapter-baselines.test.ts` includes both `cashAdjustmentToEvent` → `"adjust_wallet"` (already canonical) and `inventoryAdjustmentGroupToEvent` → `"adjust_inventory"` (already canonical)

---

### Acceptance Criteria

**7a — Metadata and normalizer (activityKindMeta.test.ts)**
- [ ] `ACTIVITY_KIND_META` entry exists for all 18 canonical kinds
- [ ] Every kind's `meta.scope` is one of `["customer", "company", "wallet", "inventory"]`
- [ ] `normalizeEventType` maps all legacy aliases (order, collection_money/payout/empty, customer_adjust, company_buy_full, company_payment, company_adjustment, cash_adjust, adjust, bank_deposit) to canonical kinds
- [ ] Unknown strings return `null`; case-sensitive (`"ORDER"` → `null`)
- [ ] `getReportSubtype` returns `"refill"` (not `"company_refill"`) for a refill event; returns `null` for unknown

**7b — Balance renderer (payment-direction-wording.test.ts)**
- [ ] 7 cylinder balance wording tests using `layout: "balance_row"`: singular debt, plural debts, singular credit, plural credits, company positive (credits for distributor), company negative (debts on distributor), unchanged non-zero

**7c + 7e — Adapter baselines (activity-adapter-baselines.test.ts)**
- [ ] `orderToEvent` asserts `"order"` for all three order_mode values (`replacement`, `sell_iron`, `buy_iron`)
- [ ] `collectionToEvent` asserts `"collection_money"`, `"collection_payout"`, `"collection_empty"` per action_type
- [ ] `customerAdjustmentToEvent` asserts `"customer_adjust"`
- [ ] `companyPaymentToEvent` asserts `"company_payment"` for both payment directions, with `money_direction: "out"` (positive amount) and `"in"` (negative amount) preserved
- [ ] `companyBalanceAdjustmentToEvent` asserts `"company_adjustment"`
- [ ] `bankDepositToEvent` asserts `"bank_deposit"` for both directions; asserts `transfer_direction` is preserved on the event
- [ ] `inventoryAdjustmentToEvent` (single) asserts `"adjust"` and hero_text format `"<gas>: full +<n> | empty <n>"`
- [ ] `inventoryAdjustmentGroupToEvent` asserts `"adjust_inventory"` (already canonical — no T8 migration needed)
- [ ] `cashAdjustmentToEvent` asserts `"adjust_wallet"` (already canonical — no T8 migration needed)

**7d — Display component (slim-activity-row-company.test.tsx + event-expanded-panel-company.test.tsx)**
- [ ] `payment_from_company` renders `activity-icon`, label "Payment from company", and `+300 $` in `SlimActivityRow` (two tests, both asserting real output — no `icon-unknown` testId)
- [ ] `payment_from_company` expanded panel: no cylinder boxes rendered

**7f — Bank split compatibility (slim-activity-row-company.test.tsx)**
- [ ] `"bank_deposit"` + `transfer_direction: "bank_to_wallet"` renders "Bank to wallet" label and `+` amount
- [ ] Canonical `"wallet_to_bank"` renders correctly without `transfer_direction` field
- [ ] Canonical `"bank_to_wallet"` renders correctly without `transfer_direction` field
- [ ] Anti-label-parsing: when `transfer_direction: "bank_to_wallet"` but label says "Wallet to bank", money sign is `+` (direction from `transfer_direction`, not label text)

**General**
- [ ] No production source files modified
- [ ] All 5 test commands pass with 0 failures

**STATUS: COMPLETE** — adapter + display safety net tests passing; all activity kinds covered; canonical expectations locked in before T8.

---

## Ticket 8 — Frontend Adapter Migration

**Goal:** `activityAdapter.ts` emits canonical `event_type` values only. All display components already handle canonical kinds via Ticket 4.

**Files:**
- `frontend/lib/activityAdapter.ts`
- Update Ticket 7 tests to canonical expectations

**Migration map:**

| Current output | New output |
|---|---|
| `"order"` | `"replacement"` / `"sell_full"` / `"buy_empty_from_customer"` |
| `"collection_money"` | `"payment_from_customer"` |
| `"collection_payout"` | `"payment_to_customer"` |
| `"collection_empty"` | `"customer_return_empties"` |
| `"customer_adjust"` | `"adjust_customer_balance"` |
| `"company_payment"` | `"payment_to_company"` / `"payment_from_company"` (split by direction) |
| `"company_adjustment"` | `"adjust_company_balance"` |
| `"adjust"` (single) | `"adjust_inventory"` |
| `"bank_deposit"` | `"wallet_to_bank"` / `"bank_to_wallet"` |

Also: remove dead `refill.kind === "buy_iron"` check (line 138).

Bank migration rules:
- `bankDepositToEvent()` must emit `"wallet_to_bank"` or `"bank_to_wallet"` — stop emitting `"bank_deposit"`.
- It may retain `transfer_direction` temporarily if the shared `DailyReportEvent` type still declares it during the migration window.
- After T8, no adapter function may emit a legacy alias; canonical `ActivityKind` values only.

**Done when:** `activityAdapter.ts` emits no legacy aliases; Ticket 7 tests updated to canonical expectations; UI walkthrough confirms all add-screen previews render correctly.

**STATUS: COMPLETE** — `activityAdapter.ts` emits canonical `ActivityKind` values only; all legacy synthetic aliases (`"order"`, `"collection_money"`, etc.) removed from adapter output; T7 tests updated to canonical expectations.

---

## Ticket 9 — Cleanup

**Precondition:** Ticket 7 tests pass; UI walkthrough of all activity kinds on both the reports screen and the add screen confirms no regressions.

**Goal:** Remove all dead legacy aliases and backward-compatibility code.

**Files:**
- `frontend/lib/reports/eventColors.ts`
- `frontend/lib/reports/utils.ts`
- `frontend/lib/eventLabels.ts`
- `frontend/lib/activityKindMeta.ts` (normalizeEventType branch cleanup)
- `frontend/lib/activityAdapter.ts`
- `frontend/types/report.ts`
- `frontend/components/reports/EventExpandedPanel.tsx`
- `frontend/components/CashExpensesView.tsx`
- `frontend/app/inventory/new.tsx`
- `backend/app/services/reports_event_fields.py`
- `backend/app/routers/reports.py`
- `backend/app/schemas/report.py`

**Remove:**

| Alias | Location |
|---|---|
| `order` | `eventColors.ts`, `utils.ts` |
| `collection_money`, `collection_payout`, `collection_empty` | `eventColors.ts`, `utils.ts` |
| `customer_adjust` | `eventColors.ts`, `utils.ts` |
| `company_payment`, `company_adjustment` | `eventColors.ts`, `utils.ts` |
| `cash_adjust` (frontend display) | `eventColors.ts`, `utils.ts` |
| `adjust` (legacy) | `eventColors.ts`, `utils.ts` |
| `company_return_empties` | `eventColors.ts`, `utils.ts` |
| `company_buy_iron`, `company_buy_full` | `eventColors.ts`, `utils.ts` |
| `bank_deposit` display branching | `eventColors.ts`, reports components |
| `transfer_direction` | backend response + schema |

Additional cleanup:
- Remove the temporary defensive shim added in T2b-d from `reports.py` — marked with `# TODO(T9)` comment.
- Remove `_is_company_return_only_refill()`, `_is_company_receive_only_refill()`, and `_is_company_settle_only_refill()` from `reports_event_fields.py` — these become dead code after T2b migration runs and all rows carry correct canonical kinds.
- Remove `normalizeBankDepositDisplayEvent()` from `activityAdapter.ts` — it becomes dead after T8 and T2 are both complete.
- Remove all display branches that check `event_type === "bank_deposit"` in `EventExpandedPanel.tsx` and any other display component.
- Remove `transfer_direction` from `frontend/types/report.ts` after backend and adapter both use canonical bank event types and no production path reads the field.
- Remove old highlight event types (`bank_deposit`, `cash_adjust`) from navigation/reveal paths such as `CashExpensesView.tsx` and `frontend/app/inventory/new.tsx`.
- Remove backend bank-deposit compatibility branches from `reports_event_fields.py` after `wallet_to_bank` and `bank_to_wallet` are canonical.
- Re-scan `_company_payment_label` after the T2 label/hero-text consolidation (section 2f). If the consolidation made it still used for hero text and label, keep it. If a post-T2 grep shows it is no longer called, remove it. Do not remove it blindly before T2 is complete.

**Do NOT remove:**
- Backend `source_type="cash_adjust"` and `source_type="inventory_adjust"` — these are DB ledger keys, entirely separate from report event types

**Done when:** No legacy alias appears anywhere in production display code, including `normalizeEventType()`; canonical `ActivityKind` values are the only accepted production display values; all tests pass; build succeeds.

**STATUS: COMPLETE** — all legacy aliases removed from `normalizeEventType()`, `eventColors.ts`, `utils.ts`, `eventLabels.ts`; `transfer_direction` dropped from backend response and frontend types; dead adapter helpers removed; all tests pass.

---

## Ticket 10 — Opening Balance Visibility

**Goal:** Replace the dead `init` / `init_balance` / `init_credit` / `init_return` frontend aliases with three canonical, scoped opening-balance activity kinds that display correctly on their respective screens.

**Preconditions:** T9 complete (all legacy aliases removed).

**Background:** The backend posts opening entries via `post_system_init()` with `source_type="system_init"`. These are currently absorbed silently into the running balance in `reports.py` and never surface as visible events. The old frontend aliases (`init`, `init_balance`, `init_credit`, `init_return`) were removed in T9 as dead code.

**Proposed canonical kinds (3 new, making 21 total):**

| Canonical Kind | Scope | Appears On |
|---|---|---|
| `init_customer` | customer money, cyl_12, cyl_48 | Customer review page + customer activity table |
| `init_company` | company money, cyl_12, cyl_48 | Company activity table |
| `init_inventory` | full_12, empty_12, full_48, empty_48, cash | Daily report only |

**Work:**

- Backend: emit `init_customer`, `init_company`, `init_inventory` as visible event rows in the relevant feed endpoints instead of folding them silently into the running balance
- Backend: `reports.py` — surface `system_init` entries scoped by kind rather than absorbing them
- Frontend: add entries for all 3 kinds in `activityKindMeta.ts` (icon, color, label, filter group, scope)
- Frontend: add display handling on customer review page, company activity table, and daily report
- Tests: assert each kind appears only on its designated screen; assert balance transitions are correct

**Done when:** Opening balance entries are visible on the correct screens with correct labels and balance transitions; no `system_init` entry is silently dropped without display.

**STATUS: FUTURE WORK** — not yet started. Precondition (T9) is complete. Implement when opening balance visibility becomes a user priority.

---

## Future API Route Naming

This is intentionally not part of Tickets 2 or 8 because route names are a public API compatibility decision.

Consider adding canonical route aliases in a future API cleanup ticket:
- `/cash/bank_deposit` -> wallet/bank transfer endpoint
- `/cash/bank_deposits` -> wallet/bank transfer listing endpoint
- `/cash/adjust` -> wallet adjustment endpoint
- `/cash/adjustments` -> wallet adjustment listing endpoint

If canonical aliases are introduced, update frontend API hooks and cache keys such as `useBankDeposits`, `frontend/lib/api/expenses.ts`, and `frontend/lib/api/adjustments.ts`.

---

## Summary Table

| Ticket | Area | Key Output | Status | Depends On |
|---|---|---|---|---|
| T1 | Docs | `ACTIVITY_KIND_NAMING.md` finalized | COMPLETE | — |
| T2 | Backend | Canonical event types, aligned labels, bank split | COMPLETE | T1 |
| T2b | Write Path | All write paths store canonical kind at creation time; migration backfills bad rows | COMPLETE | T2 |
| T3 | Backend Tests | 18-kind coverage, contract locked | COMPLETE | T2 |
| T4 | Frontend Metadata | `activityKindMeta.ts`, `normalizeEventType()`, `IconSpec` | COMPLETE (gap) | T1 |
| T4-CLEANUP | Raw branch cleanup | Remove raw `event_type` branches in SlimActivityRow, EventExpandedPanel, reports/index, customers/[id] | COMPLETE | T4 |
| T5 | Translation-Ready Labels | `translations.ts`, label wiring in `SlimActivityRow` | COMPLETE | T4 |
| T6 | Frontend Balance | `balanceTransitions.ts` shared renderer | COMPLETE | T4 |
| T6-TESTS | Test Fixes | 10 test files updated to match T5+T6 behavior | COMPLETE | T6 |
| T-ICONS | Icon Renderer | SVG symbol+arrow renderer replacing Ionicons fallback | COMPLETE | T4 |
| T-ICON-LAYOUT | Icon Layout | Fix left gap, size, and symbol/arrow alignment in row | COMPLETE | T-ICONS |
| T7 | Frontend Tests | Adapter + display coverage, pre-migration safety net | COMPLETE | T4-CLEANUP, T5, T6, T-ICONS |
| T8 | Frontend Adapter | `activityAdapter.ts` emits canonical kinds only | COMPLETE | T4, T7 |
| T9 | Cleanup | Dead aliases removed, `transfer_direction` dropped | COMPLETE | T3, T7, T8 |
| T10 | Opening Balance Visibility | `init_customer`, `init_company`, `init_inventory` canonical kinds; visible on correct screens | FUTURE WORK | T9 |

---

## Database Engineering Track

These tickets address structural database problems identified in the full schema audit (`DATABASE_AUDIT.md`). They are independent of the activity kind naming refactor above but share some dependencies — notably DB-T5 (removing the `mode` column) must run after T8/T9, and DB-T6 (FIFO costing) requires a stable schema.

**Execution order:** DB-T1 → DB-T2 → DB-T3 → DB-T4 → DB-T5 → DB-T6 / DB-T7 (parallel after DB-T5)

| Ticket | Area | Key Output | Depends On |
|---|---|---|---|
| DB-T1 | Ledger Integrity | Ledger posts to correct tenant; source types stable; no duplicate money entries | — |
| DB-T2 | Constraints & Integrity | All uniqueness, FK, and check constraints in place | DB-T1 |
| DB-T3 | Soft Delete & Audit | Safe deletion for core entities; full audit trail | DB-T2 |
| DB-T4 | Tenant Isolation | Config tables per-tenant; sessions and roles scoped; circular FK removed | DB-T3 |
| DB-T5 | Performance & Cleanup | Composite indexes; race condition fixed; structural cleanup | T8, T9, DB-T4 |
| DB-T6 | FIFO Inventory Costing | Accurate per-sale cost tracking; gross profit reporting | DB-T5 |
| DB-T7 | Dedicated Bank Transfers | `bank_transfers` table; migrate deposit rows from `expenses` | DB-T5 |

---

### Database Ticket Implementation Guardrails

These rules apply to every DB-T ticket. They exist to prevent later DB work from undoing completed activity-kind refactoring or prior DB tickets.

**Required preflight before editing code:**
1. Read the current DB ticket and every dependency listed in the table above.
2. If any touched file also participated in T2/T2b/T8/T9/T10 activity-kind work, read `ACTIVITY_SPEC.md` and the relevant git commits before changing it.
3. Inspect history for the files in scope with `git log --oneline -- <files>` and inspect relevant commits with `git show <commit> -- <files>`.
4. Run `rg` for every symbol being changed (`kind`, `event_type`, `source_type`, table name, helper name, migration id) before deciding whether code is missing or intentionally removed.

**Do not regress completed activity-kind work:**
- Do not reintroduce legacy report/display aliases removed by T9: `order`, `collection_money`, `collection_payout`, `collection_empty`, `customer_adjust`, `company_payment`, `company_adjustment`, `company_buy_iron`, `company_buy_full`, `company_return_empties`, `cash_adjust` as display kind, `adjust`, or `bank_deposit`.
- Do not reintroduce `normalizeBankDepositDisplayEvent()`. It was a temporary T8 bank-deposit compatibility shim and was intentionally removed in T9.
- Do not infer activity identity from amount sign, label text, hero text, or quantities unless the current ticket explicitly names a temporary shim and its removal ticket.
- After T9, `/company/payments` requires explicit `kind`; missing `kind` returns `422 kind_required`. Do not restore amount-sign inference.
- `company_transactions.kind`, `customer_transactions.kind`, and report `event_type` values must be canonical `ActivityKind` values, not legacy aliases.

**Keep namespaces separate:**
- `LedgerSourceType` values in `ledger_entries.source_type` are not display activity kinds. Protected source types include `customer_txn`, `company_txn`, `inventory_adjust`, `expense`, `cash_adjust`, and `system_init`.
- Renaming tables or models does not automatically rename ledger `source_type` values. In particular, `cash_adjust` and `inventory_adjust` remain stable ledger source discriminators unless a ticket explicitly changes all source rows and all readers together.
- Add-screen filter/list kinds and API route names are separate namespaces. Do not treat them as report `ActivityKind` values.

**Test interpretation rule:**
- If a test asserts behavior that a completed ticket intentionally removed, update the stale test. Do not restore removed production code just to satisfy stale assertions.
- If a test exposes an unclear semantic mismatch, investigate the approved naming/docs before changing production code.

**Migration discipline:**
- Create new migrations for DB-ticket work. Do not edit existing migrations unless the ticket explicitly says to repair that migration file.
- Before writing a migration, confirm the latest `down_revision` and whether another unmerged migration already exists in the same branch.
- Keep each migration scoped to the current ticket; do not bundle unrelated DB cleanup.

---

## DB-T1 — Ledger Integrity

**Goal:** Fix the ledger's core correctness before anything else. All work is contained to `posting.py` and one migration.

**Why first:** `_insert_ledger_entries()` currently stamps every ledger entry with `DEFAULT_TENANT_ID` regardless of which tenant created the source transaction. In a multi-tenant deployment this produces wrong balances and wrong reports for every tenant except the default one. This is producing incorrect data right now.

**Preflight / anti-regression:**
- Apply the shared Database Ticket Implementation Guardrails before editing.
- Inspect prior activity-kind migrations before touching `source_type` or `kind`; do not reverse correct `customer_transactions.kind` or `company_transactions.kind` canonicalization.
- Do not touch unrelated router call sites for reversal behavior unless this ticket explicitly includes them.
- Preserve post-T9 company payment explicit-kind behavior; DB-T1 must not reintroduce amount-sign inference.

**Work:**

### 1a — Fix tenant isolation in ledger posting
`posting.py` line 174 hardcodes `tenant_id=DEFAULT_TENANT_ID` in `_insert_ledger_entries()`. Change the function signature to accept `tenant_id` as a parameter and pass the source row's `tenant_id` at every call site:
- `post_customer_transaction` → pass `txn.tenant_id`
- `post_company_transaction` → pass `txn.tenant_id`
- `post_inventory_adjustment` → pass `adj.tenant_id`
- `post_expense` → pass `expense.tenant_id`
- `post_cash_adjustment` → pass `adjustment.tenant_id`
- `post_system_init` → pass `tenant_id` parameter (already available at call sites)
- `reverse_source` → pass `tenant_id` parameter

Backfill existing `ledger_entries` rows by joining to source tables on `(source_type, source_id)` and updating `tenant_id`.

### 1b — Protect and verify ledger source types
The six stable `LedgerSourceType` values are:

| Source type | Source table |
|---|---|
| `customer_txn` | `customer_transactions` |
| `company_txn` | `company_transactions` |
| `inventory_adjust` | `inventory_adjustments` |
| `expense` | `expenses` |
| `cash_adjust` | wallet adjustment rows (`cash_adjustments` before DB-T5 rename, `wallet_adjustments` after DB-T5 rename) |
| `system_init` | system initialisation |

These are stable ledger source discriminators. They are **not** activity display kinds and must never be renamed to match `ActivityKind` values. If any migration renamed `cash_adjust → adjust_wallet` or `inventory_adjust → adjust_inventory` in `ledger_entries.source_type`, backfill those rows back to the stable names above.

Keep both `cash_adjust` and `inventory_adjust` in the protected list in Ticket 2 of this file.

Known bad migration to repair: `backend/alembic/versions_v2/n1_rename_activity_kinds.py`.
- The customer/company transaction kind columns (`customer_transactions.kind`, `company_transactions.kind`) were correctly renamed by this migration and should **not** be reversed.
- The ledger-source changes are wrong: `ledger_entries.source_type` was incorrectly renamed from `cash_adjust → adjust_wallet` and `inventory_adjust → adjust_inventory`.
- Add a **standalone** repair migration (e.g. `n2_repair_ledger_source_types.py`) that restores ledger source types: `adjust_wallet → cash_adjust` and `adjust_inventory → inventory_adjust`. Ship this as its own migration immediately — do not bundle with other DB ticket work, as corrupted source types produce incorrect balance reports right now.
- Verify `posting.py`, report source lookups, and ledger integrity checks still write and read `cash_adjust` and `inventory_adjust`.

### 1c — Fix ledger unique constraint NULL trap
The unique constraint `uq_ledger_source_account` covers `(source_type, source_id, account, gas_type, state, unit)`. Because `gas_type` and `state` are nullable, SQL treats two `NULL` values as distinct — allowing duplicate money ledger entries (where both are `NULL`) to bypass the constraint.

Fix options (choose one):
- Replace NULLs with a sentinel string (e.g. `"_"`) and enforce `NOT NULL` on `gas_type` and `state`
- Add `tenant_id` to the constraint and use a partial unique index for money rows

### 1d — Add reversal linkage to ledger entries
`reverse_source()` in `posting.py` creates mirror ledger entries for a reversal but does not link them back to the original entries. Add `reversal_of_id` (nullable FK → `ledger_entries.id`) to `ledger_entries` and populate it in `reverse_source()`.

**Files:**
- `backend/app/services/posting.py`
- `backend/app/models.py` (`LedgerEntry` model)
- New Alembic migration

**Done when:** All ledger entries carry the correct `tenant_id`; `posting.py` writes no `DEFAULT_TENANT_ID`; source types in the DB match the six stable values; money entries cannot be duplicated; reversal entries link back to originals.

---

## DB-T2 — Constraints and Integrity

**Preflight / anti-regression:**
- Apply the shared Database Ticket Implementation Guardrails before editing.
- Check the latest model code and migrations before adding constraints; do not duplicate constraints that already exist.
- Removing the default on `company_transactions.kind` strengthens the post-T9 explicit-kind contract. Do not add route-level inference as a replacement.
- Check constraints for `kind` fields must allow canonical `ActivityKind` values only, not legacy aliases removed by T9.

**Goal:** Make the database reject bad data at the schema level. This is migration-only work — no application logic changes except removing one dangerous default.

**Work:**

### 2a — Tenant-scoped `request_id` uniqueness
`request_id` is currently globally unique on all five operational tables. Two tenants generating the same ID (common with sequential mobile IDs) would cause a collision error. Replace the global unique constraint with a per-tenant composite:

Change `UNIQUE(request_id)` → `UNIQUE(tenant_id, request_id)` on:
- `customer_transactions`
- `company_transactions`
- `expenses`
- `inventory_adjustments`
- `cash_adjustments`

### 2b — Missing uniqueness constraints
Add:
- `UNIQUE(tenant_id, user_id)` on `tenant_memberships` — prevents the same user being added to the same tenant twice
- `UNIQUE(role_id, permission_code)` on `role_permissions` — prevents the same permission being granted to the same role twice
- `UNIQUE(plan_id, key)` on `plan_entitlements` — prevents two conflicting values for the same entitlement key

### 2c — Remove dangerous default on `company_transactions.kind`
`kind` currently defaults to `"refill"`. A code path that forgets to set `kind` silently creates a refill record. Remove the default so a missing `kind` raises a database error.

### 2d — Foreign key from `role_permissions.permission_code` to `permissions.code`
`role_permissions.permission_code` is a plain string — a role can be assigned a permission code that does not exist in the `permissions` table. Add:
```sql
FOREIGN KEY (permission_code) REFERENCES permissions(code)
```

### 2e — Check constraints on string fields
Add check constraints for all fields that accept only a known set of values:

| Table | Field | Allowed values |
|---|---|---|
| `invites` | `status` | `pending`, `accepted`, `expired`, `revoked` |
| `tenant_plan_subscriptions` | `status` | `active`, `cancelled`, `suspended` |
| `billing_events` | `kind` | known billing event types |
| `ledger_entries` | `account` | `cash`, `bank`, `inv`, `cust_money_debts`, `cust_cylinders_debts`, `company_money_debts`, `company_cylinders_debts`, `expense`, `cash_adjustments` |
| `ledger_entries` | `unit` | `money`, `count` |
| `ledger_entries` | `state` | `full`, `empty` (if sentinel approach from DB-T1c is used) |
| `expenses` | `paid_from` | `cash`, `bank` |

Note: `company_transactions.kind` and `expenses.kind` already have check constraints in the migration — verify the model code matches.

### 2f — `gas_type` enforcement across 6 tables
`systems`, `customer_transactions`, `inventory_adjustments`, `ledger_entries`, `price_catalog`, and implicitly `company_transactions` all store `gas_type` as a free string. `system_type_options` exists as the reference table.

Add a check constraint `gas_type IN ('12kg', '48kg')` to all six tables, or add a FK from each to `system_type_options.name`. If the valid gas types are expected to change over time, prefer the FK approach.

### 2g — Per-kind column constraints on `company_transactions`
Many columns on `company_transactions` are meaningless for certain kinds (e.g. a `payment_to_company` row should have `buy12 = 0`). Add check constraints per kind to prevent invalid combinations. At minimum:
- `payment_to_company` and `payment_from_company`: `buy12 = 0 AND buy48 = 0 AND return12 = 0 AND return48 = 0`
- `dist_return_empties`: `buy12 = 0 AND buy48 = 0`

**Files:**
- New Alembic migration
- `backend/app/models.py` (add `sa_column` with constraints where missing)

**Done when:** All uniqueness, FK, and check constraints are in place and verified; `company_transactions.kind` has no default; `pytest` passes.

---

## DB-T3 — Soft Delete and Audit Trail

**Preflight / anti-regression:**
- Apply the shared Database Ticket Implementation Guardrails before editing.
- Preserve existing tenant filters while adding soft-delete filters; never replace tenant isolation with soft-delete logic.
- Check every affected router for prior audit/soft-delete work before editing so existing behavior is extended, not overwritten.
- Do not reintroduce `init*` activity aliases or visible `system_init` behavior while changing delete/report queries.

**Goal:** Enable safe deletion of core entities and fill all missing audit trail columns. All changes are additive — no existing data or behavior is modified.

**Work:**

### 3a — Soft delete on core entities
Add `deleted_at` (datetime, nullable) and `deleted_by` (string, nullable) to:
- `customers`
- `users`
- `tenants`
- `systems` (currently only has `is_active` — add proper soft delete alongside it)

Update all router endpoints that currently hard-delete these records to set `deleted_at` instead. Update all queries that list these records to add `.where(Model.deleted_at == None)`.

### 3b — Missing audit columns
Add the following columns (all nullable, non-breaking):

| Table | Add columns |
|---|---|
| `customers` | `created_by` |
| `users` | `updated_by` |
| `tenants` | `created_by`, `updated_by` |
| `systems` | `created_by` |
| `price_catalog` | `created_by`, `updated_at`, `updated_by` |
| `expense_categories` | `updated_at`, `updated_by` |
| `system_type_options` | `updated_at`, `updated_by` |
| `system_settings` | `updated_at`, `updated_by` |
| `tenant_memberships` | `updated_at`, `updated_by` |
| `plan_entitlements` | `updated_at`, `updated_by` |
| `billing_events` | `updated_at`, `updated_by` |
| `tenant_plan_overrides` | `updated_at`, `updated_by` |
| `tenant_plan_subscriptions` | `cancelled_by` |

Populate `created_by` / `updated_by` from the authenticated user in each relevant router endpoint.

### 3c — Currency code on billing events
Add `currency_code: str` (default `DEFAULT_CURRENCY_CODE`) to `billing_events`. Amount values without a currency are ambiguous in multi-tenant deployments where tenants may use different currencies.

**Files:**
- `backend/app/models.py`
- All router files that create/delete `customers`, `users`, `tenants`, `systems`
- New Alembic migration

**Done when:** Deleting a customer/user/tenant soft-deletes the record; all list endpoints exclude soft-deleted records; all audit columns are populated on writes; `pytest` passes.

---

## DB-T4 — Tenant Isolation of Config Tables

**Preflight / anti-regression:**
- Apply the shared Database Ticket Implementation Guardrails before editing.
- Confirm whether DB-T1 already removed `DEFAULT_TENANT_ID` from ledger posting before adding tenant backfills elsewhere.
- Do not use `DEFAULT_TENANT_ID` as a new runtime fallback for tenant-owned rows; it is allowed only for explicit one-time backfills described by the ticket.
- When updating routers, preserve canonical activity `kind`/`event_type` behavior and explicit company-payment `kind` validation.

**Goal:** Ensure every tenant-owned piece of data belongs to a tenant. Currently prices, expense categories, system settings, sessions, and tenant-specific roles are shared globally or under-scoped.

**Work:**

### 4a — Add `tenant_id` to shared config tables
Add `tenant_id` (FK → `tenants.id`, non-nullable after backfill) to:
- `price_catalog` — prices are per-business
- `expense_categories` — categories are per-business
- `system_type_options` — gas types may differ per-business

Backfill existing rows with `DEFAULT_TENANT_ID`. Update all read/write endpoints to filter and write by `tenant_id`.

### 4b — Redesign `system_settings` from singleton to per-tenant
`system_settings` has `id = "system"` — a single global row. Replace with per-tenant rows: drop the singleton constraint, add `tenant_id` (FK → `tenants.id`, unique), and migrate the existing row.

### 4c — Add `tenant_id` to `sessions`
When a user belongs to multiple tenants, the session currently has no record of which tenant context it was created in. Add `tenant_id` (nullable FK → `tenants.id`) to `sessions` and populate it at login time.

### 4d — Add `tenant_id` to `roles`
Add nullable `tenant_id` (FK → `tenants.id`) to `roles`. `NULL` = system-wide role; a value = tenant-specific custom role. Existing system roles keep `tenant_id = NULL`. This unblocks custom per-tenant roles.

### 4e — Remove `users.tenant_id`
`users.tenant_id` and `tenant_memberships` both record which tenant a user belongs to — two sources of truth that can disagree. Remove `users.tenant_id`. Use only `tenant_memberships` as authoritative. This also eliminates the circular FK between `users` and `tenants` (which required `use_alter=True`).

**Protected:** `tenants.owner_user_id → users.id` is retained — the circular dependency only existed because of `users.tenant_id`. After 4e it is no longer circular.

### 4f — Cross-tenant FK validation
Composite same-tenant foreign keys are possible, but they require careful schema migration and compatible unique constraints. As the short-term guard, add service-layer assertions that verify `transaction.tenant_id == customer.tenant_id` (and equivalent for system, company) before any insert. Add integration tests that confirm Tenant A's data cannot appear in Tenant B's reports.

**Files:**
- `backend/app/models.py`
- `backend/app/routers/` (all routers that read/write affected tables)
- `backend/app/services/posting.py` (cross-tenant assertions)
- New Alembic migration

**Done when:** Every tenant-owned table has a `tenant_id`; config tables are scoped per tenant; sessions track tenant context; roles support custom tenant roles; `users.tenant_id` column is dropped; cross-tenant tests pass.

---

## DB-T5 — Performance and Structural Cleanup

**Precondition:** T8 and T9 of the activity kind refactoring must be complete before removing `customer_transactions.mode`.

**Preflight / anti-regression:**
- Apply the shared Database Ticket Implementation Guardrails before editing.
- Before removing `customer_transactions.mode`, run `rg "\.mode|mode\b|order_mode"` across backend, frontend, and tests; classify each remaining reference before deleting the column.
- Do not remove `company_transactions.kind` or `customer_transactions.kind`; they are canonical activity identity fields and remain required after T9.
- The `cash_adjustments` table rename must not rename `ledger_entries.source_type = "cash_adjust"` unless a dedicated ledger-source migration explicitly updates every writer and reader.
- If removing `group_id`, prove it is unused with `rg "group_id"` across routers, posting, reports, tests, scripts, and migrations.

**Goal:** Fix the timestamp race condition, add missing indexes, and clean up structural debt accumulated during development.

**Work:**

### 5a — Fix `allocate_happened_at()` race condition
`posting.py` lines 74–113: the function reads the latest `happened_at` in a one-second window then writes `latest + 1 microsecond`. Two concurrent requests in the same second both read the same value and both write the same timestamp. No constraint prevents the collision.

Fix: wrap the read-increment-write in a DB advisory lock (PostgreSQL `pg_advisory_xact_lock`) or replace with a per-tenant `(day, sequence)` counter on a new `activity_sequence` table.

### 5b — Add composite indexes for report queries
Add the following indexes:

```sql
-- All operational tables (customer_transactions, company_transactions,
-- expenses, inventory_adjustments, cash_adjustments):
CREATE INDEX ON <table> (tenant_id, day, deleted_at, happened_at);

-- Ledger queries:
CREATE INDEX ON ledger_entries (tenant_id, day, happened_at);
CREATE INDEX ON ledger_entries (tenant_id, source_type, source_id);
CREATE INDEX ON ledger_entries (tenant_id, account, customer_id, gas_type, happened_at);
```

### 5c — Protect `day` from drifting
`day` is derived from `happened_at` at write time. If `happened_at` is ever updated without recomputing `day`, the event appears on the wrong day. Enforce consistency via:
- Service-layer rule: any update to `happened_at` must recalculate and update `day`
- Tests asserting `day == derive_day(happened_at)` after every write

### 5d — Create `transaction_groups` parent table
Several operational tables have a `group_id` column that links related transactions (e.g. a refill with multiple components), but no parent table defines what a group is. Do section 5g first to determine which tables retain `group_id`. Then create:

```sql
CREATE TABLE transaction_groups (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  kind        TEXT NOT NULL,
  created_at  DATETIME NOT NULL,
  created_by  TEXT
);
```

Add FK from `group_id` to `transaction_groups.id` on all tables that **retain** the column after section 5g. Do not add the FK to tables where 5g removes `group_id`.

### 5e — Rename `cash_adjustments` table to `wallet_adjustments`
The canonical activity kind is `adjust_wallet`; the table is `cash_adjustments`. Rename the table. Update all references in models, routers, migrations, tests, and posting code.

Important separation:
- Rename the table/model to `wallet_adjustments` / `WalletAdjustment`.
- Update posting account names such as `ACCOUNT_CASH_ADJUST = "cash_adjustments"` to the new table/account terminology if that account is display/report-facing.
- Keep `ledger_entries.source_type = "cash_adjust"` as the stable legacy ledger source discriminator unless a dedicated ledger-source migration explicitly changes all source rows and lookups together. Do not accidentally rename it as part of the table rename.

Blast radius to include:
- Backend model, router, posting, and migration references.
- Backend tests that query `cash_adjustments` directly with SQL.
- `backend/scripts/clear_business_data.py`, which deletes from `cash_adjustments`.
- Any docs or fixture helpers that name the table directly.

### 5f — Remove `customer_transactions.mode`
After T8/T9 confirm no code reads `mode` from `customer_transactions`, drop the column. Run a grep across the codebase to confirm zero references before dropping.

### 5g — Review `group_id` on `cash_adjustments` and `expenses`
Both `cash_adjustments` and `expenses` have a `group_id` column. Verify whether any grouping behavior actually uses these columns (check all routers, posting code, and report queries). If no code reads or writes `group_id` on either table, drop the columns. Do not assume the column is unused — grep first.

**Files:**
- `backend/app/services/posting.py`
- `backend/app/models.py`
- `backend/app/routers/` (any router that updates `happened_at`)
- New Alembic migration

**Done when:** No timestamp collisions possible under concurrent load; report queries use composite indexes; `day` is always consistent with `happened_at`; `transaction_groups` table exists with FKs; `cash_adjustments` is renamed to `wallet_adjustments`; `mode` column is dropped.

---

## DB-T6 — FIFO Inventory Costing

**Precondition:** DB-T5 complete (stable schema). Activity kind refactoring T8/T9 complete (canonical kinds in place).

**Preflight / anti-regression:**
- Apply the shared Database Ticket Implementation Guardrails before editing.
- Verify DB-T5 structural changes first, especially table/model names and whether `customer_transactions.mode` has already been removed.
- Cost-layer logic must branch on canonical `kind` values (`refill`, `buy_full_from_company`, `replacement`, `sell_full`) and never on legacy aliases or display labels.
- Do not infer company inventory activity identity from quantities; use the stored canonical `CompanyTransaction.kind`.
- When touching posting, preserve DB-T1 tenant propagation and reversal linkage.

**Goal:** Record the actual purchase cost of each cylinder batch and use it to calculate real gross profit per sale. Currently the system has no concept of "what did this specific cylinder cost to buy" — profit reports use today's price from the catalog, which is wrong when prices have changed since the last refill.

**How it works:** Every refill creates a cost layer recording the price and quantity of that batch. Sales consume from the oldest layer first (FIFO). Each sale transaction records the weighted average cost of the cylinders it consumed. Gross profit = `total - (installed × buy_price_snapshot)`.

**Work:**

### 6a — Create `inventory_cost_layers` table
```sql
CREATE TABLE inventory_cost_layers (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id),
  gas_type           TEXT NOT NULL,
  buy_price          INTEGER NOT NULL,      -- per cylinder, minor currency units
  quantity_total     INTEGER NOT NULL,
  quantity_remaining INTEGER NOT NULL,      -- decreases as sales consume it
  acquired_at        DATETIME NOT NULL,     -- = refill happened_at
  source_id          TEXT NOT NULL REFERENCES company_transactions(id),
  created_at         DATETIME NOT NULL
);
CREATE INDEX ON inventory_cost_layers (tenant_id, gas_type, acquired_at)
  WHERE quantity_remaining > 0;
```

### 6b — Add `buy_price_snapshot` to `customer_transactions`
```sql
ALTER TABLE customer_transactions
  ADD COLUMN buy_price_snapshot INTEGER;  -- nullable, per-cylinder cost at time of sale
```

### 6c — Refill write path creates a cost layer
In `posting.py` `post_company_transaction()`, after the ledger entries are written, create an `InventoryCostLayer` row for each gas type purchased:
- `buy_price` = `price_catalog.buy_price` looked up at `txn.happened_at`
- `quantity_total` = `txn.buy12` (for 12kg layer) or `txn.buy48` (for 48kg layer)
- `quantity_remaining` = same as `quantity_total`
- One layer per gas type (separate rows for 12kg and 48kg if both bought)

### 6d — Sale write path consumes layers (FIFO)
In `posting.py`, for `replacement` and `sell_full` kinds:
1. Query `inventory_cost_layers` for this `tenant_id` and `gas_type`, ordered by `acquired_at ASC`, where `quantity_remaining > 0`
2. Consume from oldest layer first
3. If one sale spans two layers, calculate weighted average: `buy_price_snapshot = (qty_from_A × price_A + qty_from_B × price_B) / total_installed`
4. Reduce `quantity_remaining` on each consumed layer
5. Store `buy_price_snapshot` on the `CustomerTransaction`

### 6e — One-time backfill migration
Existing inventory (cylinders already in stock before this migration runs) has no cost layer. Create a migration that:
1. Reads current inventory snapshot (`full12`, `full48`) from ledger totals per tenant and gas type
2. Looks up the most recent `price_catalog.buy_price` for each gas type before migration date
3. Inserts a seed `InventoryCostLayer` row for each gas type with `quantity_remaining = current stock count` and `acquired_at = epoch` (so it is consumed before any real refill layers)

### 6f — Revenue report endpoint
Add or extend a report endpoint to return gross profit per day/period:
```
gross_profit = SUM(total - (installed × buy_price_snapshot))
```
Only include rows where `buy_price_snapshot IS NOT NULL` (i.e. sales after this migration).

**Files:**
- `backend/app/models.py` (`InventoryCostLayer` model, `buy_price_snapshot` on `CustomerTransaction`)
- `backend/app/services/posting.py`
- `backend/app/routers/reports.py` (or new revenue report router)
- New Alembic migrations (two: schema + backfill)

**Done when:** Every refill creates cost layers; every replacement/sell_full records `buy_price_snapshot`; gross profit is calculable per transaction; existing inventory is seeded; `pytest` covers FIFO spanning two layers and price-change scenarios.

---

## DB-T7 — Dedicated Bank Transfers Table

**Precondition:** DB-T5 complete (stable schema, `wallet_adjustments` rename done). Activity kind refactoring T2 complete (canonical bank event types in API).

**Preflight / anti-regression:**
- Apply the shared Database Ticket Implementation Guardrails before editing.
- Verify T8/T9 bank split state before touching bank-transfer display/report code: production reports must use `wallet_to_bank` and `bank_to_wallet`, not `bank_deposit`.
- Do not reintroduce `transfer_direction` or `bank_deposit` display compatibility shims removed by T9.
- Route direction from the stored bank-transfer `direction` column only; do not infer from labels, signs, or hero text.
- Moving deposits out of `expenses` must preserve expense reporting for real expenses and must not reintroduce `expenses.kind = "deposit"` as a runtime path after cleanup.

**Goal:** Bank transfers (currently stored as `expenses.kind="deposit"`) are moved to a dedicated `bank_transfers` table. After this ticket, `expenses` stores only real business expenses (fuel, insurance, food, etc.).

**Why separate from DB-T5:** This requires new posting paths, a data migration, updated reporting, and updated delete/reversal logic. It is 3× the scope of the structural cleanup in DB-T5a–5f and should not block that ticket.

**Work:**

### 7a — Create `bank_transfers` table
```sql
CREATE TABLE bank_transfers (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  direction      TEXT NOT NULL CHECK (direction IN ('wallet_to_bank', 'bank_to_wallet')),
  amount         INTEGER NOT NULL,
  note           TEXT,
  happened_at    DATETIME NOT NULL,
  day            TEXT NOT NULL,
  created_at     DATETIME NOT NULL,
  created_by     TEXT,
  updated_at     DATETIME,
  updated_by     TEXT,
  deleted_at     DATETIME,
  deleted_by     TEXT,
  reversal_of_id TEXT REFERENCES bank_transfers(id),
  request_id     TEXT,
  UNIQUE (tenant_id, request_id)
);
CREATE INDEX ON bank_transfers (tenant_id, day, deleted_at, happened_at);
```

### 7b — Migrate existing deposit rows
Write a one-time Alembic migration that copies all `expenses` rows where `kind="deposit"` into `bank_transfers`, deriving `direction` from `expenses.paid_from`: `"cash" → "wallet_to_bank"`, `"bank" → "bank_to_wallet"`. Do not infer direction from label text — `paid_from` is the authoritative DB column. After copying, soft-delete the source rows in `expenses` (set `deleted_at`).

### 7c — Update posting, reporting, and deletion paths
- `posting.py`: add `post_bank_transfer()` that writes to `bank_transfers` and posts ledger entries; remove the `kind="deposit"` path from `post_expense()`
- `reports.py`: read bank transfers from `bank_transfers`, not `expenses`, when building `wallet_to_bank` and `bank_to_wallet` events
- Deletion and reversal: update `reverse_source()` and delete endpoints to handle `bank_transfers`

### 7d — Schema cleanup after migration
After the data migration in 7b is complete and all deposit rows are in `bank_transfers`:
- Drop `expenses.kind` — after migration `expenses` contains only real expenses and the column is a constant; it is no longer needed.
- Decide whether `expenses.vendor` is needed for future vendor reporting. If no feature roadmap requires it, drop it during this cleanup. If vendor tracking is planned, keep it and add it to the audit columns in DB-T3.

### 7e — Tests
- Assert wallet-to-bank and bank-to-wallet transfers are stored in `bank_transfers`, not `expenses`
- Assert `expenses` table contains no rows with `kind="deposit"` after migration
- Assert reporting still produces correct `wallet_to_bank` and `bank_to_wallet` events from `bank_transfers`
- Assert `pytest` passes across all existing bank and expense tests

**Files:**
- `backend/app/models.py` (`BankTransfer` model; update `Expense` model to remove `kind` and optionally `vendor`)
- `backend/app/services/posting.py`
- `backend/app/routers/` (bank transfer create/delete/list endpoints)
- `backend/app/routers/reports.py`
- New Alembic migrations (two: schema + data migration)

**Done when:** All bank transfers live in `bank_transfers`; `expenses` has no `kind` column; `expenses.vendor` decision is made and acted on; posting, reporting, and deletion use the new table; `pytest` passes.
