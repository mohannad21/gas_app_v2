# Ticket: Cache Invalidation Fixes — Adjustment and Buy-Full

## Branch
Stay on the current branch — do NOT create a new branch.

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.

---

## Background

Three cache invalidation gaps cause newly created cards to not appear immediately
in the correct lists without a manual navigate-away-and-back.

1. After saving a **Buy Full From Company**, the Add → Company Activities list does not
   refresh because `useCreateCompanyBuyIron` does not invalidate `["inventory", "refills"]`,
   which is the query key used by the company activities list in the Add screen.

2. After saving a **Customer Balance Adjustment** (including the opening balance when creating
   a new customer), the adjustment card does not appear immediately in:
   - Customer Details → Activities (fed by `["customers", "adjustments", customerId]`)
   - Add → Customer Activities (fed by `["customers", "adjustments", "all", ...]`)

   Because `useCreateCustomerAdjustment` does not invalidate either of those query keys.

---

## Step 1 — Fix `useCreateCompanyBuyIron` missing refills invalidation

**File:** `frontend/hooks/useInventory.ts`

Read the file first.

Find `useCreateCompanyBuyIron`. Its `onSuccess` currently looks like this:

```ts
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "snapshot"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
```

Add `["inventory", "refills"]` so the Add screen company list refreshes immediately:

```ts
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "snapshot"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
```

**Do not change anything else in this file.**

---

## Step 2 — Fix `useCreateCustomerAdjustment` missing adjustment query invalidations

**File:** `frontend/hooks/useCustomers.ts`

Read the file first.

Find `useCreateCustomerAdjustment`. Its `onSuccess` currently looks like this:

```ts
    onSuccess: (_, variables) => {
      if (showSuccessToast) {
        showToast("Adjustment added");
      }
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: customerBalanceQueryKey(variables.customer_id) });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"] });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"] });
    },
```

Add the two missing adjustment query keys:

```ts
    onSuccess: (_, variables) => {
      if (showSuccessToast) {
        showToast("Adjustment added");
      }
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: customerBalanceQueryKey(variables.customer_id) });
      queryClient.invalidateQueries({ queryKey: ["customers", "adjustments", variables.customer_id] });
      queryClient.invalidateQueries({ queryKey: ["customers", "adjustments", "all"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"] });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"] });
    },
```

**Do not change anything else in this file.**

---

## Verification

### Frontend
```bash
cd frontend && npm run build
```
Expected: 0 TypeScript errors.

### Manual checks

1. **Buy Full refresh** — Save a Buy Full From Company. Switch to Add → Company Activities.
   The new Buy Full card appears immediately without navigating away.

2. **Adjustment refresh in Customer Details** — Open a customer, save a Balance Adjustment.
   The new Adjustment card appears immediately in the customer's Activities list.

3. **Adjustment refresh in Add screen** — Save a Balance Adjustment for any customer.
   Switch to Add → Customer Activities. The new Adjustment card appears immediately.

4. **Opening balance refresh** — Create a new customer with a non-zero opening balance.
   Navigate to that customer's Details page. The opening Adjustment card appears immediately.
