# Ticket: Consolidate Duplicate Screens & Fix Navigation

## Branch
Create a new branch from `main`:
```
git checkout main
git pull
git checkout -b fix/consolidate-screens
```

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.
- **Do not add features** not listed here.
- **Do not touch any backend files.** All changes are frontend only.
- **Do not modify any screen's styling, form fields, or submit logic.**
- The only things you are allowed to change are: route strings in `router.push(...)`, imports at the top of a file, the expense type list derivation in one file, and file deletions of the two specified dead screens.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors before declaring done.

---

## Step 1 — Fix "Manage system types" navigation (3 files)

These 3 files have a `router.push("/system-types")` that points to a dead standalone screen. Change each one to point to the correct configuration screen.

**Do not change anything else in these files.**

### `frontend/app/customers/new.tsx` — line 426
```tsx
// BEFORE
<Pressable onPress={() => router.push("/system-types")} style={styles.linkBtn}>

// AFTER
<Pressable onPress={() => router.push("/(tabs)/account/configuration/system-types")} style={styles.linkBtn}>
```

### `frontend/app/systems/new.tsx` — line 113
```tsx
// BEFORE
<Pressable onPress={() => router.push("/system-types")} style={styles.linkBtn}>

// AFTER
<Pressable onPress={() => router.push("/(tabs)/account/configuration/system-types")} style={styles.linkBtn}>
```

### `frontend/app/systems/[id].tsx` — line 139
```tsx
// BEFORE
<Pressable onPress={() => router.push("/system-types")} style={styles.linkBtn}>

// AFTER
<Pressable onPress={() => router.push("/(tabs)/account/configuration/system-types")} style={styles.linkBtn}>
```

---

## Step 2 — Replace hardcoded expense types with dynamic categories

**File:** `frontend/app/expenses/new.tsx`

### 2a — Add import

Read the file first. Find the existing imports at the top. Add this import after the existing hook imports:

```tsx
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
```

### 2b — Replace hardcoded list

Find this line (around line 182):
```tsx
const expenseTypes = ["fuel", "food", "insurance", "car", "other"];
```

Replace it with:
```tsx
const { data: expenseCategoryData } = useExpenseCategories();
const expenseTypes =
  expenseCategoryData && expenseCategoryData.length > 0
    ? expenseCategoryData.filter((c) => c.is_active).map((c) => c.name)
    : ["fuel", "food", "insurance", "car", "other"];
```

This keeps the hardcoded list as a fallback if no categories exist in the DB yet (e.g. first-time setup), and uses dynamic categories once the distributor has configured them.

**Do not change anything else in this file** — the `expenseTypes` variable is already passed correctly to the component below it. No other changes needed.

---

## Step 3 — Activate "Set price" button in AddRefillModal

**File:** `frontend/components/AddRefillModal.tsx`

There are **two** `onPress` handlers with a TODO comment about navigating to price config. Both look like this:

```tsx
onPress={() => {
  // TODO: navigate to price config page when implemented
  // router.push({ pathname: "/prices/config" });
}}
```

And one that looks like:
```tsx
onPress={() => {
  // TODO: navigate to price config page when implemented
}}
```

Replace **both** of them with:
```tsx
onPress={() => {
  router.push("/(tabs)/account/configuration/prices");
}}
```

**Verify that `router` is already imported and available in this file before making this change.** If `useRouter` is not already called in this component, add `const router = useRouter();` near the top of the component body and add `import { useRouter } from "expo-router";` to the imports. Do not add it if it already exists.

**Do not change any other logic in this file.**

---

## Step 4 — Delete the two dead standalone screens

These screens are no longer linked from anywhere in the app after Steps 1–3. They are dead code.

**Before deleting, verify with a grep that no `router.push("/prices")` or `router.push("/system-types")` remain anywhere in the codebase:**

```bash
grep -rn '"/prices"' frontend/app/ frontend/components/ frontend/hooks/
grep -rn '"/system-types"' frontend/app/ frontend/components/ frontend/hooks/
```

If either grep returns results, **do not delete the file** — fix the remaining reference first.

If both greps return no results, delete:
- `frontend/app/prices/index.tsx`
- `frontend/app/system-types/index.tsx`

---

## Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Manual checks:
1. Create a new customer → tap "Manage system types" → should open the Configuration / System Types screen
2. Create a new system → tap "Manage system types" → same screen opens
3. Open Add Expense → expense type grid shows categories from the DB (or fallback list if none configured)
4. Open Profile → Configuration → Expense Categories → add a category → go back to Add Expense → new category appears in the grid
5. Open a refill modal → tap "Set price" → opens Profile → Configuration → Prices screen
