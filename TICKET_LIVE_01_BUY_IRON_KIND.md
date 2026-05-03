# Ticket 1 — Company buy_iron: add explicit `kind` field and fix frontend classification

## Branch
Stay on `feat/live-ledger-display` (create it from main if it does not exist yet).
```bash
git checkout main
git checkout -b feat/live-ledger-display
```

---

## Rules — Read These First

- **Read every file before modifying it.**
- **Do not improvise.** If anything is unclear or not covered by this ticket, stop and ask.
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.

---

## Background

The frontend currently infers whether a company inventory row is a `buy_iron` or a real `refill` by inspecting quantities:

```ts
// activityAdapter.ts — getCompanyInventoryEventType
if (totalBuys > 0 && totalReturns === 0) return "company_buy_iron";
if (totalBuys === 0 && totalReturns > 0) return "company_return_empties";
return "refill";
```

This is fragile. A real refill where the driver only delivers full cylinders and takes no empties (`buy12 > 0, return12 = 0`) would be misidentified as `company_buy_iron`.

The consequence, after Ticket 4 hides cylinder pills for `company_buy_iron`, is that a real refill that looks like a buy would have its company cylinder debt transition silently hidden — showing wrong information.

**Fix**: The backend already stores the `kind` column on `CompanyTransaction` rows (`"refill"` or `"buy_iron"`). Expose it in `InventoryRefillSummary`, and use that authoritative value in the frontend instead of quantity guessing.

---

## Step 1 — Add `kind` to `InventoryRefillSummary` schema

**File:** `backend/app/schemas/inventory.py`

Read the file first.

Find `class InventoryRefillSummary(SQLModel)`. Add one field after `deleted_at`:

```python
class InventoryRefillSummary(SQLModel):
  refill_id: str
  date: str
  time_of_day: Optional[Literal["morning", "evening"]] = None
  effective_at: datetime
  buy12: int
  return12: int
  buy48: int
  return48: int
  new12: int = 0
  new48: int = 0
  debt_cash: int = 0
  debt_cylinders_12: int = 0
  debt_cylinders_48: int = 0
  is_deleted: bool = False
  deleted_at: Optional[datetime] = None
  kind: str = "refill"
```

**Do not change anything else in this file.**

---

## Step 2 — Populate `kind` in `list_refills`

**File:** `backend/app/routers/inventory.py`

Read the file first.

Find the `list_refills` function. In the list comprehension (or loop) that builds `InventoryRefillSummary` objects, add `kind=row.kind` to each constructed object:

Current construction includes fields like `refill_id=row.id`, `debt_cash=row.debt_cash`, etc.
Add `kind=row.kind` alongside those existing fields.

**Do not change anything else in this file.**

---

## Step 3 — Add `kind` to frontend `InventoryRefillSummarySchema`

**File:** `frontend/types/inventory.ts`

Read the file first.

Find `InventoryRefillSummarySchema`. Add one optional field at the end of the `.object({...})` block, before the closing `}`:

```ts
    kind: z.string().optional(),
```

**Do not change anything else in this file.**

---

## Step 4 — Use backend `kind` in `getCompanyInventoryEventType`

**File:** `frontend/lib/activityAdapter.ts`

Read the file first.

Find `getCompanyInventoryEventType`. Current code:

```ts
export function getCompanyInventoryEventType(refill: InventoryRefillSummary) {
  const totals = getCompanyInventoryTotals(refill);
  const totalBuys = totals.buy12 + totals.buy48;
  const totalReturns = totals.return12 + totals.return48;

  if (totalBuys > 0 && totalReturns === 0) return "company_buy_iron" as const;
  if (totalBuys === 0 && totalReturns > 0) return "company_return_empties" as const;
  return "refill" as const;
}
```

Replace with:

```ts
export function getCompanyInventoryEventType(refill: InventoryRefillSummary) {
  if (refill.kind === "buy_iron") return "company_buy_iron" as const;
  const totals = getCompanyInventoryTotals(refill);
  const totalReturns = totals.return12 + totals.return48;
  if (totalReturns > 0 && totals.buy12 + totals.buy48 === 0) return "company_return_empties" as const;
  return "refill" as const;
}
```

**Logic explanation:**
- If the backend says `kind="buy_iron"`, always return `"company_buy_iron"` — no quantity guessing.
- If `kind` is missing (old API responses) or not `"buy_iron"`, fall back to quantity-based detection but only for `"company_return_empties"` (returns only, no buys). Everything else is `"refill"`.

**Do not change anything else in this file.**

---

## Verification

### Frontend build
```bash
cd frontend && npm run build
```
Expected: 0 TypeScript errors.

### Manual check
1. Open Add → Company Activities. Existing buy-full cards should still be labeled "Buy full".
2. Existing refill cards should still be labeled "Refill".
3. No visual change yet — the actual pill fix comes in Ticket 4.
