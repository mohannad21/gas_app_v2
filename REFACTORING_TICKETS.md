# Activity Kind Refactoring — Ticket Plan

**Last updated:** 2026-05-23
**Branch:** `feat/backend-missing-tests`
**Status:** Agreed, not yet executed

---

## Introduction

This document defines the complete, ordered refactoring plan to eliminate activity kind naming inconsistencies across the gas_app_v2 codebase.

### The Problem

The same business event (e.g. a replacement order, a customer payment) is referred to by different names depending on where in the code you look:

- The **database and reports API** use canonical names like `replacement`, `payment_from_customer`
- The **add-screen adapter** (`activityAdapter.ts`) emits synthetic names like `"order"`, `"collection_money"`, `"company_payment"` — none of which are canonical
- **Color maps, icon handlers, and filter logic** still reference a third set of legacy aliases like `cash_adjust`, `company_buy_iron`, `adjust`

This fragmentation causes:
- Silent rendering bugs — unrecognized kinds fall through to a default icon/color with no error
- `payment_from_company` has **zero** frontend handlers — it renders as a grey circle (`ellipse-outline`) on all screens
- Activity labels are hardcoded English strings in dozens of places, making Arabic translation impossible without touching every file
- `bank_deposit` encodes direction via a secondary `transfer_direction` field instead of using two distinct event types

### The Goal

Every canonical activity kind is represented by exactly one name in every layer of the codebase. Labels, icons, colors, and filter groups are owned by a single source of truth (`activityKindMeta.ts`). During migration, a single `normalizeEventType()` gateway is the only place where legacy aliases are accepted. After Ticket 9, legacy aliases are removed from production display code entirely.

### Canonical Activity Kinds (18 total)

| # | Canonical Kind | Description |
|---|---|---|
| 1 | `replacement` | Deliver full cylinders, collect empties |
| 2 | `sell_full` | Deliver full cylinders only |
| 3 | `buy_empty_from_customer` | Collect empty cylinders only |
| 4 | `payment_from_customer` | Cash received from customer |
| 5 | `payment_to_customer` | Cash refunded to customer |
| 6 | `customer_return_empties` | Customer returns empties at shop |
| 7 | `adjust_customer_balance` | Manual correction on customer account |
| 8 | `refill` | Receive full cylinders from company, return empties |
| 9 | `dist_return_empties` | Return empties to company only |
| 10 | `buy_full_from_company` | Buy full cylinders from company |
| 11 | `payment_to_company` | Pay money to company |
| 12 | `payment_from_company` | Receive money from company |
| 13 | `adjust_company_balance` | Manual correction on company account |
| 14 | `expense` | Business expense |
| 15 | `wallet_to_bank` | Transfer from wallet to bank |
| 16 | `bank_to_wallet` | Transfer from bank to wallet |
| 17 | `adjust_wallet` | Manual wallet adjustment |
| 18 | `adjust_inventory` | Manual inventory adjustment |

Note: `bank_deposit` is split into `wallet_to_bank` and `bank_to_wallet` as part of this refactoring (Ticket 2).

### Namespace Definitions

| Namespace | Examples | Used where |
|---|---|---|
| `ActivityKind` | `replacement`, `payment_from_customer` | Report event types — the canonical list above |
| `LedgerSourceType` | `cash_adjust`, `customer_txn` | Backend ledger DB keys — never used in display code |
| `OrderMode` | `replacement`, `sell_iron`, `buy_iron` | Adapter/input only — maps to canonical kinds in Ticket 8 |
| `TransferDirection` | `wallet_to_bank`, `bank_to_wallet` | Temporary field during bank split migration |
| `UiFilterKind` | `customer`, `company`, `expenses`, `ledger` | Frontend filter grouping only |
| `AddScreenFilterKind` | `company_payment`, `received_from_company`, `cash_adjustment` | Add-screen UI filters only - not report event types |
| `AddListItemKind` | `bank_transfer`, `company_payment`, `cash_adjustment` | Add-screen local row/list kinds only - not report event types |
| `QueryKey` | `bank_deposits` | Frontend cache keys only - not report event types |

### Compatibility Policy

- During migration, legacy aliases are accepted **only** inside `normalizeEventType()` — nowhere else in the frontend
- After Ticket 9, legacy aliases are removed from `normalizeEventType()` as well; canonical `ActivityKind` values are the only accepted production display values
- `LedgerSourceType` values (e.g. `"cash_adjust"`, `"inventory_adjust"`) are internal DB keys and **must never appear in display code**
- `AddScreenFilterKind`, `AddListItemKind`, and `QueryKey` values are separate frontend namespaces and must not be blindly migrated as `ActivityKind` values in Ticket 8
- Frontend display **never** reads `event.label` as its primary source — it derives the label from `event_type` via `activityKindMeta`; `event.label` is a fallback only
- `transfer_direction` is kept for one migration window after the bank split and removed in Ticket 9
- Ticket 9 (cleanup) runs **only** after Ticket 8 is complete, Ticket 7 tests pass, and a UI walkthrough confirms migration is complete

### Source of Truth for Labels

`activity_feature_matrix.csv` is the approved source for agreed English label strings. All backend and frontend labels must align to it.

### Execution Order

```
T1 (docs) → T2 (backend contract) → T3 (backend tests) → T4 (frontend metadata)
  → T5 (translation-ready labels) → T6 (balance wording) → T7 (frontend tests) → T8 (adapter migration) → T9 (cleanup)
```

---

## Ticket 1 — Source of Truth Documentation

**Goal:** Lock the naming/refactor contract before any code moves.

**Preconditions:** None.

**Work:**
- Finalize `ACTIVITY_KIND_NAMING.md` with the 18-kind matrix
- Confirm `activity_feature_matrix.csv` is the approved label source of truth
- Define all namespaces (ActivityKind, LedgerSourceType, OrderMode, TransferDirection, UiFilterKind, AddScreenFilterKind, AddListItemKind, QueryKey)
- Add the compatibility policy (see Introduction above)

### 1b — Approval Gates Before Implementation

The following matrices must be reviewed and approved by the project owner before any ticket beyond T1 begins implementation:

1. **Activity label matrix:** All 18 canonical kinds with exact English labels from `activity_feature_matrix.csv`.
2. **Activity metadata matrix:** Canonical kind, label key, icon, color, filter group, scope for all 18 kinds.
3. **Report subtype/filter matrix:** How each canonical kind maps to a second-level filter chip in the reports screen; which kinds share a chip (e.g. return-only refill vs normal refill).
4. **Legacy alias matrix:** Every old frontend alias mapped to a canonical kind, and which ticket removes it.
5. **Balance wording/sign matrix:** Debt/credit wording for customer/company money and cylinders (already code-derived in `balanceTransitions.ts`; confirm it matches user expectations).
6. **Bank migration matrix:** `bank_deposit → wallet_to_bank / bank_to_wallet` split; how long `transfer_direction` stays in backend responses before T9 drops it.
7. **DB ledger-source repair matrix:** Confirm repair backfill (`adjust_wallet → cash_adjust`, `adjust_inventory → inventory_adjust`) is correct and should ship as a standalone migration.

**Final-state rule:** Backend and frontend must eventually use the same canonical `ActivityKind` values everywhere. `normalizeEventType()` is a temporary migration gateway; all legacy alias handling is removed in T9.

**Files:**
- `ACTIVITY_KIND_NAMING.md`

**Done when:** `ACTIVITY_KIND_NAMING.md` is reviewed and approved by the project owner; all approval gate matrices from section 1b are signed off.

---

## Ticket 2 — Backend Event Contract

**Goal:** Backend emits canonical report events with aligned labels and hero text.

**Files:**
- `backend/app/constants/activity_kinds.py` (new)
- `backend/app/routers/reports.py`
- `backend/app/services/reports_event_fields.py`
- `backend/app/schemas/report.py` (only if introducing a typed `ActivityKind` enum)

**Work:**

### 2a — Constants
Create `backend/app/constants/activity_kinds.py` with string constants for all 18 canonical kinds. Replace all hardcoded report event strings in `reports.py` and `reports_event_fields.py` with these constants.

### 2b — Label alignment
Update `_EVENT_LABELS` and `_ORDER_LABELS` in `reports_event_fields.py` to match the CSV-agreed labels:

| Kind | Label |
|---|---|
| `replacement` | Replace |
| `sell_full` | Sell full |
| `buy_empty_from_customer` | Buy empties |
| `payment_from_customer` | Payment from customer |
| `payment_to_customer` | Payment to customer |
| `customer_return_empties` | Empties from customer |
| `adjust_customer_balance` | Adjust customer balance |
| `dist_return_empties` | Empties to company |
| `buy_full_from_company` | Buy fulls |
| `payment_to_company` | Payment to company |
| `payment_from_company` | Payment from company |
| `adjust_company_balance` | Adjust company balance |
| `adjust_inventory` | Adjust inventory |
| `adjust_wallet` | Adjust wallet |
| `wallet_to_bank` | Wallet to bank |
| `bank_to_wallet` | Bank to wallet |

### 2c — Hero text alignment
Align all `hero_text` values to the matrix. Where the matrix specifies null/empty (e.g. `adjust_customer_balance`, `adjust_company_balance`), the backend must return null — not a placeholder string.

### 2d — Bank split
In `reports.py` around line 569, replace `event_type="bank_deposit"` with `event_type="wallet_to_bank"` or `event_type="bank_to_wallet"` based on `transfer_direction`. Keep `transfer_direction` in the response for one migration window.

Rules:
- `/reports/day` must emit `wallet_to_bank` or `bank_to_wallet` — never `event_type="bank_deposit"` after this ticket.
- Backend must not infer bank direction from label text; direction comes only from the stored `transfer_direction` field.
- `transfer_direction` stays in the response temporarily for frontend compatibility only.

### 2e — Schema
If introducing an `ActivityKind` `Literal`/`Enum` on `event_type` in `backend/app/schemas/report.py`, include all 18 canonical kinds. If `event_type` remains `str`, no schema change is needed.

### 2f — Consolidate company-payment label logic
`reports_event_fields.py` has duplicate company-payment sign logic: `_company_payment_label()` (line 48) is the named helper, but `_event_label()` has an inline copy of the same sign check at lines 64-68. While aligning backend labels in 2b, route both `_event_label()` and hero-text generation through `_company_payment_label()` to eliminate the duplication. Do not leave two copies of the same sign logic.

**Protected:** `source_type="cash_adjust"` and `source_type="inventory_adjust"` are DB ledger lookup keys. Do not rename or remove them while changing report `event_type` values.

**Done when:** `/reports/day` emits canonical event types, matrix-aligned labels, and correctly set hero text; bank events use canonical types only; company-payment label logic is in one place.

---

## Ticket 3 — Backend Tests

**Goal:** Freeze backend behavior before frontend migration begins.

**Preconditions:** The activity label matrix (approval gate 1 from T1) must be approved before `test_activity_wording.py` is written — tests assert exact label strings and will need to be rewritten if labels change after they are committed.

**Files:**
- `tests/backend/test_activity_wording.py`
- `tests/backend/test_date_picker_strip.py`
- `tests/backend/test_customer_review_summary.py`
- `tests/backend/test_activity_coverage.py`
- `tests/backend/test_expanded_details.py`
- Existing history cascade test files

**Work:**
- For every canonical kind, assert:
  - `event_type` equals the canonical name exactly
  - `label` equals the CSV-agreed English label
  - `hero_text` equals the matrix expectation — **including null/empty where the matrix specifies it**
  - Structured balance transitions (quantity and money fields)
- Add day strip tests
- Add customer review summary tests
- Add kind coverage tests (assert `"bank_deposit"`, `"cash_adjust"`, and `"adjust"` never appear as report `event_type`)
- Add bank split tests:
  - Assert wallet-to-bank event emits `event_type="wallet_to_bank"`
  - Assert bank-to-wallet event emits `event_type="bank_to_wallet"`
  - Assert `/reports/day` never emits `event_type="bank_deposit"`
  - Tests may allow `transfer_direction` to exist temporarily, but must not depend on it for display identity
- Update bank split expectations in existing backend tests that currently assert `event_type == "bank_deposit"`, especially:
  - `tests/backend/test_bank_deposit.py`
  - `tests/backend/test_ledger_smoke.py`
  - `tests/backend/test_expanded_details.py`
- Add cascade and isolation tests

**Done when:** All backend tests pass with no skips on covered paths.

---

## Ticket 4 — Frontend Canonical Metadata

**Goal:** One frontend source of truth for labels, icons, colors, scope, and filter group per activity kind.

**Files:**
- `frontend/lib/activityKinds.ts` (new)
- `frontend/lib/activityKindMeta.ts` (new)
- `frontend/lib/reports/utils.ts`
- `frontend/lib/reports/eventColors.ts`
- `frontend/components/reports/ActivityIcon.tsx`
- `frontend/components/reports/SlimActivityRow.tsx`
- `frontend/components/reports/EventExpandedPanel.tsx`
- `frontend/components/CashExpensesView.tsx`
- `frontend/app/(tabs)/reports/index.tsx`
- `frontend/app/customers/[id].tsx`

**Work:**

### 4a — `activityKinds.ts`
Define the `ActivityKind` union type:
```typescript
export type ActivityKind =
  | "replacement" | "sell_full" | "buy_empty_from_customer"
  | "payment_from_customer" | "payment_to_customer" | "customer_return_empties"
  | "adjust_customer_balance" | "refill" | "dist_return_empties"
  | "buy_full_from_company" | "payment_to_company" | "payment_from_company"
  | "adjust_company_balance" | "expense" | "wallet_to_bank" | "bank_to_wallet"
  | "adjust_wallet" | "adjust_inventory";
```

### 4b — `activityKindMeta.ts`
Create a record keyed by canonical kind:
```typescript
type ActivityKindMeta = {
  labelKey: string;        // i18n key, e.g. "activities.replacement.label"
  icon: string;            // Ionicons name
  color: string;           // hex color
  filterGroup: "customer" | "company" | "expenses" | "ledger";
  scope: "customer" | "company" | "wallet" | "inventory";
  reportSubtype?: string;  // second-level filter chip key; defaults to canonical kind if absent
};
export const ACTIVITY_KIND_META: Record<ActivityKind, ActivityKindMeta> = { ... };
```
Cover all 18 canonical kinds. Add **new** entries for `payment_to_customer`, `payment_from_company`, `wallet_to_bank`, `bank_to_wallet` — these have no current handlers and are active bugs.

`reportSubtype` is static for most kinds (one kind → one chip key). The `refill` kind is a **runtime exception**: a return-only refill (`buy12=0`, `buy48=0`) shows as chip key `"company_return"`, a normal refill shows as `"company_refill"`. This cannot be encoded statically — it depends on event data.

Create a `getReportSubtype(event)` helper in `activityKindMeta.ts` that:
- Normalizes `event.event_type` via `normalizeEventType()`
- Returns `ACTIVITY_KIND_META[kind].reportSubtype ?? kind` for all kinds except `refill`
- For `refill`: reads `event.buy12` and `event.buy48` at runtime — returns `"company_return"` when both are zero/absent, `"company_refill"` otherwise

This helper replaces `getEventSubtype()` in `reports/index.tsx` for all kinds. The refill runtime case is explicitly carved out here — do not try to encode it as static metadata.

### 4c — `normalizeEventType()`
Create in `activityKindMeta.ts` or a companion utility. The **only** place in the frontend that accepts legacy aliases:
```
"order"              → kind from context
"collection_money"   → "payment_from_customer"
"collection_payout"  → "payment_to_customer"
"collection_empty"   → "customer_return_empties"
"customer_adjust"    → "adjust_customer_balance"
"company_payment"    → "payment_to_company" | "payment_from_company" (context)
"company_adjustment" → "adjust_company_balance"
"adjust"             → "adjust_inventory"
"cash_adjust"        → "adjust_wallet"
"bank_deposit"       → reads transfer_direction to pick "wallet_to_bank" or "bank_to_wallet"
```

### 4d — Wire up consumers
Replace scattered lookups with `ACTIVITY_KIND_META`:
- `SlimActivityRow.tsx` — replace local event-type predicates (`_isCollectionMoney`, `_isCompanyPayment`, `_isWalletAdjust`, etc.) with `normalizeEventType()` and metadata; fix `_isCompanyPayment` which currently misses `payment_from_company`; fix `transitionIntentForEvent` which checks `event.event_type === "customer_adjust"` and silently skips `adjust_customer_balance`
- `SlimActivityRow.tsx` — ensure `payment_from_company` has full parity with `payment_to_company` in all display paths: label, icon, color, grouping, balance transitions, payment ratio, money display; it currently renders as a grey circle with no data
- `EventExpandedPanel.tsx` — normalize these specific branches: `event_type === "bank_deposit"`, `event_type === "cash_adjust"`, `event_type === "adjust_wallet"`; note that after T2 `bank_deposit` will not arrive from the backend, but may still arrive from local adapter events during the T8 migration window
- `CashExpensesView.tsx` — update highlight/display behavior to work with canonical `wallet_to_bank` and `bank_to_wallet` kinds (currently highlights `bank_deposit` and `cash_adjust`)
- `ActivityIcon.tsx` — replace `getActivityIcon()` if-chain
- `eventColors.ts` — `getEventColor()` delegates to meta
- `reports/index.tsx` — replace `getEventGroupKey()` with `ACTIVITY_KIND_META[normalizeEventType(et)].filterGroup`; replace `getEventSubtype()` with `getReportSubtype(event)` from section 4b above
- `customers/[id].tsx` — this file has the same event-type checks in **three separate locations** (filter visibility ~line 283, event filtering ~line 365, row rendering ~line 794); all three must be converted using `normalizeEventType()`; extract a shared local predicate rather than converting each independently; the `e.event_type === "customer_adjust"` check appears in all three and must be replaced in each

Display components must use canonical `event_type` (after normalization), not `transfer_direction`, to determine label, icon, color, or filter grouping.

Note: `frontend/app/(tabs)/add/index.tsx` gets Ticket 4 benefits automatically via `SlimActivityRow` — no direct changes needed there in this ticket.

**Done when:** TypeScript builds; no if-chain or switch in display code branches on a raw event type string; `payment_from_company` renders a correct icon, color, and label; all three filter blocks in `customers/[id].tsx` use normalized kinds.

---

## Ticket 5 — Translation-Ready Activity Labels

**Goal:** Activity labels come from a centralized translation-ready lookup, not hardcoded backend English strings. English is the only active language in this ticket; full language switching is intentionally deferred.

**Preconditions:**
- Ticket 4 done
- Translation lookup foundation (`frontend/lib/i18n/`) does **not** exist yet — this ticket creates the minimal infrastructure needed to add language switching later

**Files:**
- `frontend/lib/i18n/translations.ts` (new)
- `frontend/components/reports/SlimActivityRow.tsx`

**Work:**

### 5a — Create translation-ready foundation
Create `frontend/lib/i18n/translations.ts`:
```typescript
export const translations = {
  en: {
    activities: {
      replacement:              { label: "Replace" },
      sell_full:                { label: "Sell full" },
      buy_empty_from_customer:  { label: "Buy empties" },
      payment_from_customer:    { label: "Payment from customer" },
      payment_to_customer:      { label: "Payment to customer" },
      customer_return_empties:  { label: "Empties from customer" },
      adjust_customer_balance:  { label: "Adjust customer balance" },
      refill:                   { label: "Refill" },
      dist_return_empties:      { label: "Empties to company" },
      buy_full_from_company:    { label: "Buy fulls" },
      payment_to_company:       { label: "Payment to company" },
      payment_from_company:     { label: "Payment from company" },
      adjust_company_balance:   { label: "Adjust company balance" },
      expense:                  { label: "Expense" },
      wallet_to_bank:           { label: "Wallet to bank" },
      bank_to_wallet:           { label: "Bank to wallet" },
      adjust_wallet:            { label: "Adjust wallet" },
      adjust_inventory:         { label: "Adjust inventory" },
    },
    filterGroups: {
      customer: "Customer",
      company: "Company",
      expenses: "Expenses",
      ledger: "Ledger",
    }
  }
};
```
The `event_type` value IS the translation key namespace. No separate `label_key` API field is needed.

Labels are display text only. Direction logic (e.g. which bank transfer direction this event represents) must never be derived from label text — canonical `event_type` is the meaning; translation text is only presentation.

### 5b — Wire in `SlimActivityRow`
Change from:
```typescript
if (event?.label) return event.label;  // backend English overrides — wrong for i18n
```
To:
```typescript
const meta = ACTIVITY_KIND_META[normalizeEventType(event.event_type)];
return t(meta.labelKey) ?? event.label;  // frontend translation lookup primary, backend label as fallback
```

**Out of scope:** Arabic strings, a language selector, persisted language preference, RTL layout wiring, and runtime language switching.

**Done when:** Activity row labels are read through the translation lookup using canonical `event_type` keys; English is the only active language; backend `event.label` is used only as a fallback. Adding Arabic later should require adding translated strings and language-switching infrastructure, not rewriting activity display components.

---

## Ticket 6 — Frontend Balance Wording Renderer

**Goal:** One shared renderer for balance transition wording (e.g. "Money balance: settled → 100 $ debts on customer").

**Files:**
- `frontend/lib/balanceTransitions.ts` (extend existing file)
- `frontend/components/reports/SlimActivityRow.tsx`

**Work:**
Implement the matrix rules:
- Customer-facing and company-facing transitions only
- Cover money, `cyl_12`, `cyl_48`
- Omit settled-to-settled (no change)
- Show changed transitions, unchanged non-zero values
- Apply the code-derived sign wording:
  - Customer money/cylinders: positive = `debts on customer`, negative = `credit for customer`
  - Company money: positive = `debts on distributor`, negative = `credit for distributor`
  - Company cylinders: positive = `credit for distributor`, negative = `debts on distributor`
- Singular/plural (`1 debt`, `2 debts`, `1 credit`, `2 credits`)
- No wording for internal-only events (ledger adjustments with no display counterparty)
- `payment_from_company`: render as the mirror of `payment_to_company` — money received from company into wallet. Use structured `balance_transitions`, not label text, to derive the wording. Apply the existing company money sign rule (positive = debts on distributor, negative = credit for distributor).
- Fix refill hero/action rendering: only show the `Returned:` line when at least one returned quantity is non-zero; never render `Returned: 0x 12kg | 0x 48kg`

**Done when:** `SlimActivityRow` uses the shared renderer; wording is consistent across reports screen, customer detail, and add-screen preview.

---

## Ticket 7 — Frontend Tests Safety Net

**Goal:** Freeze frontend behavior with tests **before** Ticket 8 migrates the adapter. Tests document current legacy output as the baseline — regressions introduced by T8 will be caught here.

**Preconditions:** Tickets 4, 5, and 6 are complete.

**Files:**
- `tests/frontend/__tests__/activityKindMeta.test.ts` (new)
- `tests/frontend/__tests__/activityAdapter.test.ts` (new or extended)
- `tests/frontend/__tests__/slim-activity-row-*.test.tsx` (extend)
- `tests/frontend/__tests__/reports-grouping.test.ts` (new or extended)
- `tests/frontend/__tests__/add-screen.test.tsx` (new or extended)

**Work:**

### 7a — Metadata and normalizer tests
- Assert `ACTIVITY_KIND_META` has an entry for all 18 kinds
- Assert `normalizeEventType()` maps every legacy alias to a canonical kind
- Assert unknown strings pass through unchanged

### 7b — Balance renderer tests
- Cover all matrix rows for quantity and money transitions

### 7c — Adapter output tests (document current state)
For each adapter function, assert the **current** (legacy) `event_type` output — clearly commented as pre-migration baseline:
- `orderToEvent` → currently `"order"`
- `collectionToEvent` → currently `"collection_money"` / `"collection_payout"` / `"collection_empty"`
- `customerAdjustmentToEvent` → currently `"customer_adjust"`
- `companyPaymentToEvent` → currently `"company_payment"` — **highest-risk path**: collapses `payment_to_company` and `payment_from_company` into one kind; direction is lost; `payment_from_company` has zero display handlers
- `companyBalanceAdjustmentToEvent` → currently `"company_adjustment"`
- `inventoryAdjustmentToEvent` → currently `"adjust"` (single) / `"adjust_inventory"` (group)
- `bankDepositToEvent` → currently `"bank_deposit"`

### 7d — Display component tests
- `ActivityIcon` and `SlimActivityRow` for all 18 canonical kinds including `payment_from_company`
- `payment_from_company` row: assert correct label, icon, color, grouping (company), money display, and balance transition wording (mirrors `payment_to_company` with opposite sign)
- `payment_from_company` expanded panel: assert it renders correctly — not a grey circle with empty data
- Reports grouping: `getReportSubtype(event)` produces correct chip key for all kinds; assert the refill/return-only refill runtime split (buy12=0 → `"company_return"`, buy12>0 → `"company_refill"`)
- Customer detail filters: assert all three event-type filter blocks in `customers/[id].tsx` produce consistent results for the same input event

### 7e — Add screen integration
- Explicit coverage for `companyPaymentToEvent` from both payment directions (to company and from company)

### 7f — Bank split compatibility
- Assert `"bank_deposit"` + `transfer_direction="wallet_to_bank"` renders with label "Wallet to bank" via `normalizeEventType`
- Assert `"bank_deposit"` + `transfer_direction="bank_to_wallet"` renders with label "Bank to wallet" via `normalizeEventType`
- Assert canonical `"wallet_to_bank"` renders with label "Wallet to bank" without needing `transfer_direction`
- Assert canonical `"bank_to_wallet"` renders with label "Bank to wallet" without needing `transfer_direction`
- Assert that rendering does **not** parse label text to determine bank direction — direction must come from `event_type` or `transfer_direction`, never from string matching on the label

**Done when:** All tests pass; pre-migration adapter behavior is documented; `npm test` covers all 18 canonical kinds.

---

## Ticket 8 — Frontend Adapter Migration

**Goal:** `activityAdapter.ts` emits canonical `event_type` values only. All display components already handle canonical kinds via Ticket 4.

**Files:**
- `frontend/lib/activityAdapter.ts`
- Update Ticket 7 tests to canonical expectations

**Migration map:**

| Current output | New output |
|---|---|
| `"order"` | `"replacement"` / `"sell_full"` / `"buy_empty_from_customer"` |
| `"collection_money"` | `"payment_from_customer"` |
| `"collection_payout"` | `"payment_to_customer"` |
| `"collection_empty"` | `"customer_return_empties"` |
| `"customer_adjust"` | `"adjust_customer_balance"` |
| `"company_payment"` | `"payment_to_company"` / `"payment_from_company"` (split by direction) |
| `"company_adjustment"` | `"adjust_company_balance"` |
| `"adjust"` (single) | `"adjust_inventory"` |
| `"bank_deposit"` | `"wallet_to_bank"` / `"bank_to_wallet"` |

Also: remove dead `refill.kind === "buy_iron"` check (line 138).

Bank migration rules:
- `bankDepositToEvent()` must emit `"wallet_to_bank"` or `"bank_to_wallet"` — stop emitting `"bank_deposit"`.
- It may retain `transfer_direction` temporarily if the shared `DailyReportEvent` type still declares it during the migration window.
- After T8, no adapter function may emit a legacy alias; canonical `ActivityKind` values only.

**Done when:** `activityAdapter.ts` emits no legacy aliases; Ticket 7 tests updated to canonical expectations; UI walkthrough confirms all add-screen previews render correctly.

---

## Ticket 9 — Cleanup

**Precondition:** Ticket 7 tests pass; UI walkthrough of all activity kinds on both the reports screen and the add screen confirms no regressions.

**Goal:** Remove all dead legacy aliases and backward-compatibility code.

**Files:**
- `frontend/lib/reports/eventColors.ts`
- `frontend/lib/reports/utils.ts`
- `frontend/lib/eventLabels.ts`
- `frontend/lib/activityKindMeta.ts` (normalizeEventType branch cleanup)
- `frontend/lib/activityAdapter.ts`
- `frontend/types/report.ts`
- `frontend/components/reports/EventExpandedPanel.tsx`
- `frontend/components/CashExpensesView.tsx`
- `frontend/app/inventory/new.tsx`
- `backend/app/services/reports_event_fields.py`
- `backend/app/routers/reports.py`
- `backend/app/schemas/report.py`

**Remove:**

| Alias | Location |
|---|---|
| `order` | `eventColors.ts`, `utils.ts` |
| `collection_money`, `collection_payout`, `collection_empty` | `eventColors.ts`, `utils.ts` |
| `customer_adjust` | `eventColors.ts`, `utils.ts` |
| `company_payment`, `company_adjustment` | `eventColors.ts`, `utils.ts` |
| `cash_adjust` (frontend display) | `eventColors.ts`, `utils.ts` |
| `adjust` (legacy) | `eventColors.ts`, `utils.ts` |
| `company_return_empties` | `eventColors.ts`, `utils.ts` |
| `company_buy_iron`, `company_buy_full` | `eventColors.ts`, `utils.ts` |
| `bank_deposit` display branching | `eventColors.ts`, reports components |
| `transfer_direction` | backend response + schema |

Additional cleanup:
- Remove `normalizeBankDepositDisplayEvent()` from `activityAdapter.ts` — it becomes dead after T8 and T2 are both complete.
- Remove all display branches that check `event_type === "bank_deposit"` in `EventExpandedPanel.tsx` and any other display component.
- Remove `transfer_direction` from `frontend/types/report.ts` after backend and adapter both use canonical bank event types and no production path reads the field.
- Remove old highlight event types (`bank_deposit`, `cash_adjust`) from navigation/reveal paths such as `CashExpensesView.tsx` and `frontend/app/inventory/new.tsx`.
- Remove backend bank-deposit compatibility branches from `reports_event_fields.py` after `wallet_to_bank` and `bank_to_wallet` are canonical.
- Re-scan `_company_payment_label` after the T2 label/hero-text consolidation (section 2f). If the consolidation made it still used for hero text and label, keep it. If a post-T2 grep shows it is no longer called, remove it. Do not remove it blindly before T2 is complete.

**Do NOT remove:**
- Backend `source_type="cash_adjust"` and `source_type="inventory_adjust"` — these are DB ledger keys, entirely separate from report event types

**Done when:** No legacy alias appears anywhere in production display code, including `normalizeEventType()`; canonical `ActivityKind` values are the only accepted production display values; all tests pass; build succeeds.

---

## Future API Route Naming

This is intentionally not part of Tickets 2 or 8 because route names are a public API compatibility decision.

Consider adding canonical route aliases in a future API cleanup ticket:
- `/cash/bank_deposit` -> wallet/bank transfer endpoint
- `/cash/bank_deposits` -> wallet/bank transfer listing endpoint
- `/cash/adjust` -> wallet adjustment endpoint
- `/cash/adjustments` -> wallet adjustment listing endpoint

If canonical aliases are introduced, update frontend API hooks and cache keys such as `useBankDeposits`, `frontend/lib/api/expenses.ts`, and `frontend/lib/api/adjustments.ts`.

---

## Summary Table

| Ticket | Area | Key Output | Depends On |
|---|---|---|---|
| T1 | Docs | `ACTIVITY_KIND_NAMING.md` finalized | — |
| T2 | Backend | Canonical event types, aligned labels, bank split | T1 |
| T3 | Backend Tests | 18-kind coverage, contract locked | T2 |
| T4 | Frontend Metadata | `activityKindMeta.ts`, `normalizeEventType()` | T1 |
| T5 | Translation-Ready Labels | `translations.ts`, label wiring in `SlimActivityRow` | T4 |
| T6 | Frontend Balance | `balanceTransitions.ts` shared renderer | T4 |
| T7 | Frontend Tests | Adapter + display coverage, pre-migration safety net | T4, T5, T6 |
| T8 | Frontend Adapter | `activityAdapter.ts` emits canonical kinds only | T4, T7 |
| T9 | Cleanup | Dead aliases removed, `transfer_direction` dropped | T3, T7, T8 |

---

## Database Engineering Track

These tickets address structural database problems identified in the full schema audit (`DATABASE_AUDIT.md`). They are independent of the activity kind naming refactor above but share some dependencies — notably DB-T5 (removing the `mode` column) must run after T8/T9, and DB-T6 (FIFO costing) requires a stable schema.

**Execution order:** DB-T1 → DB-T2 → DB-T3 → DB-T4 → DB-T5 → DB-T6 / DB-T7 (parallel after DB-T5)

| Ticket | Area | Key Output | Depends On |
|---|---|---|---|
| DB-T1 | Ledger Integrity | Ledger posts to correct tenant; source types stable; no duplicate money entries | — |
| DB-T2 | Constraints & Integrity | All uniqueness, FK, and check constraints in place | DB-T1 |
| DB-T3 | Soft Delete & Audit | Safe deletion for core entities; full audit trail | DB-T2 |
| DB-T4 | Tenant Isolation | Config tables per-tenant; sessions and roles scoped; circular FK removed | DB-T3 |
| DB-T5 | Performance & Cleanup | Composite indexes; race condition fixed; structural cleanup | T8, T9, DB-T4 |
| DB-T6 | FIFO Inventory Costing | Accurate per-sale cost tracking; gross profit reporting | DB-T5 |
| DB-T7 | Dedicated Bank Transfers | `bank_transfers` table; migrate deposit rows from `expenses` | DB-T5 |

---

## DB-T1 — Ledger Integrity

**Goal:** Fix the ledger's core correctness before anything else. All work is contained to `posting.py` and one migration.

**Why first:** `_insert_ledger_entries()` currently stamps every ledger entry with `DEFAULT_TENANT_ID` regardless of which tenant created the source transaction. In a multi-tenant deployment this produces wrong balances and wrong reports for every tenant except the default one. This is producing incorrect data right now.

**Work:**

### 1a — Fix tenant isolation in ledger posting
`posting.py` line 174 hardcodes `tenant_id=DEFAULT_TENANT_ID` in `_insert_ledger_entries()`. Change the function signature to accept `tenant_id` as a parameter and pass the source row's `tenant_id` at every call site:
- `post_customer_transaction` → pass `txn.tenant_id`
- `post_company_transaction` → pass `txn.tenant_id`
- `post_inventory_adjustment` → pass `adj.tenant_id`
- `post_expense` → pass `expense.tenant_id`
- `post_cash_adjustment` → pass `adjustment.tenant_id`
- `post_system_init` → pass `tenant_id` parameter (already available at call sites)
- `reverse_source` → pass `tenant_id` parameter

Backfill existing `ledger_entries` rows by joining to source tables on `(source_type, source_id)` and updating `tenant_id`.

### 1b — Protect and verify ledger source types
The six stable `LedgerSourceType` values are:

| Source type | Source table |
|---|---|
| `customer_txn` | `customer_transactions` |
| `company_txn` | `company_transactions` |
| `inventory_adjust` | `inventory_adjustments` |
| `expense` | `expenses` |
| `cash_adjust` | wallet adjustment rows (`cash_adjustments` before DB-T5 rename, `wallet_adjustments` after DB-T5 rename) |
| `system_init` | system initialisation |

These are stable ledger source discriminators. They are **not** activity display kinds and must never be renamed to match `ActivityKind` values. If any migration renamed `cash_adjust → adjust_wallet` or `inventory_adjust → adjust_inventory` in `ledger_entries.source_type`, backfill those rows back to the stable names above.

Keep both `cash_adjust` and `inventory_adjust` in the protected list in Ticket 2 of this file.

Known bad migration to repair: `backend/alembic/versions_v2/n1_rename_activity_kinds.py`.
- The customer/company transaction kind columns (`customer_transactions.kind`, `company_transactions.kind`) were correctly renamed by this migration and should **not** be reversed.
- The ledger-source changes are wrong: `ledger_entries.source_type` was incorrectly renamed from `cash_adjust → adjust_wallet` and `inventory_adjust → adjust_inventory`.
- Add a **standalone** repair migration (e.g. `n2_repair_ledger_source_types.py`) that restores ledger source types: `adjust_wallet → cash_adjust` and `adjust_inventory → inventory_adjust`. Ship this as its own migration immediately — do not bundle with other DB ticket work, as corrupted source types produce incorrect balance reports right now.
- Verify `posting.py`, report source lookups, and ledger integrity checks still write and read `cash_adjust` and `inventory_adjust`.

### 1c — Fix ledger unique constraint NULL trap
The unique constraint `uq_ledger_source_account` covers `(source_type, source_id, account, gas_type, state, unit)`. Because `gas_type` and `state` are nullable, SQL treats two `NULL` values as distinct — allowing duplicate money ledger entries (where both are `NULL`) to bypass the constraint.

Fix options (choose one):
- Replace NULLs with a sentinel string (e.g. `"_"`) and enforce `NOT NULL` on `gas_type` and `state`
- Add `tenant_id` to the constraint and use a partial unique index for money rows

### 1d — Add reversal linkage to ledger entries
`reverse_source()` in `posting.py` creates mirror ledger entries for a reversal but does not link them back to the original entries. Add `reversal_of_id` (nullable FK → `ledger_entries.id`) to `ledger_entries` and populate it in `reverse_source()`.

**Files:**
- `backend/app/services/posting.py`
- `backend/app/models.py` (`LedgerEntry` model)
- New Alembic migration

**Done when:** All ledger entries carry the correct `tenant_id`; `posting.py` writes no `DEFAULT_TENANT_ID`; source types in the DB match the six stable values; money entries cannot be duplicated; reversal entries link back to originals.

---

## DB-T2 — Constraints and Integrity

**Goal:** Make the database reject bad data at the schema level. This is migration-only work — no application logic changes except removing one dangerous default.

**Work:**

### 2a — Tenant-scoped `request_id` uniqueness
`request_id` is currently globally unique on all five operational tables. Two tenants generating the same ID (common with sequential mobile IDs) would cause a collision error. Replace the global unique constraint with a per-tenant composite:

Change `UNIQUE(request_id)` → `UNIQUE(tenant_id, request_id)` on:
- `customer_transactions`
- `company_transactions`
- `expenses`
- `inventory_adjustments`
- `cash_adjustments`

### 2b — Missing uniqueness constraints
Add:
- `UNIQUE(tenant_id, user_id)` on `tenant_memberships` — prevents the same user being added to the same tenant twice
- `UNIQUE(role_id, permission_code)` on `role_permissions` — prevents the same permission being granted to the same role twice
- `UNIQUE(plan_id, key)` on `plan_entitlements` — prevents two conflicting values for the same entitlement key

### 2c — Remove dangerous default on `company_transactions.kind`
`kind` currently defaults to `"refill"`. A code path that forgets to set `kind` silently creates a refill record. Remove the default so a missing `kind` raises a database error.

### 2d — Foreign key from `role_permissions.permission_code` to `permissions.code`
`role_permissions.permission_code` is a plain string — a role can be assigned a permission code that does not exist in the `permissions` table. Add:
```sql
FOREIGN KEY (permission_code) REFERENCES permissions(code)
```

### 2e — Check constraints on string fields
Add check constraints for all fields that accept only a known set of values:

| Table | Field | Allowed values |
|---|---|---|
| `invites` | `status` | `pending`, `accepted`, `expired`, `revoked` |
| `tenant_plan_subscriptions` | `status` | `active`, `cancelled`, `suspended` |
| `billing_events` | `kind` | known billing event types |
| `ledger_entries` | `account` | `cash`, `bank`, `inv`, `cust_money_debts`, `cust_cylinders_debts`, `company_money_debts`, `company_cylinders_debts`, `expense`, `cash_adjustments` |
| `ledger_entries` | `unit` | `money`, `count` |
| `ledger_entries` | `state` | `full`, `empty` (if sentinel approach from DB-T1c is used) |
| `expenses` | `paid_from` | `cash`, `bank` |

Note: `company_transactions.kind` and `expenses.kind` already have check constraints in the migration — verify the model code matches.

### 2f — `gas_type` enforcement across 6 tables
`systems`, `customer_transactions`, `inventory_adjustments`, `ledger_entries`, `price_catalog`, and implicitly `company_transactions` all store `gas_type` as a free string. `system_type_options` exists as the reference table.

Add a check constraint `gas_type IN ('12kg', '48kg')` to all six tables, or add a FK from each to `system_type_options.name`. If the valid gas types are expected to change over time, prefer the FK approach.

### 2g — Per-kind column constraints on `company_transactions`
Many columns on `company_transactions` are meaningless for certain kinds (e.g. a `payment_to_company` row should have `buy12 = 0`). Add check constraints per kind to prevent invalid combinations. At minimum:
- `payment_to_company` and `payment_from_company`: `buy12 = 0 AND buy48 = 0 AND return12 = 0 AND return48 = 0`
- `dist_return_empties`: `buy12 = 0 AND buy48 = 0`

**Files:**
- New Alembic migration
- `backend/app/models.py` (add `sa_column` with constraints where missing)

**Done when:** All uniqueness, FK, and check constraints are in place and verified; `company_transactions.kind` has no default; `pytest` passes.

---

## DB-T3 — Soft Delete and Audit Trail

**Goal:** Enable safe deletion of core entities and fill all missing audit trail columns. All changes are additive — no existing data or behavior is modified.

**Work:**

### 3a — Soft delete on core entities
Add `deleted_at` (datetime, nullable) and `deleted_by` (string, nullable) to:
- `customers`
- `users`
- `tenants`
- `systems` (currently only has `is_active` — add proper soft delete alongside it)

Update all router endpoints that currently hard-delete these records to set `deleted_at` instead. Update all queries that list these records to add `.where(Model.deleted_at == None)`.

### 3b — Missing audit columns
Add the following columns (all nullable, non-breaking):

| Table | Add columns |
|---|---|
| `customers` | `created_by` |
| `users` | `updated_by` |
| `tenants` | `created_by`, `updated_by` |
| `systems` | `created_by` |
| `price_catalog` | `created_by`, `updated_at`, `updated_by` |
| `expense_categories` | `updated_at`, `updated_by` |
| `system_type_options` | `updated_at`, `updated_by` |
| `system_settings` | `updated_at`, `updated_by` |
| `tenant_memberships` | `updated_at`, `updated_by` |
| `plan_entitlements` | `updated_at`, `updated_by` |
| `billing_events` | `updated_at`, `updated_by` |
| `tenant_plan_overrides` | `updated_at`, `updated_by` |
| `tenant_plan_subscriptions` | `cancelled_by` |

Populate `created_by` / `updated_by` from the authenticated user in each relevant router endpoint.

### 3c — Currency code on billing events
Add `currency_code: str` (default `DEFAULT_CURRENCY_CODE`) to `billing_events`. Amount values without a currency are ambiguous in multi-tenant deployments where tenants may use different currencies.

**Files:**
- `backend/app/models.py`
- All router files that create/delete `customers`, `users`, `tenants`, `systems`
- New Alembic migration

**Done when:** Deleting a customer/user/tenant soft-deletes the record; all list endpoints exclude soft-deleted records; all audit columns are populated on writes; `pytest` passes.

---

## DB-T4 — Tenant Isolation of Config Tables

**Goal:** Ensure every tenant-owned piece of data belongs to a tenant. Currently prices, expense categories, system settings, sessions, and tenant-specific roles are shared globally or under-scoped.

**Work:**

### 4a — Add `tenant_id` to shared config tables
Add `tenant_id` (FK → `tenants.id`, non-nullable after backfill) to:
- `price_catalog` — prices are per-business
- `expense_categories` — categories are per-business
- `system_type_options` — gas types may differ per-business

Backfill existing rows with `DEFAULT_TENANT_ID`. Update all read/write endpoints to filter and write by `tenant_id`.

### 4b — Redesign `system_settings` from singleton to per-tenant
`system_settings` has `id = "system"` — a single global row. Replace with per-tenant rows: drop the singleton constraint, add `tenant_id` (FK → `tenants.id`, unique), and migrate the existing row.

### 4c — Add `tenant_id` to `sessions`
When a user belongs to multiple tenants, the session currently has no record of which tenant context it was created in. Add `tenant_id` (nullable FK → `tenants.id`) to `sessions` and populate it at login time.

### 4d — Add `tenant_id` to `roles`
Add nullable `tenant_id` (FK → `tenants.id`) to `roles`. `NULL` = system-wide role; a value = tenant-specific custom role. Existing system roles keep `tenant_id = NULL`. This unblocks custom per-tenant roles.

### 4e — Remove `users.tenant_id`
`users.tenant_id` and `tenant_memberships` both record which tenant a user belongs to — two sources of truth that can disagree. Remove `users.tenant_id`. Use only `tenant_memberships` as authoritative. This also eliminates the circular FK between `users` and `tenants` (which required `use_alter=True`).

**Protected:** `tenants.owner_user_id → users.id` is retained — the circular dependency only existed because of `users.tenant_id`. After 4e it is no longer circular.

### 4f — Cross-tenant FK validation
Composite same-tenant foreign keys are possible, but they require careful schema migration and compatible unique constraints. As the short-term guard, add service-layer assertions that verify `transaction.tenant_id == customer.tenant_id` (and equivalent for system, company) before any insert. Add integration tests that confirm Tenant A's data cannot appear in Tenant B's reports.

**Files:**
- `backend/app/models.py`
- `backend/app/routers/` (all routers that read/write affected tables)
- `backend/app/services/posting.py` (cross-tenant assertions)
- New Alembic migration

**Done when:** Every tenant-owned table has a `tenant_id`; config tables are scoped per tenant; sessions track tenant context; roles support custom tenant roles; `users.tenant_id` column is dropped; cross-tenant tests pass.

---

## DB-T5 — Performance and Structural Cleanup

**Precondition:** T8 and T9 of the activity kind refactoring must be complete before removing `customer_transactions.mode`.

**Goal:** Fix the timestamp race condition, add missing indexes, and clean up structural debt accumulated during development.

**Work:**

### 5a — Fix `allocate_happened_at()` race condition
`posting.py` lines 74–113: the function reads the latest `happened_at` in a one-second window then writes `latest + 1 microsecond`. Two concurrent requests in the same second both read the same value and both write the same timestamp. No constraint prevents the collision.

Fix: wrap the read-increment-write in a DB advisory lock (PostgreSQL `pg_advisory_xact_lock`) or replace with a per-tenant `(day, sequence)` counter on a new `activity_sequence` table.

### 5b — Add composite indexes for report queries
Add the following indexes:

```sql
-- All operational tables (customer_transactions, company_transactions,
-- expenses, inventory_adjustments, cash_adjustments):
CREATE INDEX ON <table> (tenant_id, day, deleted_at, happened_at);

-- Ledger queries:
CREATE INDEX ON ledger_entries (tenant_id, day, happened_at);
CREATE INDEX ON ledger_entries (tenant_id, source_type, source_id);
CREATE INDEX ON ledger_entries (tenant_id, account, customer_id, gas_type, happened_at);
```

### 5c — Protect `day` from drifting
`day` is derived from `happened_at` at write time. If `happened_at` is ever updated without recomputing `day`, the event appears on the wrong day. Enforce consistency via:
- Service-layer rule: any update to `happened_at` must recalculate and update `day`
- Tests asserting `day == derive_day(happened_at)` after every write

### 5d — Create `transaction_groups` parent table
Several operational tables have a `group_id` column that links related transactions (e.g. a refill with multiple components), but no parent table defines what a group is. Do section 5g first to determine which tables retain `group_id`. Then create:

```sql
CREATE TABLE transaction_groups (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  kind        TEXT NOT NULL,
  created_at  DATETIME NOT NULL,
  created_by  TEXT
);
```

Add FK from `group_id` to `transaction_groups.id` on all tables that **retain** the column after section 5g. Do not add the FK to tables where 5g removes `group_id`.

### 5e — Rename `cash_adjustments` table to `wallet_adjustments`
The canonical activity kind is `adjust_wallet`; the table is `cash_adjustments`. Rename the table. Update all references in models, routers, migrations, tests, and posting code.

Important separation:
- Rename the table/model to `wallet_adjustments` / `WalletAdjustment`.
- Update posting account names such as `ACCOUNT_CASH_ADJUST = "cash_adjustments"` to the new table/account terminology if that account is display/report-facing.
- Keep `ledger_entries.source_type = "cash_adjust"` as the stable legacy ledger source discriminator unless a dedicated ledger-source migration explicitly changes all source rows and lookups together. Do not accidentally rename it as part of the table rename.

Blast radius to include:
- Backend model, router, posting, and migration references.
- Backend tests that query `cash_adjustments` directly with SQL.
- `backend/scripts/clear_business_data.py`, which deletes from `cash_adjustments`.
- Any docs or fixture helpers that name the table directly.

### 5f — Remove `customer_transactions.mode`
After T8/T9 confirm no code reads `mode` from `customer_transactions`, drop the column. Run a grep across the codebase to confirm zero references before dropping.

### 5g — Review `group_id` on `cash_adjustments` and `expenses`
Both `cash_adjustments` and `expenses` have a `group_id` column. Verify whether any grouping behavior actually uses these columns (check all routers, posting code, and report queries). If no code reads or writes `group_id` on either table, drop the columns. Do not assume the column is unused — grep first.

**Files:**
- `backend/app/services/posting.py`
- `backend/app/models.py`
- `backend/app/routers/` (any router that updates `happened_at`)
- New Alembic migration

**Done when:** No timestamp collisions possible under concurrent load; report queries use composite indexes; `day` is always consistent with `happened_at`; `transaction_groups` table exists with FKs; `cash_adjustments` is renamed to `wallet_adjustments`; `mode` column is dropped.

---

## DB-T6 — FIFO Inventory Costing

**Precondition:** DB-T5 complete (stable schema). Activity kind refactoring T8/T9 complete (canonical kinds in place).

**Goal:** Record the actual purchase cost of each cylinder batch and use it to calculate real gross profit per sale. Currently the system has no concept of "what did this specific cylinder cost to buy" — profit reports use today's price from the catalog, which is wrong when prices have changed since the last refill.

**How it works:** Every refill creates a cost layer recording the price and quantity of that batch. Sales consume from the oldest layer first (FIFO). Each sale transaction records the weighted average cost of the cylinders it consumed. Gross profit = `total - (installed × buy_price_snapshot)`.

**Work:**

### 6a — Create `inventory_cost_layers` table
```sql
CREATE TABLE inventory_cost_layers (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id),
  gas_type           TEXT NOT NULL,
  buy_price          INTEGER NOT NULL,      -- per cylinder, minor currency units
  quantity_total     INTEGER NOT NULL,
  quantity_remaining INTEGER NOT NULL,      -- decreases as sales consume it
  acquired_at        DATETIME NOT NULL,     -- = refill happened_at
  source_id          TEXT NOT NULL REFERENCES company_transactions(id),
  created_at         DATETIME NOT NULL
);
CREATE INDEX ON inventory_cost_layers (tenant_id, gas_type, acquired_at)
  WHERE quantity_remaining > 0;
```

### 6b — Add `buy_price_snapshot` to `customer_transactions`
```sql
ALTER TABLE customer_transactions
  ADD COLUMN buy_price_snapshot INTEGER;  -- nullable, per-cylinder cost at time of sale
```

### 6c — Refill write path creates a cost layer
In `posting.py` `post_company_transaction()`, after the ledger entries are written, create an `InventoryCostLayer` row for each gas type purchased:
- `buy_price` = `price_catalog.buy_price` looked up at `txn.happened_at`
- `quantity_total` = `txn.buy12` (for 12kg layer) or `txn.buy48` (for 48kg layer)
- `quantity_remaining` = same as `quantity_total`
- One layer per gas type (separate rows for 12kg and 48kg if both bought)

### 6d — Sale write path consumes layers (FIFO)
In `posting.py`, for `replacement` and `sell_full` kinds:
1. Query `inventory_cost_layers` for this `tenant_id` and `gas_type`, ordered by `acquired_at ASC`, where `quantity_remaining > 0`
2. Consume from oldest layer first
3. If one sale spans two layers, calculate weighted average: `buy_price_snapshot = (qty_from_A × price_A + qty_from_B × price_B) / total_installed`
4. Reduce `quantity_remaining` on each consumed layer
5. Store `buy_price_snapshot` on the `CustomerTransaction`

### 6e — One-time backfill migration
Existing inventory (cylinders already in stock before this migration runs) has no cost layer. Create a migration that:
1. Reads current inventory snapshot (`full12`, `full48`) from ledger totals per tenant and gas type
2. Looks up the most recent `price_catalog.buy_price` for each gas type before migration date
3. Inserts a seed `InventoryCostLayer` row for each gas type with `quantity_remaining = current stock count` and `acquired_at = epoch` (so it is consumed before any real refill layers)

### 6f — Revenue report endpoint
Add or extend a report endpoint to return gross profit per day/period:
```
gross_profit = SUM(total - (installed × buy_price_snapshot))
```
Only include rows where `buy_price_snapshot IS NOT NULL` (i.e. sales after this migration).

**Files:**
- `backend/app/models.py` (`InventoryCostLayer` model, `buy_price_snapshot` on `CustomerTransaction`)
- `backend/app/services/posting.py`
- `backend/app/routers/reports.py` (or new revenue report router)
- New Alembic migrations (two: schema + backfill)

**Done when:** Every refill creates cost layers; every replacement/sell_full records `buy_price_snapshot`; gross profit is calculable per transaction; existing inventory is seeded; `pytest` covers FIFO spanning two layers and price-change scenarios.

---

## DB-T7 — Dedicated Bank Transfers Table

**Precondition:** DB-T5 complete (stable schema, `wallet_adjustments` rename done). Activity kind refactoring T2 complete (canonical bank event types in API).

**Goal:** Bank transfers (currently stored as `expenses.kind="deposit"`) are moved to a dedicated `bank_transfers` table. After this ticket, `expenses` stores only real business expenses (fuel, insurance, food, etc.).

**Why separate from DB-T5:** This requires new posting paths, a data migration, updated reporting, and updated delete/reversal logic. It is 3× the scope of the structural cleanup in DB-T5a–5f and should not block that ticket.

**Work:**

### 7a — Create `bank_transfers` table
```sql
CREATE TABLE bank_transfers (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  direction      TEXT NOT NULL CHECK (direction IN ('wallet_to_bank', 'bank_to_wallet')),
  amount         INTEGER NOT NULL,
  note           TEXT,
  happened_at    DATETIME NOT NULL,
  day            TEXT NOT NULL,
  created_at     DATETIME NOT NULL,
  created_by     TEXT,
  updated_at     DATETIME,
  updated_by     TEXT,
  deleted_at     DATETIME,
  deleted_by     TEXT,
  reversal_of_id TEXT REFERENCES bank_transfers(id),
  request_id     TEXT,
  UNIQUE (tenant_id, request_id)
);
CREATE INDEX ON bank_transfers (tenant_id, day, deleted_at, happened_at);
```

### 7b — Migrate existing deposit rows
Write a one-time Alembic migration that copies all `expenses` rows where `kind="deposit"` into `bank_transfers`, deriving `direction` from `expenses.paid_from`: `"cash" → "wallet_to_bank"`, `"bank" → "bank_to_wallet"`. Do not infer direction from label text — `paid_from` is the authoritative DB column. After copying, soft-delete the source rows in `expenses` (set `deleted_at`).

### 7c — Update posting, reporting, and deletion paths
- `posting.py`: add `post_bank_transfer()` that writes to `bank_transfers` and posts ledger entries; remove the `kind="deposit"` path from `post_expense()`
- `reports.py`: read bank transfers from `bank_transfers`, not `expenses`, when building `wallet_to_bank` and `bank_to_wallet` events
- Deletion and reversal: update `reverse_source()` and delete endpoints to handle `bank_transfers`

### 7d — Schema cleanup after migration
After the data migration in 7b is complete and all deposit rows are in `bank_transfers`:
- Drop `expenses.kind` — after migration `expenses` contains only real expenses and the column is a constant; it is no longer needed.
- Decide whether `expenses.vendor` is needed for future vendor reporting. If no feature roadmap requires it, drop it during this cleanup. If vendor tracking is planned, keep it and add it to the audit columns in DB-T3.

### 7e — Tests
- Assert wallet-to-bank and bank-to-wallet transfers are stored in `bank_transfers`, not `expenses`
- Assert `expenses` table contains no rows with `kind="deposit"` after migration
- Assert reporting still produces correct `wallet_to_bank` and `bank_to_wallet` events from `bank_transfers`
- Assert `pytest` passes across all existing bank and expense tests

**Files:**
- `backend/app/models.py` (`BankTransfer` model; update `Expense` model to remove `kind` and optionally `vendor`)
- `backend/app/services/posting.py`
- `backend/app/routers/` (bank transfer create/delete/list endpoints)
- `backend/app/routers/reports.py`
- New Alembic migrations (two: schema + data migration)

**Done when:** All bank transfers live in `bank_transfers`; `expenses` has no `kind` column; `expenses.vendor` decision is made and acted on; posting, reporting, and deletion use the new table; `pytest` passes.
