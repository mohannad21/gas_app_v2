# TICKET: Fix raw floating-point number in DeltaBox delta badge

## Branch
Stay on the current branch.

## Problem

When a row in the daily report is expanded, the `EventExpandedPanel` shows `DeltaBox`
cards with a coloured badge showing the change. For money (Wallet) boxes, this badge
currently shows the raw float:

```
-497.4500000000007
```

instead of the formatted decimal:

```
-497.45
```

## Root Cause

`DeltaBox` (defined at line 1249 in `frontend/app/(tabs)/reports/index.tsx`) computes:

```typescript
const delta = (after ?? 0) - (before ?? 0);
```

and renders the badge as:

```tsx
{isNoChange ? "No change" : formatSigned(delta)}
```

`formatSigned` (from `frontend/lib/reports/utils.ts` line 497) is:

```typescript
export function formatSigned(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}`;           // ← bare template literal, no formatting
}
```

`${n}` uses JavaScript's default number-to-string, which exposes floating-point
arithmetic noise (e.g., `497.45 - 0` → `497.4500000000007`).

`DeltaBox` already receives a `format` function prop that is used to format the
`before` and `after` values. That same `format` must be applied to the delta badge.

## File to Change

**Only one file:** `frontend/app/(tabs)/reports/index.tsx`

## Implementation

In `DeltaBox`, replace the badge text at line 1303:

**Before:**
```tsx
{isNoChange ? "No change" : formatSigned(delta)}
```

**After:**
```tsx
{isNoChange
  ? "No change"
  : `${delta >= 0 ? "+" : "-"}${format(Math.abs(delta))}`}
```

This uses the same `format` prop that renders the before/after values:
- For money boxes (`format = formatMoney`): `"-497.45"` ✓
- For count boxes (`format = formatCount`): `"-3"` ✓ (no behaviour change)

Do **not** change `formatSigned` in `utils.ts` — it may be used elsewhere.

## Verification

Run the frontend build:

```bash
cd frontend && npm run build
```

Then open the daily report, tap a refill or company-payment row to expand it, and look
at the wallet delta badge.

**Expected after fix:**
- Wallet delta badge shows `-497.45` (or whatever the actual change is, properly rounded)
- No raw floating-point notation (no `497.4500000000007`)
- Count (cylinder) delta badges are unchanged — they continue to show whole numbers

**What was wrong before:**
- Money delta in the expanded badge showed the raw JavaScript float string from
  arithmetic subtraction
