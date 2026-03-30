# Codex Ticket — Fix T2/T5/T6 Issues

**Branch:** Create `fix/delete-pagination-expense-edit` from `main` — do NOT work on main

**DO NOT IMPROVISE.** Follow this ticket exactly. Only modify the files and lines specified below.

---

## Issue Summary

Three issues need fixing:

1. **T2**: Delete blur disappears instantly instead of keeping item visible with "Deleted" label
2. **T6**: Refills pagination not working (showing >50 items instead of capped at 50)
3. **T5**: Expense list missing edit button

---

## Fix 1: T2 — Remove explicit refetch() calls that cause blur to disappear

**File:** `frontend/app/(tabs)/add/index.tsx`

**Problem:** After delete, `refetch()` is called immediately, removing the item from list before the blur+label can be seen. The item disappears in <1 second instead of staying visible.

**Solution:** Remove all explicit `.refetch()` calls. The mutation hooks already have `onSuccess` handlers that invalidate queries — just let React Query handle it naturally.

### Change 1a: Remove refetch from handleRemoveRefill

**Find:** Lines 809-829
```typescript
const handleRemoveRefill = (refillId: string) => {
  Alert.alert("Remove refill?", "This will delete the refill entry.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(refillId);
        try {
          await deleteRefill.mutateAsync(refillId);
          await companyRefillsQuery.refetch();  // ← DELETE THIS LINE
        } catch (error) {
          console.error("[add] delete refill failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(refillId);
        }
      },
    },
  ]);
};
```

**Replace with:**
```typescript
const handleRemoveRefill = (refillId: string) => {
  Alert.alert("Remove refill?", "This will delete the refill entry.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(refillId);
        try {
          await deleteRefill.mutateAsync(refillId);
        } catch (error) {
          console.error("[add] delete refill failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(refillId);
        }
      },
    },
  ]);
};
```

**What changed:** Removed line `await companyRefillsQuery.refetch();`

---

### Change 1b: Remove refetch from handleDeleteInventoryAdjustment

**Find:** Lines 825-842
```typescript
const handleDeleteInventoryAdjustment = (entry: InventoryAdjustment) => {
  Alert.alert("Remove adjustment?", "This will delete the adjustment entry.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(entry.id);
        try {
          await deleteInventoryAdjust.mutateAsync(entry.id);
          await allInventoryAdjustmentsQuery.refetch();  // ← DELETE THIS LINE
        } catch (error) {
          console.error("[add] delete inventory adjustment failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(entry.id);
        }
      },
    },
  ]);
};
```

**Replace with:**
```typescript
const handleDeleteInventoryAdjustment = (entry: InventoryAdjustment) => {
  Alert.alert("Remove adjustment?", "This will delete the adjustment entry.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(entry.id);
        try {
          await deleteInventoryAdjust.mutateAsync(entry.id);
        } catch (error) {
          console.error("[add] delete inventory adjustment failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(entry.id);
        }
      },
    },
  ]);
};
```

**What changed:** Removed line `await allInventoryAdjustmentsQuery.refetch();`

---

### Change 1c: Remove refetch from handleDeleteCashAdjustment

**Find:** Lines 844-861
```typescript
const handleDeleteCashAdjustment = (entry: CashAdjustment) => {
  Alert.alert("Remove adjustment?", "This will delete the wallet adjustment.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(entry.id);
        try {
          await deleteCashAdjust.mutateAsync(entry.id);
          allCashAdjustmentsQuery.refetch();  // ← DELETE THIS LINE
        } catch (error) {
          console.error("[add] delete cash adjustment failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(entry.id);
        }
      },
    },
  ]);
};
```

**Replace with:**
```typescript
const handleDeleteCashAdjustment = (entry: CashAdjustment) => {
  Alert.alert("Remove adjustment?", "This will delete the wallet adjustment.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(entry.id);
        try {
          await deleteCashAdjust.mutateAsync(entry.id);
        } catch (error) {
          console.error("[add] delete cash adjustment failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(entry.id);
        }
      },
    },
  ]);
};
```

**What changed:** Removed line `allCashAdjustmentsQuery.refetch();`

---

### Change 1d: Remove refetch from handleDeleteExpense

**Find:** Lines 875-895
```typescript
const handleDeleteExpense = (entry: Expense) => {
  Alert.alert("Remove expense?", "This will delete the expense entry.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(entry.id);
        try {
          await deleteExpense.mutateAsync({ id: entry.id, date: entry.date });
          expensesQuery.refetch();  // ← DELETE THIS LINE
        } catch (error) {
          console.error("[add] delete expense failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(entry.id);
        }
      },
    },
  ]);
};
```

**Replace with:**
```typescript
const handleDeleteExpense = (entry: Expense) => {
  Alert.alert("Remove expense?", "This will delete the expense entry.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(entry.id);
        try {
          await deleteExpense.mutateAsync({ id: entry.id, date: entry.date });
        } catch (error) {
          console.error("[add] delete expense failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(entry.id);
        }
      },
    },
  ]);
};
```

**What changed:** Removed line `expensesQuery.refetch();`

---

### Change 1e: Remove refetch from handleDeleteBankTransfer

**Find:** Lines 897-919
```typescript
const handleDeleteBankTransfer = (entry: BankDeposit) => {
  const date = (entry.happened_at ?? "").slice(0, 10) || todayDate;
  Alert.alert("Remove transfer?", "This will delete the wallet/bank transfer entry.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(entry.id);
        try {
          await deleteBankDeposit.mutateAsync({ id: entry.id, date });
          bankDepositsQuery.refetch();  // ← DELETE THIS LINE
        } catch (error) {
          console.error("[add] delete bank transfer failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(entry.id);
        }
      },
    },
  ]);
};
```

**Replace with:**
```typescript
const handleDeleteBankTransfer = (entry: BankDeposit) => {
  const date = (entry.happened_at ?? "").slice(0, 10) || todayDate;
  Alert.alert("Remove transfer?", "This will delete the wallet/bank transfer entry.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        markDeleting(entry.id);
        try {
          await deleteBankDeposit.mutateAsync({ id: entry.id, date });
        } catch (error) {
          console.error("[add] delete bank transfer failed", error);
          Alert.alert("Failed to delete", "Try again later.");
        } finally {
          unmarkDeleting(entry.id);
        }
      },
    },
  ]);
};
```

**What changed:** Removed line `bankDepositsQuery.refetch();`

---

### Change 1f: Remove refetch from customer view handlers

**File:** `frontend/app/customers/[id].tsx`

**Find:** Lines 509-521
```typescript
const handleDeleteOrder = (orderId: string) => {
  Alert.alert("Delete order?", "This will reverse the order and update related balances.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: () => {
        markDeleting(orderId);
        deleteOrder.mutate(orderId, { onSettled: () => unmarkDeleting(orderId) });
      },
    },
  ]);
};

const handleDeleteCollection = (collectionId: string) => {
  Alert.alert("Delete collection?", "This will remove the collection and update related balances.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: () => {
        markDeleting(collectionId);
        deleteCollection.mutate(collectionId, { onSettled: () => unmarkDeleting(collectionId) });
      },
    },
  ]);
};
```

**✓ These are already correct** — they use `.mutate()` with `onSettled` instead of `.mutateAsync()` + `refetch()`. **DO NOT change these.**

---

## Fix 2: T6 — Add limit param to API functions for pagination

**File:** `frontend/lib/api.ts`

**Problem:** When calling paginated endpoints, the frontend doesn't pass the `limit` param, so the backend caps at 50 but the default is sent. Need explicit limit to ensure pagination works.

### Change 2a: Update listInventoryRefills

**Find:** Lines 761-769
```typescript
export async function listInventoryRefills(includeDeleted?: boolean): Promise<InventoryRefillSummary[]> {
  const { data } = await api.get("/inventory/refills", {
    params: { include_deleted: includeDeleted ?? false },
  });
  return parseArray(InventoryRefillSummarySchema, data).map((row) => ({
    ...row,
    debt_cash: row.debt_cash != null ? fromMinorUnits(row.debt_cash) : row.debt_cash,
  }));
}
```

**Replace with:**
```typescript
export async function listInventoryRefills(includeDeleted?: boolean): Promise<InventoryRefillSummary[]> {
  const { data } = await api.get("/inventory/refills", {
    params: { include_deleted: includeDeleted ?? false, limit: 50 },
  });
  return parseArray(InventoryRefillSummarySchema, data).map((row) => ({
    ...row,
    debt_cash: row.debt_cash != null ? fromMinorUnits(row.debt_cash) : row.debt_cash,
  }));
}
```

**What changed:** Added `limit: 50` to params object

---

### Change 2b: Update listOrders

**Find:** Look for `export async function listOrders(` in api.ts

**Add** `limit: 50` to the params if not present.

---

### Change 2c: Update listCollections

**Find:** Look for `export async function listCollections(` in api.ts

**Add** `limit: 50` to the params if not present.

---

### Change 2d: Update listExpenses

**Find:** Look for `export async function listExpenses(` in api.ts

**Add** `limit: 50` to the params if not present.

---

### Change 2e: Update listCashAdjustments

**Find:** Look for `export async function listCashAdjustments(` in api.ts

**Add** `limit: 50` to the params if not present.

---

### Change 2f: Update listBankDeposits

**Find:** Look for `export async function listBankDeposits(` in api.ts

**Add** `limit: 50` to the params if not present.

---

### Change 2g: Update listInventoryAdjustments

**Find:** Look for `export async function listInventoryAdjustments(` in api.ts

**Add** `limit: 50` to the params if not present.

---

### Change 2h: Update listCompanyPayments

**Find:** Look for `export async function listCompanyPayments(` in api.ts

**Add** `limit: 50` to the params if not present.

---

## Fix 3: T5 — Add onEdit handler to expense SlimActivityRow

**File:** `frontend/app/(tabs)/add/index.tsx`

**Problem:** Expense list shows delete button but no edit button. Need to add `onEdit` handler.

### Change 3: Add onEdit to expense renderItem

**Find:** Lines 1149-1156 (expense renderItem)
```typescript
return (
  <SlimActivityRow
    event={expenseToEvent(item.data)}
    formatMoney={fmtMoney}
    isDeleted={deletingIds.has(item.data.id)}
    onDelete={() => handleDeleteExpense(item.data)}
  />
);
```

**Replace with:**
```typescript
return (
  <SlimActivityRow
    event={expenseToEvent(item.data)}
    formatMoney={fmtMoney}
    isDeleted={deletingIds.has(item.data.id)}
    onEdit={() =>
      router.push({
        pathname: "/expenses/new",
        params: { expenseId: item.data.id },
      })
    }
    onDelete={() => handleDeleteExpense(item.data)}
  />
);
```

**What changed:** Added `onEdit` prop that routes to `/expenses/new` with `expenseId` param

---

## Verification Checklist

After all changes:

1. ✓ File `frontend/app/(tabs)/add/index.tsx` — 5 refetch() calls removed
2. ✓ File `frontend/app/customers/[id].tsx` — No changes needed (already correct)
3. ✓ File `frontend/lib/api.ts` — limit: 50 added to all 8 list functions
4. ✓ File `frontend/app/(tabs)/add/index.tsx` — onEdit handler added to expenses

## Testing After Changes

**Test T2 blur fix:**
- Add Entry → any section → delete item → confirm
- Card should stay visible with "Deleted" label in red
- Edit/Delete buttons should be greyed out
- Wait 2-3 seconds, card disappears

**Test T6 pagination:**
- Create >50 refills
- Open Add Entry → Company activities
- Should show ~50 refills max (not all)

**Test T5 edit button:**
- Open Add Entry → Expenses section
- Each expense should have Edit and Delete buttons
- Tap Edit → should open edit form with pre-filled data

---

## Files to NOT touch

- ❌ Any file in `backend/` — this is frontend-only
- ❌ Any file in `tests/` — no test changes needed
- ❌ `frontend/app/(tabs)/reports/index.tsx` — already fixed
- ❌ `frontend/components/` — nothing to change here
- ❌ `frontend/hooks/` — nothing to change here
- ❌ `frontend/types/` — nothing to change here

---

## Branch and Commit

**Create branch:**
```bash
git checkout main
git pull
git checkout -b fix/delete-pagination-expense-edit
```

**Commit when done:**
```bash
git add frontend/app/(tabs)/add/index.tsx frontend/app/customers/[id].tsx frontend/lib/api.ts
git commit -m "fix: T2/T5/T6 delete blur timing, pagination limit, expense edit button

T2: Remove explicit refetch() calls from delete handlers so blur+deleted
label stays visible. Let mutation onSuccess handle query invalidation.

T6: Add explicit limit: 50 param to all list API functions to ensure
pagination cap is enforced on initial load.

T5: Add onEdit handler to expense SlimActivityRow to route to edit form.

Co-Authored-By: Codex <noreply@anthropic.com>"
```

---

## Questions?

If anything is unclear:
- Stop and ask
- Do NOT improvise
- Do NOT change other files
- Do NOT refactor existing code

This is a surgical fix only.
