# Frontend Tickets

---

## IMPL-FILTERS-01 — Unify Filter Labels + Add Badge Indicator ✅ DONE

### Branch
```
git checkout main
git checkout -b feat/filter-labels-badge
```

---

### Scope

**Files to change:**
- `frontend/lib/activityKindMeta.ts` — update kind labels, add `FILTER_GROUP_LABELS`
- `frontend/lib/filterHelpers.ts` — NEW FILE (create from scratch)
- `frontend/app/(tabs)/add/index.tsx` — migrate filter labels and badge logic
- `frontend/app/customers/[id].tsx` — migrate filter labels and badge logic
- `frontend/app/(tabs)/reports/index.tsx` — migrate group labels only

**Files NOT to change:**
- `frontend/lib/eventLabels.ts`
- `frontend/lib/wording.ts`
- `frontend/lib/balanceTransitions.ts`
- `frontend/lib/activityAdapter.ts`
- `frontend/components/reports/SlimActivityRow.tsx`
- Any file not listed above

**No improvisation.** Do not refactor, rename, reformat, or improve anything outside the exact changes listed below.

---

### Implementation

#### Change 1 — `frontend/lib/activityKindMeta.ts`

Read the file first. Find the `label` field inside each entry of `ACTIVITY_KIND_META` and update to match exactly:

| Kind | New `label` value |
|---|---|
| `replacement` | `Replace` |
| `sell_full` | `Sell full` |
| `buy_empty_from_customer` | `Buy empties` |
| `payment_from_customer` | `Payment from customer` |
| `payment_to_customer` | `Payment to customer` |
| `customer_return_empties` | `Empties from customer` |
| `adjust_customer_balance` | `Adjust customer balance` |
| `refill` | `Refill` |
| `buy_full_from_company` | `Buy fulls` |
| `payment_to_company` | `Payment to company` |
| `payment_from_company` | `Payment from company` |
| `dist_return_empties` | `Empties to company` |
| `adjust_company_balance` | `Adjust company balance` |
| `expense` | `Expense` |
| `bank_to_wallet` | `Bank to wallet` |
| `wallet_to_bank` | `Wallet to bank` |
| `adjust_wallet` | `Adjust wallet` |
| `adjust_inventory` | `Adjust inventory` |

Then append this export at the bottom of the file:

```ts
export const FILTER_GROUP_LABELS: Record<"customer" | "company" | "expenses" | "ledger", string> = {
  customer: "Customer",
  company:  "Company",
  expenses: "Money",
  ledger:   "Ledger",
};
```

---

#### Change 2 — `frontend/lib/filterHelpers.ts` (NEW FILE — complete content)

```ts
import { ACTIVITY_KIND_META } from "@/lib/activityKindMeta";

type FilterTab = "customer" | "company";

const FILTER_ID_TO_KIND: Record<string, string> = {
  late_payment:           "payment_from_customer",
  payout:                 "payment_to_customer",
  return_empties:         "customer_return_empties",
  buy_empty:              "buy_empty_from_customer",
  buy_full:               "buy_full_from_company",
  company_return:         "dist_return_empties",
  inventory_adjustment:   "adjust_inventory",
};

const ADJUSTMENT_KIND: Record<FilterTab, string> = {
  customer: "adjust_customer_balance",
  company:  "adjust_company_balance",
};

export function resolveFilterLabel(filterId: string, tab?: FilterTab): string {
  if (filterId === "adjustment" && tab) {
    const kind = ADJUSTMENT_KIND[tab];
    return ACTIVITY_KIND_META[kind]?.label ?? filterId;
  }
  const kind = FILTER_ID_TO_KIND[filterId] ?? filterId;
  return ACTIVITY_KIND_META[kind]?.label ?? filterId;
}

export function isCustomerTabFiltered(state: {
  selectedGroup: string | null;
  selectedKind: string | null;
  selectedSubFilter: string | null;
}): boolean {
  return !!(state.selectedGroup || state.selectedKind || state.selectedSubFilter);
}

export function isCompanyTabFiltered(state: {
  selectedGroup: string | null;
  selectedKind: string | null;
}): boolean {
  return !!(state.selectedGroup || state.selectedKind);
}

export function isMoneyTabFiltered(state: {
  selectedKind: string | null;
  selectedCategory: string | null;
}): boolean {
  return !!(state.selectedKind || state.selectedCategory);
}

export function isLedgerTabFiltered(state: {
  selectedKind: string | null;
}): boolean {
  return !!state.selectedKind;
}

export function isCustomerReviewFiltered(state: {
  selectedKind: string | null;
  selectedSubFilter: string | null;
}): boolean {
  return !!(state.selectedKind || state.selectedSubFilter);
}
```

> **Note:** The exact shape of each state argument must match the actual filter state in `add/index.tsx` and `customers/[id].tsx`. Read those files first and adjust the parameter types to match. Do not change the function signatures beyond what is needed to match real state — no new state, no new fields.

---

#### Change 3 — `frontend/app/(tabs)/reports/index.tsx`

Find `ACTIVITY_GROUP_OPTIONS` at lines 95–100. Replace:

```ts
const ACTIVITY_GROUP_OPTIONS: Record<Exclude<ActivityFilterGroupKey, "all">, ActivityFilterOption> = {
  customer: { key: "customer", label: "Customer Activities" },
  company: { key: "company", label: "Company Activities" },
  expenses: { key: "expenses", label: "Expenses" },
  ledger: { key: "ledger", label: "Ledger Adjustments" },
};
```

With:

```ts
import { FILTER_GROUP_LABELS } from "@/lib/activityKindMeta";

const ACTIVITY_GROUP_OPTIONS: Record<Exclude<ActivityFilterGroupKey, "all">, ActivityFilterOption> = {
  customer: { key: "customer", label: FILTER_GROUP_LABELS.customer },
  company:  { key: "company",  label: FILTER_GROUP_LABELS.company  },
  expenses: { key: "expenses", label: FILTER_GROUP_LABELS.expenses  },
  ledger:   { key: "ledger",   label: FILTER_GROUP_LABELS.ledger   },
};
```

No other changes in this file.

---

#### Change 4 — `frontend/app/(tabs)/add/index.tsx`

Read the file first. Then make three targeted changes:

**4a — Filter option labels:** Find all places where filter option display labels are set for activity kinds. Replace each hardcoded label string or `EVENT_LABELS.*` reference with `resolveFilterLabel(filterId, tab)` imported from `@/lib/filterHelpers`.

**4b — Group labels:** Find all places where group label strings are rendered (e.g. "Customer Activities", "Company Activities", "Money Activities", "Ledger Adjustments"). Replace with `FILTER_GROUP_LABELS[groupKey]` imported from `@/lib/activityKindMeta`.

**4c — Badge indicators:** Find the filter button for each tab (Customer, Company, Money, Ledger). Add a badge/dot using the corresponding helper from `@/lib/filterHelpers`. Pass the existing filter state — do not add new state. Search text must not affect badge state.

Do not change any `EVENT_LABELS` usage outside of filter option labels.

---

#### Change 5 — `frontend/app/customers/[id].tsx`

Read the file first. Then make two targeted changes:

**5a — Filter option labels (kind level only):** Find filter option labels for activity kinds in the history filter. Replace with `resolveFilterLabel(filterId, "customer")` from `@/lib/filterHelpers`. Do not add or change any group-level labels — Customer Review has no group selector.

**5b — Badge indicator:** Find the history filter button. Add a badge/dot using `isCustomerReviewFiltered` from `@/lib/filterHelpers`. Pass existing filter state. Search text must not affect badge state.

Do not change any `EVENT_LABELS` usage outside filter option labels.

---

### Tests

Create a new test file: `frontend/lib/__tests__/filterHelpers.test.ts`

Write tests covering these cases:

1. Each of the 18 canonical kinds: `ACTIVITY_KIND_META[kind].label` returns the exact string from the label table in Change 1
2. Each of the 4 group keys: `FILTER_GROUP_LABELS[key]` returns `"Customer"`, `"Company"`, `"Money"`, `"Ledger"` respectively
3. `resolveFilterLabel` for every non-canonical ID in the mapping table returns the correct label
4. `resolveFilterLabel("adjustment", "customer")` returns `"Adjust customer balance"`
5. `resolveFilterLabel("adjustment", "company")` returns `"Adjust company balance"`
6. Each badge helper returns `true` when at least one relevant filter field is non-null
7. Each badge helper returns `false` when all relevant filter fields are null
8. Search text passed as a separate field does not cause any badge helper to return `true`

Do not import any TSX files or React Native modules in the test file.

---

### Return

Codex must return:
- The exact test command for the developer to run (do not run it yourself):
```
npx jest frontend/lib/__tests__/filterHelpers.test.ts --no-coverage
```
- A list of every file changed with a one-line summary of what changed in each

---

### Acceptance Criteria

- [ ] `ACTIVITY_KIND_META` has correct `label` for all 18 kinds matching the table above
- [ ] `FILTER_GROUP_LABELS` is exported from `activityKindMeta.ts` with values: Customer, Company, Money, Ledger
- [ ] `frontend/lib/filterHelpers.ts` exists and has no React Native or TSX imports
- [ ] Daily Report group labels show: Customer, Company, Money, Ledger
- [ ] Add Entry filter kind labels match the canonical table for all 18 kinds
- [ ] Customer Review filter kind labels match the canonical table for customer kinds
- [ ] Filter button on each Add Entry tab shows a badge when its filter is active
- [ ] Filter button on Customer Review shows a badge when filter is active
- [ ] Badge does not appear when only search text is entered (no filter chips selected)
- [ ] `eventLabels.ts` is unchanged
- [ ] All files listed under "Do NOT change" are unchanged
- [ ] Test file `frontend/lib/__tests__/filterHelpers.test.ts` exists and all tests pass

---

## IMPL-APPSTART-01 — App Opens on Daily Report

**Status: TODO**

### Branch
```
git checkout main
git checkout -b fix/app-start-daily-report
```

---

### Scope

**File to change:**
- `frontend/app/(tabs)/_layout.tsx`

**Files NOT to change:**
- Any other file

**No improvisation.** One value changes. Nothing else.

---

### Implementation

In `frontend/app/(tabs)/_layout.tsx`, find line 38:

```ts
initialRouteName="dashboard"
```

Change to:

```ts
initialRouteName="reports/index"
```

That is the only change required. Do not touch any other line in this file.

---

### Tests

No automated test can cover cold-launch routing in Expo Router. Manual verification only:

1. Close the app completely
2. Cold-launch the app
3. Confirm the Daily Report screen opens (not the dashboard)
4. Confirm the "Daily" tab icon in the bottom tab bar is active on launch

---

### Return

Codex must return:
- Confirmation of the exact line changed (old value → new value)
- No test command needed — manual verification only

---

### Acceptance Criteria

- [ ] `initialRouteName` in `frontend/app/(tabs)/_layout.tsx` is `"reports/index"`
- [ ] App opens on Daily Report on cold launch
- [ ] All other tabs still navigate correctly
- [ ] No other lines in `_layout.tsx` were changed

---

## AUDIT-LABELS-01 — Eliminate Remaining `eventLabels.ts` Usages

**Status: TODO**

### Context

`frontend/lib/eventLabels.ts` is a legacy file. The canonical single source of truth for all activity kind display labels is now `frontend/lib/activityKindMeta.ts` (via `ACTIVITY_KIND_META[kind].label`) and `FILTER_GROUP_LABELS` for group labels.

As of IMPL-FILTERS-01, filter UIs in `add/index.tsx`, `customers/[id].tsx`, and `reports/index.tsx` were migrated. However, `eventLabels.ts` may still be imported and used in other parts of the codebase (activity rows, list headers, export labels, etc.). This ticket audits every remaining usage and migrates them.

---

### Branch
```
git checkout main
git checkout -b refactor/centralize-labels
```

---

### Scope

**Goal:** After this ticket, `eventLabels.ts` has zero imports anywhere in the frontend. It remains on disk as dead code (do NOT delete it — a separate ticket must explicitly authorize deletion).

**Files to audit (search for imports of `eventLabels`):**
- Any file under `frontend/` that imports from `@/lib/eventLabels` or `../lib/eventLabels` or `./eventLabels`

**Files NOT to change:**
- `frontend/lib/eventLabels.ts` itself — do not modify or delete
- `frontend/lib/activityKindMeta.ts` — do not change labels (already canonical from IMPL-FILTERS-01)
- Any test files that test `eventLabels.ts` directly (leave those tests in place)

**No improvisation.** Do not rename variables, reformat code, or refactor beyond replacing the label references.

---

### Implementation

#### Step 1 — Audit

Search the entire `frontend/` directory for any file that imports from `eventLabels`. For each file found:
1. Note which exported values it uses (e.g. `EVENT_LABELS.sell_full`, `EVENT_LABELS.replacement`)
2. Note what the usage is (render label text, pass as prop, etc.)

#### Step 2 — Migrate each usage

For each usage found:
- If the usage is an activity kind label: replace with `ACTIVITY_KIND_META[kind].label` from `@/lib/activityKindMeta`
- If the usage is a group label: replace with `FILTER_GROUP_LABELS[groupKey]` from `@/lib/activityKindMeta`
- If the kind is not in `ACTIVITY_KIND_META` for some reason: report it — do NOT invent a fallback

For each file migrated:
- Remove the `eventLabels` import
- Add `ACTIVITY_KIND_META` import from `@/lib/activityKindMeta` if not already imported

#### Step 3 — Verify

After all migrations, confirm that `grep -r "eventLabels" frontend/` returns no results outside of the `eventLabels.ts` file itself and any test files that test it directly.

---

### Tests

No new test files required. Run the full frontend test suite to verify no regressions:

```
npx jest --no-coverage
```

If any existing test was asserting against `EVENT_LABELS.*` values that are now replaced by `ACTIVITY_KIND_META`, update those test assertions to use the canonical label from `ACTIVITY_KIND_META`.

---

### Return

Codex must return:
- List of every file that had `eventLabels` imports, with a one-line summary of what was replaced
- Confirmation that `grep -r "eventLabels" frontend/` shows zero hits outside `eventLabels.ts` and its direct test files
- The test command result or instruction for the developer to run:
```
npx jest --no-coverage
```

---

### Acceptance Criteria

- [ ] Zero files in `frontend/` import from `eventLabels.ts` (except tests that test `eventLabels.ts` directly)
- [ ] All replaced labels match the canonical table in IMPL-FILTERS-01 exactly
- [ ] `eventLabels.ts` file itself is untouched
- [ ] `activityKindMeta.ts` file is untouched
- [ ] All frontend tests pass (0 failures)

---

## FIX-HIGHLIGHT-01 — Fix Highlight Persistence, Event Types, and Tab Routing

**Status: TODO**

### Branch
```
git checkout main
git checkout -b fix/highlight-critical
```

---

### Scope

**Files to change:**
- `frontend/app/(tabs)/reports/index.tsx`
- `frontend/app/(tabs)/add/index.tsx`
- `frontend/components/AddRefillModal.tsx`
- `frontend/app/inventory/new.tsx`

**Files NOT to change:**
- `frontend/lib/saveFlow.ts`
- `frontend/lib/successPulse.ts`
- `frontend/components/SuccessPulse.tsx`
- Any file not listed above

**No improvisation.** Four targeted changes only.

---

### Implementation

#### Change 1 — Clear highlight params from URL after consumption in Daily Report

**File:** `frontend/app/(tabs)/reports/index.tsx`

Read the file first. Find lines 432–436:

```ts
lastHighlightParamKey.current = paramKey;
const eventKey = String(match?.id ?? match?.source_id ?? `${match?.event_type ?? "ev"}:${match?.effective_at ?? ""}`);
const eventDate = (match?.effective_at ?? "").slice(0, 10) || null;
setHighlightEventKey(eventKey);
setHighlightDate(eventDate);
```

Replace with:

```ts
lastHighlightParamKey.current = paramKey;
const eventKey = String(match?.id ?? match?.source_id ?? `${match?.event_type ?? "ev"}:${match?.effective_at ?? ""}`);
const eventDate = (match?.effective_at ?? "").slice(0, 10) || null;
setHighlightEventKey(eventKey);
setHighlightDate(eventDate);
router.setParams({ highlightId: undefined, highlightEventType: undefined, highlightEffectiveAt: undefined });
```

No other changes in this file.

---

#### Change 2 — Clear highlight params from URL after consumption in Add Entry

**File:** `frontend/app/(tabs)/add/index.tsx`

Find lines 1001–1007:

```ts
useEffect(() => {
  const rawId = Array.isArray(addParams.highlightId) ? addParams.highlightId[0] : addParams.highlightId;
  if (!rawId) return;
  setHighlightItemId(rawId);
  const timer = setTimeout(() => setHighlightItemId((c) => (c === rawId ? null : c)), 7200);
  return () => clearTimeout(timer);
}, [addParams.highlightId]);
```

Replace with:

```ts
useEffect(() => {
  const rawId = Array.isArray(addParams.highlightId) ? addParams.highlightId[0] : addParams.highlightId;
  if (!rawId) return;
  setHighlightItemId(rawId);
  router.setParams({ highlightId: undefined });
  const timer = setTimeout(() => setHighlightItemId((c) => (c === rawId ? null : c)), 7200);
  return () => clearTimeout(timer);
}, [addParams.highlightId]);
```

Also on line 280, add `mode` to the params type:

```ts
// before
const addParams = useLocalSearchParams<{ prices?: string; open?: string; highlightId?: string }>();

// after
const addParams = useLocalSearchParams<{ prices?: string; open?: string; highlightId?: string; mode?: string }>();
```

Then add the following `useEffect` immediately after the existing `addParams.highlightId` useEffect (after line 1007):

```ts
useEffect(() => {
  const modeParam = Array.isArray(addParams.mode) ? addParams.mode[0] : addParams.mode;
  if (!modeParam) return;
  setMode(modeParam as AddMode);
  router.setParams({ mode: undefined });
}, [addParams.mode]);
```

No other changes in this file.

---

#### Change 3 — Fix event type strings in AddRefillModal to use canonical ActivityKind values

**File:** `frontend/components/AddRefillModal.tsx`

Read the file first. Find lines 525–538:

```ts
if (resetAfter && !editEntry?.refill_id) {
  formState.resetFormForCurrentMode();
  onSaveAndAddSuccess?.({
    effectiveAt,
    mode,
    highlightEventType: formState.isBuyMode ? "company_buy_full" : "refill",
  });
} else {
  if (onSaveSuccess) {
    onSaveSuccess({
      effectiveAt,
      entry: savedEntry,
      highlightEventType: formState.isBuyMode ? "company_buy_full" : "refill",
    });
```

Replace with:

```ts
const highlightEventType = formState.isBuyMode
  ? "buy_full_from_company"
  : formState.isReturnMode
    ? "dist_return_empties"
    : "refill";
if (resetAfter && !editEntry?.refill_id) {
  formState.resetFormForCurrentMode();
  onSaveAndAddSuccess?.({
    effectiveAt,
    mode,
    highlightEventType,
  });
} else {
  if (onSaveSuccess) {
    onSaveSuccess({
      effectiveAt,
      entry: savedEntry,
      highlightEventType,
    });
```

No other changes in this file.

---

#### Change 4 — Fix adjust_company_balance to land on Company tab

**File:** `frontend/app/inventory/new.tsx`

Find lines 1095–1097:

```ts
const handleCompanyAdjustSaveSuccess = useCallback((highlightId: string) => {
  router.replace({ pathname: "/(tabs)/add", params: { highlightId } });
}, []);
```

Replace with:

```ts
const handleCompanyAdjustSaveSuccess = useCallback((highlightId: string) => {
  router.replace({ pathname: "/(tabs)/add", params: { highlightId, mode: "company_activities" } });
}, []);
```

No other changes in this file.

---

### Tests

**Test file to create:** `tests/frontend/highlight-event-types.test.ts`

Write tests covering:

1. `highlightEventType` for refill mode is `"refill"` (unchanged)
2. `highlightEventType` for buy mode is `"buy_full_from_company"` (was `"company_buy_full"`)
3. `highlightEventType` for return mode is `"dist_return_empties"` (was `"refill"`)

These tests should import `AddRefillModal`'s `formState.isBuyMode`/`formState.isReturnMode` logic or the derived value directly — do not import React Native or TSX. If the logic cannot be tested in isolation, write the test against the string constants only.

**Test command for developer to run:**
```
npx jest tests/frontend/highlight-event-types.test.ts --no-coverage
```

---

### Return

Codex must return:
- Exact diff for each of the 4 changes (old line → new line)
- The test command above — do not run it
- Confirmation that `formState.isReturnMode` exists and is accessible in `AddRefillModal.tsx` (or the exact field name if different)

---

### Acceptance Criteria

- [ ] Navigating away from Daily Report and returning does not re-show the highlight
- [ ] Navigating away from Add Entry and returning does not re-show the highlight
- [ ] `highlightEventType` in `AddRefillModal` for buy mode is `"buy_full_from_company"`
- [ ] `highlightEventType` in `AddRefillModal` for return mode is `"dist_return_empties"`
- [ ] `highlightEventType` in `AddRefillModal` for refill mode is `"refill"`
- [ ] After saving `adjust_company_balance`, Add Entry opens on the Company tab
- [ ] After saving `adjust_customer_balance`, Add Entry still opens on the Customer tab (default — verify no regression)
- [ ] `router` import is present in both `reports/index.tsx` and `add/index.tsx` (it already is — verify it is not removed)
- [ ] All 4 changed files have no other modifications beyond the exact changes above

---

## FIX-HIGHLIGHT-02 — Fix Highlight ID Accuracy for buy_full_from_company

**Status: TODO**

### Branch
```
git checkout main
git checkout -b fix/highlight-ids
```

---

### Scope

**Files to change:**
- `frontend/components/AddRefillModal.tsx`
- `frontend/app/inventory/new.tsx`

**Files NOT to change:**
- `frontend/lib/api/inventory.ts` — do not change API functions
- `frontend/lib/api/company.ts` — do not change API functions
- Any file not listed above

**No improvisation.** Two targeted changes only.

**Known limitation (not in scope for this ticket):**
`createInventoryRefill` and `createInventoryAdjust` return `InventorySnapshot` (inventory counts only) — they do not return the created record's ID. Highlight for `refill`, `dist_return_empties`, and `adjust_inventory` will remain imprecise (matched by event type + date) until the backend API is updated to return the record ID. Do not attempt to work around this with extra API calls.

---

### Implementation

#### Change 1 — Capture real ID from createBuyFullFromCompany response

**File:** `frontend/components/AddRefillModal.tsx`

Read the file first. Find lines 484–493:

```ts
} else if (formState.isBuyMode) {
  await createBuyFullFromCompany.mutateAsync({
    date: formState.date,
    time: formState.time,
    new12: payloadBuy12,
    new48: payloadBuy48,
    total_cost: totalCost,
    paid_amount: paidAmountValue,
    note: formState.notes.trim() ? formState.notes.trim() : undefined,
  });
```

Replace with:

```ts
} else if (formState.isBuyMode) {
  const createdBuy = await createBuyFullFromCompany.mutateAsync({
    date: formState.date,
    time: formState.time,
    new12: payloadBuy12,
    new48: payloadBuy48,
    total_cost: totalCost,
    paid_amount: paidAmountValue,
    note: formState.notes.trim() ? formState.notes.trim() : undefined,
  });
  buyCreatedId = createdBuy.id;
```

Then declare `let buyCreatedId: string | undefined` immediately before the `try` block on line 469. Find:

```ts
try {
  if (editEntry?.refill_id) {
```

Replace with:

```ts
let buyCreatedId: string | undefined;
try {
  if (editEntry?.refill_id) {
```

Then find line 514–515 where `savedEntry.id` is constructed:

```ts
const savedEntry = {
  id: editEntry?.refill_id ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
```

Replace with:

```ts
const savedEntry = {
  id: editEntry?.refill_id ?? buyCreatedId ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
```

No other changes in this file.

---

#### Change 2 — Pass entry.id as highlightId for refill/buy/return

**File:** `frontend/app/inventory/new.tsx`

Find line 1195:

```ts
onSaveSuccess={({ effectiveAt, highlightEventType }) => handleSaveSuccess(effectiveAt, highlightEventType)}
```

Replace with:

```ts
onSaveSuccess={({ effectiveAt, highlightEventType, entry }) => handleSaveSuccess(effectiveAt, highlightEventType, entry?.id)}
```

No other changes in this file.

---

### Tests

No new test file required. Verify the existing highlight tests still pass:

**Test command for developer to run:**
```
npx jest tests/frontend/highlight-event-types.test.ts --no-coverage
```

(This test file is created in FIX-HIGHLIGHT-01. Run FIX-HIGHLIGHT-01 first.)

---

### Return

Codex must return:
- Exact diff for each of the 2 changes
- Confirmation that `createdBuy.id` is a `string` (from the `CompanyBuyFull` type — verify `CompanyBuyFullSchema` has `id: z.string()`)
- Confirmation that `entry` is typed in the `onSaveSuccess` callback and `entry?.id` compiles without TypeScript error
- The test command above — do not run it

---

### Acceptance Criteria

- [ ] After saving `buy_full_from_company`, the correct card is highlighted on Daily Report (exact ID match, not event-type fallback)
- [ ] `savedEntry.id` in `AddRefillModal` uses the real API-returned ID for buy mode creates
- [ ] `refill` and `dist_return_empties` still use event-type + date fallback matching (no regression — they were already imprecise)
- [ ] `adjust_inventory` still uses event-type + date fallback matching (no regression)
- [ ] No TypeScript errors introduced in either changed file
- [ ] No other lines in either file were changed
