# REFACTORING TICKET: Reduce Code Complexity & AI Resource Usage

**Scope:** Break up oversized files, remove noise, and standardize naming to reduce token usage and scanning overhead for future AI-assisted work.

**Expected outcome:**
- Largest file: 3,386 lines → ~600 lines
- Search noise: 76K lines removed
- Average file size in hotspots: 2,123 lines → ~400 lines
- AI token usage reduction: 40-60%

**Time estimate:** 3-4 focused sessions

---

## PHASE 1: Cleanup & Naming Fixes (Session 1)

### 1.1 Delete Tracked Noise Files

Remove files that are conversation dumps and add zero product value:

```bash
git rm scripts/codex.txt
git rm scripts/chatgbt.txt
git rm chatgbt_chat.txt
git rm scripts/cloudflared.log
git rm scripts/cloudflared.err.log
git rm qc
git commit -m "chore: remove noise files and conversation dumps"
```

**Why:** These files combined (76K lines) add search noise, confuse grep operations, and waste AI context when scanning the repo. They are tracked artifacts with no ongoing purpose.

**Verify:**
- `git status` shows clean
- `rg "codex.txt|chatgbt" . --count` returns 0

---

### 1.2 Fix Hook Naming Inconsistency

Backend: rename `use-X.ts` (kebab-case) to `useX.ts` (camelCase) to match the rest of the codebase:

```bash
cd frontend/hooks

# Rename hook files
git mv use-theme-color.ts useThemeColor.ts
git mv use-color-scheme.ts useColorScheme.ts
git mv use-color-scheme.web.ts useColorScheme.web.ts

# Update all imports across frontend/
rg "use-theme-color" frontend --type ts --type tsx -l | xargs sed -i 's/use-theme-color/useThemeColor/g'
rg "use-color-scheme" frontend --type ts --type tsx -l | xargs sed -i 's/use-color-scheme/useColorScheme/g'

git commit -m "refactor(hooks): rename to camelCase for consistency"
```

**Why:** Inconsistent naming (kebab-case vs camelCase) confuses both humans and AI tools when determining import conventions. All other hooks use `useX` pattern.

**Verify:**
- `npm run build` passes with no import errors
- Grep for old names returns 0

---

### 1.3 Clarify Backend Router Naming

Decision needed: `system.py`, `system_types.py`, and `systems.py` are confusing because they sound like near-duplicates.

**Current state:**
- `system.py` (214 lines) — ?
- `system_types.py` (68 lines) — ?
- `systems.py` (156 lines) — ?

**Proposed action:**

1. Read each file to understand intent
2. If `system.py` = operations on a single system → rename to `system_detail.py`
3. If `systems.py` = list all systems → rename to `system_list.py`
4. OR consolidate if they belong in one module

**Verify:**
- No other files import by old names (or update imports)
- Run `pytest tests/backend/` to confirm no regressions

---

### 1.4 Remove Unused Report UI Components (from AUDIT_TODO Section 5)

Verify and remove if confirmed unused:

```bash
# Check for references
rg "ActivityIcon|BalancesCard|CollapsibleSectionCard|smartTicket" frontend --type ts --type tsx

# If 0 results, safe to delete:
git rm frontend/components/reports/ActivityIcon.tsx
git rm frontend/components/reports/BalancesCard.tsx
git rm frontend/components/reports/CollapsibleSectionCard.tsx
git rm frontend/lib/reports/smartTicket.ts

git commit -m "chore: remove unused report UI components"
```

**Why:** Dead code clutters the codebase and adds to AI scan overhead.

---

**Commit summary for Phase 1:**
```
chore: phase 1 - cleanup noise, fix naming, remove dead code

- Remove 9 noise/orphaned files (60K+ lines)
- Rename hook files to camelCase for consistency
- Clarify system router naming (system.py, systems.py, system_types.py)
- Remove unused report UI components
- Update .gitignore to prevent noise file re-entry

Estimated cleanup: 70K lines, 10 fewer confusing names
```

---

## PHASE 2: Schema & Type Extraction (Session 2)

### 2.1 Split `backend/app/schemas.py` (997 lines → 5 files × ~200 lines)

**Current structure:** 40+ Pydantic models in one file.

**Target structure:**
```
backend/app/schemas/
├── __init__.py (re-exports all for backward compatibility)
├── customer.py (CustomerOut, CustomerIn, CustomerBalance, etc.)
├── order.py (OrderOut, OrderIn, OrderCreate, etc.)
├── inventory.py (InventoryOut, InventoryAdjustmentOut, etc.)
├── transaction.py (CashAdjustment, Expense, BankDeposit, CompanyPayment, etc.)
└── report.py (ReportDay, ReportLevel3, etc.)
```

**Steps:**

1. Create `backend/app/schemas/` directory
2. Move schema classes to appropriate files based on domain (customer, order, inventory, transaction, report)
3. Update `__init__.py` to re-export all schemas:
   ```python
   from .customer import *
   from .order import *
   from .inventory import *
   from .transaction import *
   from .report import *
   ```
4. Update all imports across `backend/app/routers/` to import from `app.schemas` (not changing import statements, just verifying they still work)
5. Run `pytest tests/backend/` to verify

**Why:**
- Monolithic schema files are hard to scan and slow down AI comprehension
- Domain-grouped schemas make relationships clearer
- Reduces AI token usage per file by 80%

**Verify:**
- `pytest tests/backend/` passes
- `mypy backend/` passes (if type checking is enabled)
- All routers import successfully

---

### 2.2 Split `frontend/types/domain.ts` (879 lines → 5 files × ~175 lines)

**Current structure:** 40+ TypeScript interfaces in one file.

**Target structure:**
```
frontend/types/
├── domain.ts (re-exports all for backward compatibility)
├── domain-customer.ts (Customer, CustomerBalance, etc.)
├── domain-order.ts (Order, OrderCreate, etc.)
├── domain-inventory.ts (Inventory, InventoryAdjustment, etc.)
├── domain-transaction.ts (CashAdjustment, Expense, BankDeposit, etc.)
└── domain-report.ts (DayReport, Level3Report, etc.)
```

**Steps:**

1. Create new `domain-*.ts` files in `frontend/types/`
2. Move interfaces to appropriate files
3. Update `domain.ts` to re-export:
   ```typescript
   export * from "./domain-customer";
   export * from "./domain-order";
   export * from "./domain-inventory";
   export * from "./domain-transaction";
   export * from "./domain-report";
   ```
4. Verify all imports still work (`npm run build`)
5. Run tests

**Why:** Same as backend schemas — reduce AI scanning overhead, make domain relationships clear.

**Verify:**
- `npm run build` passes with no TypeScript errors
- No runtime import failures

---

**Commit summary for Phase 2:**
```
refactor: phase 2 - extract schemas and types into focused modules

- Split backend/app/schemas.py into 5 domain-focused modules
- Split frontend/types/domain.ts into 5 domain-focused modules
- Maintain backward compatibility via re-exports
- Update internal imports and verify tests pass

Reduces schema scan size from 997 to ~200 lines per file
Reduces type scan size from 879 to ~175 lines per file
```

---

## PHASE 3: Component & Screen Extraction (Sessions 3-4)

This phase breaks up the 4 largest source files. **Recommended order:**
1. `AddRefillModal.tsx` (2,252 lines) — self-contained modal
2. `orders/new.tsx` (3,386 lines) — largest, but benefits from modal extraction first
3. `add/index.tsx` (2,764 lines) — mostly done, finish extraction
4. `reports/index.tsx` (1,806 lines) — lower priority

### 3.1 Extract `frontend/components/AddRefillModal.tsx` (2,252 lines)

**Current:** Single file mixing form state, all field variants, and layout.

**Target structure:**
```
frontend/components/AddRefillModal/
├── index.tsx (modal wrapper, ~400 lines)
├── RefillForm.tsx (form state, validation, ~600 lines)
├── RefillTypeSelector.tsx (type picker, ~200 lines)
├── TankFields.tsx (tank quantity inputs, ~300 lines)
├── CylinderFields.tsx (cylinder inputs, ~250 lines)
├── RefillSummary.tsx (total/summary display, ~200 lines)
└── hooks/
    └── useRefillModalState.ts (form state logic, ~150 lines)
```

**Steps:**

1. Create `frontend/components/AddRefillModal/` directory
2. Extract form state logic to `hooks/useRefillModalState.ts`
3. Extract each field section (TankFields, CylinderFields) to its own component
4. Extract RefillTypeSelector to component
5. Extract RefillSummary to component
6. Keep main `index.tsx` as modal wrapper + layout
7. Update imports in screens that use AddRefillModal
8. Run `npm run build` and test

**Why:** Reduces largest component from 2,252 to ~400 lines; each piece is independently understandable.

---

### 3.2 Extract `frontend/app/orders/new.tsx` (3,386 lines)

**Current:** Single screen mixing order form, customer selection, collections table, pricing, edit/create modes.

**Target structure:**
```
frontend/app/orders/
├── new.tsx (root router, state orchestration, ~400 lines)
├── components/
│   ├── OrderFormFields.tsx (customer, date, notes fields, ~300 lines)
│   ├── CustomerSelection.tsx (customer picker + preview, ~250 lines)
│   ├── CollectionsList.tsx (existing collections table, ~400 lines)
│   ├── BottlesExchangeSection.tsx (exchange logic, ~200 lines)
│   ├── PricingCalculator.tsx (price display, ~180 lines)
│   └── OrderSummary.tsx (final review before submit, ~150 lines)
└── hooks/
    ├── useOrderFormState.ts (form state, ~250 lines)
    ├── useOrderValidation.ts (validation rules, ~150 lines)
    └── useOrderSubmit.ts (submit handler, ~100 lines)
```

**Steps:**

1. Create `frontend/app/orders/components/` and `frontend/app/orders/hooks/`
2. Extract form state to hook
3. Extract validation logic to hook
4. Extract submit handler to hook
5. Extract each UI section to component
6. Keep `new.tsx` as orchestrator (fetch customer, initialize state, render components, handle navigation)
7. Run `npm run build` and test

**Why:** Largest file becomes maintainable; each section has one responsibility.

---

### 3.3 Complete `frontend/app/(tabs)/add/index.tsx` (2,764 lines)

**Status:** Partially refactored (delete handlers and collection modal already extracted).

**Remaining work:**

Extract each activity section (refill, collection, expense, cash, bank) to its own component:

```
frontend/app/(tabs)/add/
├── index.tsx (root, ~500-600 lines)
├── components/
│   ├── RefillSection.tsx (refill form + list, ~400 lines)
│   ├── CollectionSection.tsx (collection form + list, ~350 lines)
│   ├── ExpenseSection.tsx (expense form + list, ~300 lines)
│   ├── CashAdjustmentSection.tsx (cash form + list, ~250 lines)
│   ├── BankTransferSection.tsx (bank form + list, ~250 lines)
│   └── ActivityListSection.tsx ✓ (already extracted)
└── hooks/
    ├── useAddEntryDeleteHandlers.ts ✓ (already extracted)
    ├── useRefillForm.ts (~150 lines)
    ├── useCollectionForm.ts (~150 lines)
    ├── useExpenseForm.ts (~150 lines)
    ├── useCashAdjustmentForm.ts (~100 lines)
    └── useBankTransferForm.ts (~100 lines)
```

**Steps:**

1. Extract each section's form state to a dedicated hook (useRefillForm, etc.)
2. Extract each section's UI to a component (RefillSection, etc.)
3. Reduce main `index.tsx` to orchestration + layout (~500-600 lines)
4. Run `npm run build` and test

**Why:** Complete the refactoring started earlier; reduce main file to scannable size.

---

### 3.4 Extract `frontend/app/(tabs)/reports/index.tsx` (1,806 lines)

**Current:** Daily reports screen with day picker, card list, expand/collapse logic, all interactions.

**Target structure:**
```
frontend/app/(tabs)/reports/
├── index.tsx (root, day picker, layout, ~350 lines)
├── components/
│   ├── DayReportCard.tsx (single day card with tap/expand, ~350 lines)
│   ├── DayBalanceSummary.tsx (balance display, ~150 lines)
│   ├── ActivityTimeline.tsx (activity list within day, ~200 lines)
│   └── ReportExpandedView.tsx (tapped day detail pane, ~300 lines)
└── hooks/
    └── useReportNavigation.ts (expand/collapse/navigate logic, ~100 lines)
```

**Steps:**

1. Extract navigation logic to hook
2. Extract DayReportCard to component (handles tap/expand for single day)
3. Extract BalanceSummary to component
4. Extract ActivityTimeline to component
5. Extract ReportExpandedView to component (for expanded day details)
6. Keep `index.tsx` as day picker + layout orchestrator
7. Run `npm run build` and test

**Why:** Reduces main file from 1,806 to ~350 lines; each component focuses on one view/interaction.

---

### 3.5 Extract `backend/app/routers/reports.py` (3,265 lines)

**Current:** Daily + level3 reports, all queries and responses in one file.

**Target structure:**
```
backend/app/routers/
├── reports_daily.py (~1,200 lines)
│   ├── list_daily_reports endpoint
│   ├── get_daily_report_detail endpoint
│   └── Daily report queries/responses
├── reports_level3.py (~1,400 lines)
│   ├── list_level3_reports endpoint
│   ├── get_level3_report_detail endpoint
│   └── Level3 report queries/responses
└── _reports_shared.py (~500 lines)
    ├── Shared report queries (used by both daily and level3)
    ├── Common date range helpers
    └── Shared response builders
```

**Steps:**

1. Create `reports_daily.py`, `reports_level3.py`, `_reports_shared.py`
2. Move daily report endpoints to `reports_daily.py`
3. Move level3 endpoints to `reports_level3.py`
4. Extract common queries/helpers to `_reports_shared.py`
5. Update `backend/app/main.py` to import from both modules
6. Run `pytest tests/backend/test_reports*.py` to verify

**Why:** Reduces single router from 3,265 to <1,500 lines per file; clearer ownership.

---

**Commit strategy for Phase 3:**

Make one commit per extraction for easy review:

```
refactor(add-refill-modal): extract form state and field components

refactor(orders-new): extract form state, validation, and field components

refactor(add-screen): complete section extraction (refill, collection, expense, cash, bank)

refactor(reports-screen): extract day card and timeline components

refactor(backend-reports): split daily and level3 reports into focused modules
```

---

## Verification & Testing

After each phase, run:

```bash
# Frontend
npm run build
npm run test              # if applicable

# Backend
pytest tests/backend/
mypy backend/            # if enabled

# Both
git status               # should show only intended changes
```

---

## Files That Should NOT Be Deleted

These are referenced in `AUDIT_TODO.md` but should be **kept** (either tracked or untracked):

- `AUDIT_TODO.md` — untracked, master audit list for planning
- `CODEX_TICKET_V2.md` — tracked, current working ticket
- `proposal.txt` — untracked, archived reference
- `proposal_todos.txt` — untracked, archived reference
- `scripts/frontend.txt` — untracked, local reference
- `scripts/backend.txt` — untracked, local reference

These files can remain in the working directory but do not need to be committed.

---

## Success Criteria

After all phases complete:

- [ ] Largest source file <600 lines
- [ ] All noise files deleted (scripts/codex.txt, etc.)
- [ ] Hook naming consistent (useX pattern)
- [ ] Schemas split into 5 domain-focused modules
- [ ] Types split into 5 domain-focused modules
- [ ] Top 4 screens/components reduced to <600 lines each
- [ ] All tests pass
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] `pytest tests/backend/` succeeds
- [ ] All imports work correctly after refactoring

---

## Related AUDIT_TODO Items Addressed

This ticket directly addresses:

- **Section 2 (Source of truth, ownership, architecture):**
  - Break down oversized route files by responsibility ✓
  - Split frontend/lib/api.ts by domain (Phase 2 prep)
  - Backend router consolidation ✓

- **Section 3 (Standardize and centralize repeated patterns):**
  - Extract shared hook implementations (Phase 3)
  - Centralize UI patterns and components (Phase 3)

- **Section 5 (Cleanup / dead code):**
  - Remove unused report-layer files ✓
  - Remove old ASCII-art comments and debug logs (during extraction)
  - Remove or gate debug logs in production paths (during extraction)

---

**Next Steps After Refactoring:**

Once this ticket is complete, prioritize from `AUDIT_TODO.md`:
1. Section 1: Security, correctness, state integrity fixes
2. Section 1.3: Cache invalidation and query key standardization
3. Section 2: Remaining architecture improvements (Source of truth ownership)
