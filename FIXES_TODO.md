# Fix Backlog — Gas App

Compiled from two independent audits (Claude + Jules) and developer clarifications.
Every entry has been verified against source code except where noted.

Last updated: 2026-05-11

---

## TIER 1 — Critical (Active data bugs, silent failures)

---

### FIX-001 · wallet_start sent with wrong field name and wrong unit in system initialisation
**File:** `frontend/lib/api/company.ts:176`
**Backend ref:** `backend/app/schemas/system.py` — field is `wallet_start`, expects minor units (agorot)

**What the user sees:**
Setup Wizard → step titled **"Wallet"**
Question: *"How much money is in your wallet to start the day?"*
Input field label: **"Starting wallet (₪)"** (currency symbol from settings)

**What is broken (two bugs on the same line):**
1. Line 176 sends `cash_start: toMinorUnits(payload.cash_start)`. The input type `SystemInitializeInput` has no `cash_start` field — it was renamed to `wallet_start`. So `payload.cash_start` is `undefined`, and `toMinorUnits(undefined)` evaluates to `0`. The backend receives `cash_start: 0`, which it silently discards (unknown field).
2. The `...payload` spread on line 167 does include `wallet_start`, but as a raw major-units number (e.g. `100` for ₪100). Every other monetary field in this function has an explicit `toMinorUnits()` call; `wallet_start` does not, so it arrives at the backend in the wrong unit.

Net result: whatever the user types in "Starting wallet" is always stored as zero.

**Fix:**
- Remove `cash_start: toMinorUnits(payload.cash_start)` from line 176.
- Add `wallet_start: toMinorUnits(payload.wallet_start)` in its place. The explicit entry in the override object shadows the raw value from the `...payload` spread, so the backend receives the correctly named field in minor units.

**Risk:** Safe — two-character field name fix plus unit conversion already used on every other price field in the same function.

---

### FIX-002 · customer_adjust events appear in the daily report when they should not
**File:** `backend/app/routers/reports.py:736`
**What:** Line 736 filters `company_adjustment` from the events list before the response is returned, but `customer_adjust` is not filtered. Customer balance adjustment events therefore appear in the daily report timeline.
**Intent:** Per developer spec, balance adjustments for both customer and company must not appear in the daily report (they still appear on the Add Entry page, which is correct).
**Fix:** Extend the filter:
```python
events = [
    event for event in events
    if event.event_type not in ("company_adjustment", "customer_adjust")
]
```
**Risk:** Safe — adds one event type to an existing intentional filter.

---

### FIX-003 · Day cards in the daily report show stale data after mutations
**File:** `frontend/hooks/useDailyReportScreen.ts:55–93`
**What:** Expanded day cards fetch their data via a manual `useEffect` + `useState` pattern, not via React Query. When orders, collections, or expenses are saved, their mutation hooks call `queryClient.invalidateQueries(["reports-day-v2"])`, but since the day data is not in the React Query cache, the invalidation has no effect. Users who already expanded a day card continue to see stale event lists until they pull-to-refresh the entire strip.
**Fix:** Replace the manual fetch loop with `useQuery` keyed per date, matching the pattern already established in `useReports.ts`. This makes day data live in the cache and react to invalidations.
**Risk:** Needs caution — behavioural change; test that data refreshes correctly after order/collection/expense saves.

---

## TIER 2 — High (Broken or missing UI behaviour)

---

### FIX-004 · Company cylinder transition pills never shown in the daily report
**Files:** `frontend/components/reports/SlimActivityRow.tsx:257–258`, `frontend/types/report.ts:234–237`
**What:** `SlimActivityRow` reads `event.company_12kg_before`, `event.company_12kg_after`, `event.company_48kg_before`, `event.company_48kg_after` to build cylinder transition pills. The backend never sets these four fields on `DailyReportEvent` — it populates `balance_transitions` instead (via `_company_balance_transitions` in `reports_aggregates.py`). The guard in `pushEventTransition` sees `null` and silently skips the push. Company cylinder balance changes are therefore never shown as pills.
**Fix:** Remove the four dead field reads from `SlimActivityRow:257–258`. Rely solely on `event.balance_transitions`, which the backend does populate correctly for all company events. Remove the four field declarations from `frontend/types/report.ts:234–237`.
**Risk:** Needs backend coordination to confirm `balance_transitions` covers all company cylinder event types before removing the shortcut.

---

### FIX-006 · "Bought full" may show incorrect cylinder debt transition pills
**File:** `frontend/components/reports/SlimActivityRow.tsx`, `backend/app/routers/reports.py`
**What:** Jules reports that `company_buy_full` events display cylinder debt pills with incorrect before/after values (e.g. 3 → 0 when no debt exists). The backend does compute cylinder transitions for all company events via `_company_balance_transitions`. Whether the computed values are semantically wrong for a `buy_iron` transaction depends on how the company cylinder ledger accounts for this operation.
**Fix:** Live-test a `company_buy_full` event and inspect the returned `balance_transitions`. If the cylinder debt values are wrong, fix the ledger entry logic for `buy_iron` in the backend.
**Risk:** Needs live verification before changing anything.

---

### FIX-007 · Activity label wording does not match UX spec
**Files:** `frontend/lib/reports/eventColors.ts`, `frontend/lib/activityAdapter.ts`, `frontend/components/reports/SlimActivityRow.tsx`
**What:** Several activity types display labels that do not match the agreed terminology. Known mismatches:
- "Received payment" should be "customer paid"
- "Cash" should be "Wallet" wherever it appears as a user-facing label
- `event_type="cash_adjust"` maps to display label but the event type string itself was not renamed when the backend renamed the field
**Fix:** Audit all `EVENT_LABELS` entries and all label-building branches in `SlimActivityRow` against the UX terminology list. Update any mismatches. Do not rename the `event_type` string `"cash_adjust"` without confirming backend compatibility.
**Risk:** Safe for display label changes. Event type string rename needs backend coordination.

---

### FIX-008 · "Bought empty" payments may not reduce the day Net figure
**File:** `backend/app/routers/reports.py` (net/delta calculation), `frontend/app/(tabs)/reports/index.tsx`
**What:** Jules flags that the day-strip Net value excludes "Bought empty" payments in some logic paths. The Net should reflect all operational wallet movements including payments made when buying empty cylinders from customers.
**Fix:** Audit the `_daily_deltas` / `_net_by_day` calculation in `reports_aggregates.py`. Confirm whether `collection_payout` transactions are included in the Net. If excluded, add them.
**Risk:** Needs investigation — read the net calculation before changing.

---

### FIX-009 · useCreateCompanyBalanceAdjustment has no onError handler
**File:** `frontend/hooks/useCompanyBalances.ts:30–43`
**What:** This mutation has no `onError` callback. All other similar mutations in the same file (`useUpdateCompanyBalanceAdjustment`, `useDeleteCompanyBalanceAdjustment`) do have `onError` handlers that show a toast. If the create call fails, the user gets no feedback.
**Fix:** Add `onError: (err) => showToast(getUserFacingApiError(err, "Failed to save adjustment."))` consistent with the pattern in the same file.
**Risk:** Safe.

---

## TIER 3 — Medium (Functionality gaps, latent bugs)

---

### FIX-010 · All list endpoints hard-coded to limit: 50 — silent data truncation
**Files:** `frontend/lib/api/orders.ts:16`, `frontend/lib/api/collections.ts:28`, `frontend/lib/api/company.ts:80,132`, `frontend/lib/api/inventory.ts:74`, `frontend/lib/api/adjustments.ts:21`, `frontend/lib/api/expenses.ts:18,51`
**What:** Seven API list call sites pass `limit: 50`. The customer detail screen filters the response client-side. A customer with more than 50 orders will have older orders silently absent.
**Fix:** Define `const DEFAULT_LIST_LIMIT = 50` in a constants file and reference it everywhere. Separately, make a product decision on whether to raise the limit or add pagination for the customer detail view.
**Risk:** Constant extraction is safe. Raising the limit has performance implications — confirm with backend before changing.

---

### FIX-011 · Bank transfer direction determined by regex on label text
**Files:** `frontend/components/reports/SlimActivityRow.tsx:41–48`, `frontend/lib/activityAdapter.ts:23–41`
**What:** The direction (bank → wallet vs wallet → bank) of a bank deposit event is extracted by running a regex on the event's label string (`/to wallet/i`). The same extraction logic is duplicated independently in both files. The backend sets a structured `transfer_direction` field (`"bank_to_wallet"` / `"wallet_to_bank"`) on the event — this field should be used directly.
**Fix:** Remove both regex-based extraction blocks. Read `event.transfer_direction` directly. Remove the duplicate helper from one of the two files (extract to `lib/reports/utils.ts` if both files still need a fallback).
**Risk:** Needs caution — verify `transfer_direction` is populated for all bank deposit events before removing the fallback.

---

### FIX-012 · expenseToEvent ignores happened_at, uses created_at instead
**File:** `frontend/lib/activityAdapter.ts:547–548`
**What:** When constructing a local Add-screen event from an `Expense`, both `effective_at` and `created_at` are set to `expense.created_at ?? expense.date`. If the user recorded a custom `happened_at` time on the expense, it is ignored. The Add-screen event list may show the expense out of order.
**Fix:** Use `expense.happened_at ?? expense.created_at ?? expense.date` for `effective_at`.
**Risk:** Safe.

---

### FIX-013 · buildLegacyNoteText is dead code — remove it
**File:** `frontend/components/reports/SlimActivityRow.tsx:50–90`
**What:** `buildLegacyNoteText` is a fallback for old API payloads that sent `note.kind` / `note.remaining_before` / `note.remaining_after` objects. The backend no longer generates these payloads — all modern events send `balance_transitions`, which populates `transitionPills`. The call site at line 515 returns early when `transitionPills.length > 0`, so `buildLegacyNoteText` is never reached for any current event.
**Fix:** Delete `buildLegacyNoteText` and its call site. If any edge case still reaches it, the pill row will simply render nothing (which is what the note text fallback produces anyway).
**Risk:** Safe — confirm no active event type still arrives without `balance_transitions`.

---

### FIX-014 · DailyReportEvent ghost schema fields declared but never sent by backend
**File:** `frontend/types/report.ts:181–241`
**What:** These fields are declared in `DailyReportEventSchema` but are absent from the backend `DailyReportEvent` schema. They are always `undefined` for API-sourced events:
`status`, `is_ok`, `is_atomic_ok`, `label_short`, `action_pills`, `remaining_actions`, `open_actions`, `counterparty_display`, `event_kind`, `activity_type`
**Fix:** For each field: if the backend should send it, add it to the backend schema; if it is frontend-only display state, either remove it from the shared schema or mark it clearly as a computed field populated after parsing.
**Risk:** Needs investigation per field before removing — some may be planned but not yet implemented.

---

### FIX-015 · InventoryRefillDetails before/after snapshot fields declared but never sent by backend
**File:** `frontend/types/inventory.ts:85–94`
**What:** Eight optional snapshot fields (`before_full_12`, `before_empty_12`, `after_full_12`, `after_empty_12`, `before_full_48`, `before_empty_48`, `after_full_48`, `after_empty_48`) are declared in `InventoryRefillDetailsSchema`. The backend `InventoryRefillDetails` schema does not include them. They are always `undefined`.
**Fix:** Remove from the frontend schema, or add and populate in the backend.
**Risk:** Needs investigation — confirm these were never implemented or were removed.

---

### FIX-016 · invalidateCustomerBalance / invalidateCustomerAdjustmentHistory duplicated
**Files:** `frontend/hooks/useOrders.ts:8–27`, `frontend/hooks/useCollections.ts:8–27`
**What:** Both files contain character-for-character identical helper functions. Any future change must be made in two places.
**Fix:** Extract both helpers to `frontend/hooks/queryInvalidation.ts` and import from both hooks.
**Risk:** Safe.

---

### FIX-017 · Bank deposit extraction logic duplicated in activityAdapter and SlimActivityRow
**Files:** `frontend/lib/activityAdapter.ts:23–106`, `frontend/components/reports/SlimActivityRow.tsx:314–344`
**What:** The logic to extract transfer direction and amount from a bank deposit event is implemented independently in both files. `normalizeBankDepositDisplayEvent` in the adapter already runs on API-sourced events before they reach `SlimActivityRow`; the defensive block in `SlimActivityRow` is a leftover.
**Fix:** Remove the defensive extraction block from `SlimActivityRow:317–344`. Rely on `event.transfer_direction` and `event.money_direction` that normalization already set.
**Risk:** Needs caution — verify normalization runs for all code paths before removing the fallback.

---

### FIX-018 · useInitInventory has no onError handler
**File:** `frontend/hooks/useInventory.ts:48–60`
**What:** `useInitInventory` has no `onError` callback. Silent failure on a critical one-time initialisation operation.
**Fix:** Add `onError` with a toast using `getUserFacingApiError`.
**Risk:** Safe.

---

## TIER 4 — Low (Hygiene, type safety, dead code)

---

### FIX-019 · createCollection return type is Promise<any>
**File:** `frontend/lib/api/collections.ts:11`
**Fix:** Change return type to `Promise<CollectionEvent>`. Every other create function in the API module is typed.

---

### FIX-020 · Dead styles in SlimActivityRow
**File:** `frontend/components/reports/SlimActivityRow.tsx:673–688, 755–761`
**What:** `contextRow`, `contextSpacer`, `pillDanger`, `pillDangerText` are defined in `StyleSheet.create` but never referenced in JSX.
**Fix:** Delete all four style entries.

---

### FIX-021 · company_return_empties dead branch in reports/index.tsx
**File:** `frontend/app/(tabs)/reports/index.tsx:110, 150`
**What:** The backend's `/reports/day` endpoint never emits `company_return_empties` as an event type. These switch/if branches are unreachable.
**Fix:** Remove both branches.

---

### FIX-022 · ExpenseCategory type defined in API module instead of types barrel
**File:** `frontend/lib/api/expenses.ts:83–91`
**Fix:** Move `ExpenseCategorySchema` and `ExpenseCategory` to `frontend/types/transaction.ts` (or a new `frontend/types/expense.ts`) and re-export from `frontend/types/domain.ts`.

---

### FIX-023 · ActivityListSection fully untyped
**File:** `frontend/components/add/ActivityListSection.tsx:5, 7, 10, 11`
**What:** `data: any[]`, `error: any`, `renderItem: (item: any) => ...`, `keyExtractor?: (item: any) => ...`
**Fix:** Convert to a generic component: `function ActivityListSection<T>({ data, renderItem, ... }: Props<T>)`.

---

### FIX-024 · Unnecessary type casts
**Files:**
- `frontend/components/reports/SlimActivityRow.tsx:131` — `(event as any).system?.display_name`: replace with `event.system?.display_name` (type is already defined)
- `frontend/hooks/useInventory.ts:116` — `date as string`: remove; the function accepts `date?: string`
- `frontend/lib/api/inventory.ts:20` and `frontend/app/welcome/index.tsx:582–584` — `catch (err: any)`: replace with `isAxiosError` guard from axios

---

### FIX-025 · Over-invalidation of ["inventory", "refills"] from company mutations
**File:** `frontend/hooks/useCompanyBalances.ts:38`
**What:** `useCreateCompanyBalanceAdjustment`, `useCreateCompanyPayment`, and `useDeleteCompanyPayment` all invalidate `["inventory", "refills"]`. Company balance adjustments and payments do not affect the inventory refills list.
**Fix:** Remove the `["inventory", "refills"]` invalidation from these three mutations.

---

### FIX-026 · Report query keys use stale V2 naming
**Files:** `frontend/hooks/useReports.ts:6, 13`, all mutation hooks that call `invalidateQueries`
**What:** Query keys `"reports-v2"` and `"reports-day-v2"` use a flat hyphenated string instead of the array-nesting pattern used everywhere else (`["customers", "balance", id]`). The `V2` suffix is a completed-refactor leftover.
**Fix:** Rename to `["reports", "list"]` and `["reports", "day"]`. Update all `invalidateQueries` call sites.

---

### FIX-027 · Magic hex colors in SlimActivityRow instead of design tokens
**File:** `frontend/components/reports/SlimActivityRow.tsx:681–762`
**What:** Raw hex strings (`"#0a7ea4"`, `"#0f766e"`, `"#b91c1c"`, `"#15803d"`, `"#dc2626"`, `"#94a3b8"`) are embedded in `StyleSheet.create`. The component already imports `Level3Tokens` but applies it inconsistently.
**Fix:** Add the remaining color values to `Level3Tokens` and replace all inline hex strings.

---

### FIX-028 · Event type strings not centralised — repeated as bare literals across 5+ files
**Files:** `frontend/lib/reports/utils.ts`, `frontend/lib/reports/eventColors.ts`, `frontend/components/reports/SlimActivityRow.tsx`, `frontend/lib/activityAdapter.ts`, `frontend/app/(tabs)/reports/index.tsx`
**What:** Strings like `"order"`, `"refill"`, `"company_payment"`, `"collection_money"`, `"bank_deposit"` appear as bare literals in switch/if chains across at least five files. A typo or rename requires hunting every occurrence.
**Fix:** Define an `EVENT_TYPES` constant object (parallel to the existing `EVENT_LABELS`) and use it in all switch/if chains.

---

### FIX-029 · any parameters in utility functions
**Files:**
- `frontend/lib/reports/utils.ts:33` — `getInitInventoryAfter(events: any[])`: type as `DailyReportEvent[]`
- `frontend/components/reports/SlimActivityRow.tsx:51` — `buildLegacyNoteText(note: any, ...)`: type as `ActivityNote` (or delete per FIX-013)
- `frontend/components/AddRefillModal.tsx:178–179` — `containerStyle?: any`, `scrollStyle?: any`: type as `StyleProp<ViewStyle>`

---

### FIX-030 · DEFAULT_LIST_LIMIT constant missing
**Files:** Same seven files as FIX-010
**Fix:** Define `export const DEFAULT_LIST_LIMIT = 50` in `frontend/lib/constants.ts` (or equivalent) and replace all seven hardcoded `50` values.

---

## TIER 5 — Missing Tests

---

### TEST-001 · Multi-day ripple test
Editing an event on Day 1 must cause the "Before" pill values of subsequent events on Day 1 and onward to reflect the updated balance. Verify this end-to-end after FIX-003 is implemented.

---

### TEST-002 · Golden path sequence — all 18 activity types
Create one event of each activity type in chronological order and verify the terminal wallet balance and inventory counts match the expected sum. This catches any event type that incorrectly affects the wrong ledger.

---

### TEST-003 · Order count exclusion — customer review page
Verify that "customer paid", "Bought empty", "Returned empties", and balance adjustments do not increment the order count or update the last-order date on the customer review page. Only "Replacement" and "Sold full" should.

---

### TEST-004 · Adjustment feed — Add Entry page
Verify that customer balance adjustments and company balance adjustments appear in the Add Entry page event list with correct X → Y transition pills, and that they do not appear anywhere in the daily report timeline.

---

### TEST-005 · Operational Net accuracy
Verify that the day-strip Net value correctly includes: sales revenue, minus expenses, minus customer payouts ("Bought empty" payments), minus company payments. Create a known sequence and assert the exact Net figure.

---

## Quick reference — by file

| File | Fix IDs |
|------|---------|
| `backend/app/routers/reports.py` | FIX-002, FIX-008 |
| `frontend/lib/api/company.ts` | FIX-001 |
| `frontend/hooks/useDailyReportScreen.ts` | FIX-003 |
| `frontend/components/reports/SlimActivityRow.tsx` | FIX-004, FIX-011, FIX-013, FIX-017, FIX-020, FIX-021, FIX-024, FIX-027, FIX-029 |
| `frontend/types/report.ts` | FIX-004, FIX-014 |
| `frontend/lib/activityAdapter.ts` | FIX-011, FIX-012, FIX-017 |
| `frontend/hooks/useCompanyBalances.ts` | FIX-009, FIX-025 |
| `frontend/lib/api/*.ts` (list endpoints) | FIX-010, FIX-030 |
| `frontend/types/inventory.ts` | FIX-015 |
| `frontend/hooks/useOrders.ts` | FIX-016 |
| `frontend/hooks/useCollections.ts` | FIX-016 |
| `frontend/lib/api/collections.ts` | FIX-019 |
| `frontend/lib/api/expenses.ts` | FIX-022 |
| `frontend/components/add/ActivityListSection.tsx` | FIX-023 |
| `frontend/hooks/useInventory.ts` | FIX-024, FIX-025 |
| `frontend/lib/api/inventory.ts` | FIX-024 |
| `frontend/app/welcome/index.tsx` | FIX-024 |
| `frontend/hooks/useReports.ts` | FIX-026 |
| `frontend/components/AddRefillModal.tsx` | FIX-029 |
| `frontend/lib/reports/utils.ts` | FIX-028, FIX-029 |
| `frontend/hooks/useInventory.ts` | FIX-018 |
