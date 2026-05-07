# Ticket 6 — UI Bug Fixes from Live Ledger Testing

## Branch
Continue on `feat/live-ledger-display`.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **Do not improvise.** If anything is unclear or not covered by this ticket, stop and ask.
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.
- Run `cd backend && pytest tests/` at the end and confirm all tests pass.

---

## Issues to Fix

Three bugs found during UI testing of the live ledger display branch.

---

## Fix 1 — Zod `.optional()` → `.nullish()` for all `live_debt_*` fields

**Status**: Already applied in the working branch. Verify it is in place before moving on.

**Root cause**: The backend returns `null` (not absent) for `live_debt_*` fields when no ledger boundary exists. Zod `.optional()` accepts `undefined` but rejects `null`, causing a parse error logged to console on every card load.

**Files to verify (read each one)**:
- `frontend/types/customer.ts` — `CustomerAdjustmentSchema`
- `frontend/types/order.ts` — `CollectionEventSchema`
- `frontend/types/inventory.ts` — `InventoryRefillSummarySchema`
- `frontend/types/transaction.ts` — `CompanyPaymentSchema`

**Expected state** — all 10 `live_debt_*` fields must use `.nullish()`:
```ts
live_debt_cash: z.number().nullish(),
live_debt_cylinders_12: z.number().nullish(),
live_debt_cylinders_48: z.number().nullish(),
```

If any still have `.optional()`, change them to `.nullish()`. Do not change anything else in these files.

---

## Fix 2 — Buy Full From Company card shows garbled float numbers

**Symptom**: When a buy_iron card is expanded, the inventory/wallet transition pills show garbled values such as `-266.549999` and `9999997` instead of clean integers.

**Investigation steps**:

1. Read `frontend/lib/activityAdapter.ts` — find `refillSummaryToEvent`. Look at how the wallet pill and inventory pills are computed for buy_iron rows.
2. Read `frontend/components/DailyReportCard.tsx` (or whichever component renders the inventory transition pills) — find where the pill values come from and how they are formatted.
3. Identify which field or calculation produces the float (`266.549999...`) and the large integer (`9999997`).

**Likely causes** (investigate before fixing):
- A cost or price field stored as float being displayed without `Math.round()` or `.toFixed(0)`
- A sentinel/default inventory value (e.g. `9999999`) being used in a before→after transition when no real prior snapshot exists

**Fix**: Once the root cause is identified, apply the minimal fix:
- If it is a float formatting issue: wrap the value in `Math.round()` before using it in the pill, or use `.toFixed(0)` in the display formatter — whichever matches the existing pattern in the file.
- If it is a sentinel value leaking into display: guard the pill so it is not rendered when the "before" value is a sentinel (e.g. `>= 9999990` or `=== null`).

Do not change any other pills or any business logic.

---

## Fix 3 — Add delete to company payment cards

**Symptom**: Company payment cards in the company activity list have no edit or delete action. This blocks history-change testing (cannot delete a payment to verify live fields on other cards update).

### 3a. Backend — add DELETE endpoint

**File:** `backend/app/routers/company.py`

Read the file first. Find the existing pattern for soft-delete in this codebase (look at how other routers implement DELETE — e.g. `collections.py` or `inventory.py`). Follow the same pattern exactly.

Add a DELETE endpoint:

```
DELETE /company/payments/{payment_id}
```

- Soft-delete only: set `deleted_at = datetime.now(timezone.utc)` on the row. Do not hard-delete.
- If the row does not exist or is already deleted, return 404.
- Return 204 No Content on success.
- The existing `GET /company/payments` already filters out deleted rows (verify this is the case; if not, add the filter).

**Do not change any other endpoint in this file.**

### 3b. Frontend — wire up delete on company payment cards

Read the relevant component file before modifying. Find where company payment cards are rendered in the company activity or reports view.

- Add a delete action (follow the exact same UI pattern used for deleting collections or inventory refills in the same screen — swipe-to-delete, long-press menu, or trash icon, whichever pattern already exists).
- On confirm, call `DELETE /company/payments/{id}`.
- On success, invalidate `["company", "balances"]` and any report queries that include company payments (follow the invalidation rules in `CLAUDE.md`).
- Do not add an edit action — only delete is in scope for this ticket.

---

## Verification

### Frontend build
```bash
cd frontend && npm run build
```
Expected: 0 TypeScript errors.

### Backend tests
```bash
cd backend && pytest tests/ -v
```
Expected: all existing tests pass.

### Manual checks
1. Open a company payment card — **no console error** about `live_debt_cash` invalid type.
2. Open a buy_iron card — wallet and inventory pills show **clean integers**, no floats or `9999997`.
3. On the company activity list, a company payment card now has a **delete action**. Tap it, confirm deletion — card disappears and balances update.
