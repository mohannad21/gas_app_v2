# Ticket: Fix Activity Card Pills — `collection_empty` Naming Collision

## Branch
Checkout from current branch:
```
git checkout fix/balance-wording
git checkout -b fix/activity-pills
```

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.

---

## Background

Activity cards are rendered in two contexts:

| Context | File | Company balance fields populated? |
|---|---|---|
| Daily report | `app/(tabs)/reports/index.tsx` | Yes — server returns all balance before/after fields |
| Add screen / Company tab | `app/(tabs)/add/index.tsx` | No — local adapters don't set company fields |
| Customer view | `app/customers/[id].tsx` | Customer fields only |

---

## Issue — `collection_empty` naming collision in `activityAdapter.ts`

`getCompanyInventoryEventType` in `activityAdapter.ts` returns `"collection_empty"` when a distributor returns empty cylinders back to the **supplier** (no buy, only return). But `"collection_empty"` is also the event_type produced when a **customer returns empties to the distributor**.

`transitionIntentForEvent` in `SlimActivityRow.tsx` maps `"collection_empty"` → `"customer_return"`. This means company return-to-supplier events get classified as customer-scoped — they show customer balance pills instead of company balance pills.

---

## Step 1 — Rename the company return event type in `activityAdapter.ts`

**File:** `frontend/lib/activityAdapter.ts`

Read the file first.

Find `getCompanyInventoryEventType` (around line 48):
```ts
  if (totalBuys === 0 && totalReturns > 0) return "collection_empty" as const;
```

Change to:
```ts
  if (totalBuys === 0 && totalReturns > 0) return "company_return_empties" as const;
```

Find `getCompanyInventoryEditTab` (around line 58):
```ts
  if (eventType === "collection_empty") return "return" as const;
```

Change to:
```ts
  if (eventType === "company_return_empties") return "return" as const;
```

**Do not change anything else in this file.**

---

## Step 2 — Register the new event type in `transitionIntentForEvent` in `SlimActivityRow.tsx`

**File:** `frontend/components/reports/SlimActivityRow.tsx`

Read the file first.

Find `transitionIntentForEvent` (around line 187). Locate the `collection_empty` line:
```ts
  if (event.event_type === "collection_empty") return "customer_return" as const;
```

Add a new line immediately after it:
```ts
  if (event.event_type === "collection_empty") return "customer_return" as const;
  if (event.event_type === "company_return_empties") return "company_settle" as const;
```

**Do not change anything else in this file.**

---

## Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Manual checks:

1. **Add screen → Company tab → find a refill that is "Return empties only"** (returned cylinders to supplier, no cylinders bought):
   - Card should still show correctly labeled as a company activity
   - Balance pills (if any) should show distributor scope, not customer scope

2. **No regression on customer "Return empties" cards** — customer return events still show customer balance pills

3. **No regression on Refill cards** — still show company scope pills
