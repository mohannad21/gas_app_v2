# Ticket: Fix company payment header amount

## Branch
Stay on the current branch — do NOT create a new branch.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **No improvisation.** If anything is unclear, stop and ask.
- No logic changes beyond what is described. Do not touch unrelated code.
- Run the verification command at the end and confirm it passes.

---

## Background

On the day report, `company_payment` cards show the wrong amount in the top-right corner
(e.g. "-2 $" instead of "-150 ₪"). The correct amount (150) is already shown in the card body.

**Root cause:** `moneyAmount` is computed from `event.money_delta` when it is a number. For
`company_payment` events, `money_delta` is a small ledger balance delta (e.g. -2), not the
payment amount. The actual payment amount is in `event.money_amount` (150).

The `showPaymentRatio` path (which uses `paymentAmount` and `paymentTotal` correctly) is not
reached for `company_payment` because `paymentTotal = Number(event.total_cost ?? 0) = 0` —
company payment events do not carry `total_cost`. So the card falls through to `moneyText`
which uses the wrong `moneyAmount`.

---

## Fix — One change in one file

**File:** `frontend/components/reports/SlimActivityRow.tsx`

Read the file first.

Find `moneyAmount` (around line 272):

```ts
  const moneyAmount =
    (event.event_type === "collection_money" || event.event_type === "collection_payout")
      ? Number(event.money_amount ?? event.money_delta ?? 0)
      : typeof event?.money_delta === "number"
        ? event.money_delta
        : Number(event?.money_amount ?? 0);
```

Replace with:

```ts
  const moneyAmount =
    (event.event_type === "collection_money" || event.event_type === "collection_payout")
      ? Number(event.money_amount ?? event.money_delta ?? 0)
      : event.event_type === "company_payment"
        ? Number(event.money_amount ?? event.money?.amount ?? 0)
        : typeof event?.money_delta === "number"
          ? event.money_delta
          : Number(event?.money_amount ?? 0);
```

**Do not change anything else in this file.**

---

## Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Manual check:
1. Open the day report — "Paid company" and "Payment from company" cards should show the
   correct payment amount (e.g. "-150 ₪") in the top-right corner, not a small delta value.
