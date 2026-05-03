# TICKET: Fix comment text wrapping in TOTAL/PAID FieldCell row

## Branch
Stay on the current branch.

## Problem

In `AddRefillModal`, the TOTAL and PAID cells sit side-by-side in a `flexDirection: "row"` container.
The PAID cell has a comment like:

```
Wallet 497.45 -> 0.00
```

After the money-formatting fix that added decimal places, this string is longer than before
("Wallet 497 -> 0" was shorter). The `fieldCellComment` Text has no `numberOfLines` limit,
so it wraps to a second line, making the PAID cell taller than the TOTAL cell and breaking
the visual alignment of the pair.

## Root Cause

`FieldPair.tsx` renders the comment Text at line 174 with no line-limit:

```tsx
{comment ? <Text style={styles.fieldCellComment}>{comment}</Text> : null}
```

`fieldCellComment` style does not clamp lines, so any comment longer than the cell width wraps.

## File to Change

**Only one file:** `frontend/components/entry/FieldPair.tsx`

## Implementation

Add `numberOfLines={1}` to the comment `<Text>` element at line 174:

```tsx
{comment ? (
  <Text style={styles.fieldCellComment} numberOfLines={1}>
    {comment}
  </Text>
) : null}
```

No other changes needed.

## Verification

Run the frontend build:

```bash
cd frontend && npm run build
```

Then open the Add Refill modal with a non-zero wallet balance and a non-zero total cost.

**Expected after fix:**
- The TOTAL and PAID cells are the same height
- The wallet comment in the PAID cell shows on a single line, truncated with "…" if it
  doesn't fit — no second line wrapping
- Overall row alignment is clean

**What was wrong before:**
- The PAID cell comment wrapped to 2 lines, pushing its content down and making the
  PAID cell taller than the TOTAL cell
