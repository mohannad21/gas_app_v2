# Master Audit TODO

Consolidated from the full audit thread in this conversation, including the earlier Codex audits plus the follow-up Gemini and ChatGPT issue lists. Overlaps are merged where appropriate, but distinct issues are preserved when they affect different files, workflows, or risk types.

---

## 0) Infrastructure Epics — Complete

These are fully merged to `main`. Do not re-open or re-implement.

- ✅ **Epic 1 — DB Foundation** — `tenant_id` on all tables, `updated_at`/`created_by`/`updated_by`/`group_id` audit columns, `deleted_at` soft-delete replacing `is_reversed`. Migrations: `g1`, `g2`, `g3`.
- ✅ **Epic 2 — Authentication** — `users`, `sessions`, `activation_challenges` tables; JWT middleware on all routes; login/logout/password-change flow; persistent sessions; Change Password screen. Migration: `h1`.
- ✅ **Epic 3 — Tenant Isolation** — All routes scoped to `tenant_id` via `get_tenant_id` dependency; `require_write_access` plan enforcement on all protected routes. No separate migration.
- ✅ **Epic 4 — Plans & Billing** — `plans`, `plan_entitlements`, `tenant_plan_subscriptions`, `tenant_plan_overrides`, `billing_events` tables; developer billing API; Plan & Billing screen in Account tab. Migration: `i1`.
- ✅ **Epic 5 — Workers, Roles & Permissions** — `roles`, `permissions`, `role_permissions`, `tenant_memberships`, `invites` tables; `require_permission()` enforced on all write routes; worker invite/activate flow; Workers screen in Account tab. Migration: `j1`.
- 🔄 **Epic 6 — Profile Tab** — `k1` migration (tenant business profile fields) created locally, not yet committed. E6-2 (Business Profile screen) and E6-3 (Configuration screens) not yet implemented.

**Also done outside epics (commit `41eb737`):**
- ✅ `frontend/lib/api.ts` split into domain files under `frontend/lib/api/` (clients, orders, customers, inventory, etc.)
- ✅ Backend service extraction: `order_helpers.py`, `inventory_helpers.py`, `reports_aggregates.py`, `reports_event_fields.py`

**Cache invalidation audit (commit `95ca8a0`):**
- ✅ `["company", "balances"]` invalidation added to `useCash.ts`, `useExpenses.ts`, `useBankDeposits.ts`

---

## Background: Recent Work (Fix-Order-Idempotency Branch)

**Issues Addressed Before Refactoring:**
- ✅ Order idempotency: standardize `request_id` end-to-end to prevent duplicate orders on retry
- ✅ Protected flow hardening: add authentication/authorization to sensitive backend routes
- ✅ Failure handling and operational UX: improve error messaging and recovery flows
- 🔄 Codebase maintainability: large component files (2K-3K+ lines) making changes difficult and slowing AI token usage

**Refactoring Trigger:**
The large component files (AddRefillModal 2,252 lines, orders/new 3,386 lines, etc.) and 80K+ lines of noise files made the codebase hard to navigate and expensive to work with. Phase 1-3 refactoring addresses this by:
1. **Phase 1:** Cleanup noise files and normalize naming (70K+ lines removed)
2. **Phase 2:** Extract schemas/types into focused domain modules (16 new modules)
3. **Phase 3:** Extract state management from oversized components into reusable hooks

**Current Status:** Phase 3 state extraction started with AddRefillModal. See "Frontend architecture" section for progress.

## 1) Fix now - security, correctness, and state integrity

### Security / privacy
- ✅ Add authentication and authorization to sensitive backend routes — done in Epic 2 (JWT on all routes) and Epic 5 (`require_permission` on all write routes).
- [ ] Remove checked-in secrets and credentials; rotate any exposed values.
  - [ ] `backend/.env`
  - [ ] `backend/.env.test`
  - [ ] `backend/alembic.ini`
  - [ ] `frontend/.env`
  - [ ] repo-root `.env`
- ✅ Remove insecure config defaults in `backend/app/config.py`:
  - ✅ default database URL
  - ✅ default JWT secret
  - ✅ `debug=True` by default
  - ✅ permissive CORS defaults
- ✅ Restrict CORS to explicit origins; do not combine wildcard origins with credentialed environments.
- [ ] Stop logging PII and sensitive operational data:
  - [ ] customer create/update payloads
  - [ ] phone numbers
  - [ ] WhatsApp share URLs / message content
  - [ ] noisy frontend request/endpoint logs
  - [ ] system payload/result logs in frontend hooks
  - [ ] SQL echo / debug-heavy DB logs outside local development
- [ ] Stop surfacing raw backend `detail` payloads directly to users; map them to safe user-facing messages.
- ✅ URL-encode WhatsApp message text before generating share URLs.
- [ ] Minimize sensitive content in WhatsApp share links and stop logging them.
- [ ] Gate API/debug logging behind environment flags.
- [ ] Remove hardcoded private/local API endpoints from committed frontend config and examples.

### Correctness / workflow integrity
- ✅ Fix broken order idempotency wiring: standardize `request_id` end-to-end so duplicate submits do not create duplicate orders.
- [ ] Add frontend idempotency support for collection/payment/return flows where backend already supports it.
- [ ] Stop rendering bogus order detail before/after balance fields until backend supplies real values, or populate them correctly.
- [ ] Make backend customer-deletion rules the single source of truth and align frontend prechecks/messaging with `customer_has_transactions` behavior.
- [ ] Recalculate or validate order totals on the backend instead of trusting client-sent `total_price` blindly.
- [ ] Wrap financial multi-step backend writes in single DB transactions; remove partial multi-commit flows that can leave ghost balance changes.
- [ ] Make balance-affecting backend updates concurrency-safe; avoid read-modify-write races on customer/company balances.
- ✅ Add typed request validation for `backend/app/routers/inventory.py` `init_inventory` instead of raw `dict` + `int(...)` coercion.
- ✅ Add explicit backend validation for action-specific collection rules:
  - ✅ payment / payout requires positive amount
  - ✅ return requires positive quantity
- [ ] Decide and enforce one wallet insufficiency rule across wallet-to-bank, expense, company payment, and refill flows.
- ✅ Use a live customer balance source in `frontend/app/orders/[id]/edit.tsx` instead of relying on potentially stale customer list balances.

### State synchronization / cache consistency
- ✅ Invalidate `["customers", "balance", customerId]` after all customer-affecting mutations:
  - ✅ orders
  - ✅ collections
  - ✅ customer adjustments
- [ ] Refresh customer-balance preview after "Save & Add More" payment/return flows so the next entry uses current debt.
- ✅ Invalidate `["company", "balances"]` after all mutations that affect company money/cylinder balances — done in commit `95ca8a0` for `useCash.ts`, `useExpenses.ts`, `useBankDeposits.ts`.
- [ ] Make one layer the sole owner of report-day detail fetching and cache mutation; remove duplicate fetch/write paths between the reports hook and reports screen.
- [ ] Stop relying on local screen-only refetches after deletes/updates; make hook-level invalidation complete and authoritative.
- [ ] Review customer deletion invalidation so related detail/balance/system caches do not stay stale.
- [ ] Review expense/bank-deposit invalidation against cash/balance summary screens and align if those summaries depend on those mutations.
- [ ] Complete query invalidation coverage for related surfaces such as reports, inventory, company balances, and customer balances instead of relying on each hook to remember every downstream consumer.

### Duplicate-submit / race protections
- [ ] Disable critical save buttons while mutations are pending across forms that still allow repeated taps.
- [ ] Add stronger pending-state protection for edit/delete modals and critical operational actions.
- [ ] Prevent report-day stale/null overwrites caused by competing async fetches.
- [ ] Standardize chronological ordering on activity screens to prefer business-effective timestamps over `created_at`.
- [ ] Review price-save flows, collection edits, and other sequential saves for double-submit and out-of-order response risks.

### Recovery / resilience
- [ ] Add local `try/catch` or equivalent recovery handling around `mutateAsync` calls that currently rely only on hook-level toasts.
- [ ] Add explicit partial-success handling for multi-save flows such as "Save all prices".
- [ ] Distinguish report-day loading, loaded-empty, and failed states instead of overloading `null`.
- [ ] Improve startup recovery when initial system/settings fetch fails; show explicit error + retry path.
- [ ] Revisit the blocking `/health` preflight in `frontend/lib/api.ts` so transient health failures do not block all requests.
- [ ] Add clearer offline / slow-network behavior and user guidance for failed submissions.
- [ ] Make date-moving edit/reversal flows explain that an item may disappear from the current day and reappear elsewhere.
- [ ] Add retry/reset affordances for failed mutation forms that otherwise leave the user in-place with stale partial state.

### Operational safety
- [ ] Add destructive confirmation before deleting orders and other high-impact ledger-affecting actions.
- [ ] Add confirmation before report-row delete/reverse actions where they still trigger immediately.
- [ ] Replace misleading destructive-action wording that still refers to "mock data" in real flows.
- [ ] Strengthen feedback for important financial/inventory actions so users can tell whether save/delete/edit succeeded, failed, or is still pending.
- [ ] Review visual distinction and wording between expense, payment, transfer, and related money-moving actions so they are less likely to be confused during operation.

## 2) Fix next - source of truth, ownership, architecture

### Source of truth / ownership
- [ ] Make one authoritative owner for transactional date/time per workflow instead of splitting between local UI state, form state, and submit shaping.
- [ ] Make backend the authoritative source for "business day / current business date" instead of letting frontend and backend each decide "today".
- [ ] Centralize customer balance conversion/derivation logic used in create/edit customer flows.
- [ ] Pick one authoritative frontend source for customer balances and order counts; stop mixing list payload values, detail payloads, and dedicated balance endpoints ad hoc.
- [ ] Centralize report event display metadata (label, icon, color) so the same event type is not described in multiple places.
- [ ] Standardize timestamp vocabulary across the stack:
  - [ ] `happened_at`
  - [ ] `effective_at`
  - [ ] `delivered_at`
  - [ ] `created_at`
  - [ ] plain `date`
- [ ] Clarify whether `next_security_check_at` is intentionally persisted derived state or should only be computed from base fields.
- [ ] Keep backend validation authoritative for security-check rules and centralize the frontend version into one shared system-form implementation.
- [ ] Consolidate shared grouped transaction/idempotency rules between customer collections and customer adjustments once covered by tests.
- [ ] Choose one owner for customer deletion constraints, balance displays, and order-count semantics across list/detail screens and backend read models.

### Frontend architecture

**Phase 3 Refactoring Status (In Progress)**
- [x] Extract AddRefillModal state management into useRefillFormState hook
  - Status: ✅ COMPLETE (Commit 68a834f)
  - Lines reduced: 2,252 → 2,111 (141 lines saved)
  - Hooks extracted: 17+ (date/time, cylinder amounts, pricing, form state)

- [x] Extract orders/new.tsx state management into focused hooks
  - Status: ✅ COMPLETE (Commit 035d1a4)
  - Component reduction: 3,386 → 3,379 lines (7 lines)
  - Hooks created: 4 focused hooks (189 lines total)
    - useOrderDateTimeState: delivery/collection date+time (8 states + 1 effect)
    - useInitInventoryModal: init inventory modal state (4 states)
    - useOrderPriceOverride: price override flags (6 states)
    - useOrderKeyboardLayout: keyboard/layout tracking (6 states + keyboard listener effect)
  - Pattern: Simple state-only hooks, complex effects with dependencies kept in component

- [x] Extract reports/index.tsx state management into focused hooks
  - Status: ✅ COMPLETE (Commit c91b220)
  - Component reduction: 1,806 → 1,765 lines (41 lines saved)
  - Hooks created: 3 focused hooks (223 lines total)
    - useExpenseModal: expense form state (8 states + resetExpenseForm helper)
    - useDaySelection: selected date + event keys (2 states + 1 effect for sync)
    - useRevealShelf: reveal/shelf animations (4 states + 6 animated refs + 4 animation effects)
  - Pattern: Simple state-only hooks, animations encapsulated with self-contained effects

- [x] Extract add/index.tsx state management into focused hooks
  - Status: ✅ COMPLETE (Commit de63835)
  - Component reduction: 2,764 → 2,660 lines (104 lines saved)
  - Hooks created: 4 focused hooks (275 lines total)
    - useActivityFilters: mode and 5 filter states (6 states + 1 effect for category reset)
    - useCollectionEdit: collection form state (6 states + resetCollectionForm helper)
    - useDeleteConfirm: delete confirmation flow (2 states + markDeleting/unmarkDeleting helpers)
    - usePriceModal: price modal with server hydration (5 states + 1 ref + 2 effects for hydrate/close)
  - Pattern: Simple state-only hooks, complex hydration logic with external data parameter
- [ ] Move report-day orchestration fully into the report hook/API boundary; keep the screen focused on presentation.
- ✅ Split `frontend/lib/api.ts` by domain — done in commit `41eb737`; now lives in `frontend/lib/api/` with `client.ts`, `orders.ts`, `customers.ts`, `inventory.ts`, etc., re-exported from `index.ts`.
- [ ] Stop exposing raw internal setters from hooks like `useDailyReportScreen` when that weakens ownership boundaries.
- [ ] Reduce prop-drilling in the reports tree where components are only passing through data.
- [ ] Extract a shared `SystemForm` so create/edit system flows do not drift.
- [ ] Remove duplicate normalization/dedupe responsibilities where hooks and consumers both perform the same cleanup.
- [ ] Move non-route reusable pieces out of route modules such as `frontend/app/(tabs)/add/index.tsx`.

### Backend architecture
- ✅ Move repeated business workflow logic out of routers into focused services/helpers — done in commit `41eb737`: `order_helpers.py`, `inventory_helpers.py`, `reports_aggregates.py`, `reports_event_fields.py` extracted.
- [ ] Centralize backend reversal mechanics used across orders, collections, expenses, cash, and inventory.
- [ ] Centralize backend datetime/date parsing helpers used across company, inventory, cash, and expenses routers.
- [ ] Centralize repeated DTO mapping patterns where routers repeatedly build output schemas field-by-field.
- [ ] Clarify API/module naming boundaries between:
  - [ ] `system`
  - [ ] `systems`
  - [ ] `system/types`

## 3) Standardize and centralize repeated patterns

### Shared utilities / helpers
- [ ] Extract one shared Axios/backend error parser and use it across mutation hooks/screens.
- [ ] Introduce small shared invalidation helpers by domain impact instead of hand-building invalidation bundles in each hook.
- [ ] Move repeated local date/time helpers into shared utilities:
  - [ ] today Y-M-D helper
  - [ ] current HH:MM helper
  - [ ] safe timestamp parsing / sorting helpers
- [ ] Centralize formatting ownership for money, counts, and dates.
- [ ] Standardize expense-category vocabulary with one shared source for ids, labels, and display metadata.
- [ ] Standardize loading, empty, and error-state UI patterns across query-driven screens.
- [ ] Centralize common event/icon/display mappings if both report-row and legacy report helpers still participate anywhere.

### Shared UI pieces
- [ ] Extract shared `CalendarModal` and `TimePickerModal` used in multiple screens.
- [ ] Extract shared iOS numeric keyboard accessory / Done bar if individual screens still duplicate it.
- [ ] Extract shared query error / retry state components for the repeated retry boxes.
- [ ] Extract shared entry-form primitives only where they clearly help ownership:
  - [ ] date/time section
  - [ ] money entry box
  - [ ] quantity delta box
- [ ] Centralize common stepper/button configs if they are meant to stay consistent across screens.
- [ ] Standardize compact action/icon button behavior with accessible labels and consistent hit areas.

### Tests / verification structure
- [ ] Add focused tests around backend-authoritative business rules:
  - [ ] customer deletion constraints
  - [ ] security-check behavior
  - [ ] reversal/posting flows
  - [ ] action-specific collection validation
  - [ ] business-day/date ownership
- [ ] Add tests for cross-screen invalidation and stale-state risks:
  - [ ] customer balance refresh after payment/order/adjustment
  - [ ] company balance refresh after refill/inventory changes
  - [ ] report-day ownership and refetch behavior
- [ ] Reduce duplicated frontend test setup by introducing shared render/mock helpers where possible.

## 4) Accessibility, layout, and usability

### Accessibility
- [ ] Add accessibility labels/roles/hints to icon-only and custom interactive controls.
- [ ] Review custom calendar/time cells and modal overlay controls for explicit selected-state and screen-reader semantics.
- [ ] Improve modal accessibility: focus handling, close control semantics, and predictable screen-reader behavior.
- [ ] Increase touch target sizes or add `hitSlop` for dense action controls.
- [ ] Make toast/error feedback accessible to assistive technologies.
- [ ] Review color-only meaning and ensure important status/action meaning has text/icon backup.
- [ ] Standardize accessibility expectations so similar controls are either all labeled or all built on shared accessible primitives.

### Layout / device robustness
- [ ] Add safe-area-aware bottom spacing for absolute footers and floating controls.
- [ ] Verify keyboard avoidance for forms and modals, especially on iOS.
- [ ] Verify reports/add screens on small devices, large text, and home-indicator devices.
- [ ] Verify bottom controls do not overlap tab bars, gesture areas, or content.
- [ ] Review root/layout-level safe-area handling so bottom edges are not left to each screen ad hoc.

### Product / operational clarity
- [ ] Make expense vs payment vs transfer actions more visually and verbally distinct where confusion is plausible.
- [ ] Review external-share flows so users understand exactly what data is being sent out of the app.

## 5) Cleanup / dead code / verify-before-delete

### Safe cleanup candidates

**Phase 1 Cleanup Status (Completed)**
- [x] Fix import paths for renamed hooks (use-color-scheme → useColorScheme)
  - Status: ✅ COMPLETE (Commit 83fed60)
  - Files fixed:
    - frontend/app/(tabs)/_layout.tsx
    - frontend/hooks/useThemeColor.ts
  - Reason: Phase 1 cleanup renamed hooks from kebab-case to camelCase but didn't update all import statements

- [ ] Remove unused report-layer files if confirmed with final grep/tests:
  - [ ] `frontend/components/reports/ActivityIcon.tsx`
  - [ ] `frontend/components/reports/BalancesCard.tsx`
  - [ ] `frontend/components/reports/CollapsibleSectionCard.tsx`
  - [ ] `frontend/lib/reports/smartTicket.ts`
- [ ] Remove `frontend/hooks/use-theme-color.ts` if still unused (after verifying no other references).
- [ ] Remove leaked AI repair comments and stale scaffold/template comments.
- [ ] Remove ASCII-art comment blocks from `frontend/components/AddRefillModal.tsx` (during Phase 3 component extraction).
- [ ] Remove or gate leftover debug logs in production-path code.

### Verify before removal
- [ ] Verify and remove unused backend stubs/helpers if there are no external callers:
  - ~~`backend/app/auth.py`~~ — this is now core auth infrastructure (113 lines: JWT, `get_current_user`, `get_tenant_id`, `require_permission`). Do not remove.
  - [ ] `backend/app/logging_config.py`
  - [ ] `backend/app/utils/locks.py`
- [ ] Remove or split the unused hook implementation in `frontend/hooks/useInventoryActivity.ts` while preserving any still-used type exports.
- [ ] Verify whether V1 activity schemas/types in `frontend/types/domain.ts` are unused, then remove them if confirmed.
- [ ] Verify whether these isolated/dev/admin routes are still intentionally used, then remove them if not:
  - [ ] `frontend/app/customers/index.tsx`
  - [ ] `frontend/app/prices/index.tsx`
  - [ ] `frontend/app/system-health.tsx`
  - [ ] `frontend/hooks/useSystemHealthCheck.ts`
  - [ ] `frontend/app/dev/level3.tsx`
  - [ ] `frontend/dev/level3-fixtures.ts`
  - [ ] `frontend/constants/level3.ts`
- [ ] Reconcile the backend expense schema split in `backend/app/schemas.py` and `backend/app/routers/expenses.py`:
  - [ ] decide whether `ExpenseCreateLegacy` / `ExpenseOutLegacy` are the real current schemas
  - [ ] delete or rename unused sibling schemas
- [ ] Verify whether active placeholder tabs/routes should remain intentionally:
  - [ ] `frontend/app/(tabs)/dashboard.tsx`
  - ~~`frontend/app/(tabs)/account/index.tsx`~~ — Account screen is now fully built (Business Profile, Subscription, Team, Configuration, Security, Sign Out). Not a placeholder.

### Structural cleanup
- [ ] Move non-route component exports out of route files.
- [ ] Remove standalone duplicated modal/component implementations once shared versions exist.
- [ ] Verify whether route-level reusable exports such as customer sections in `app/(tabs)/add/index.tsx` should move into dedicated component files.

## 6) Explicit verify-first scenarios
- [ ] Double-tap order save under slow network; verify only one order is created.
- [ ] Double-tap payment/return/expense/refill/company-payment save; verify duplicate protection.
- [ ] Record payment with "Save & Add More," then enter a second payment immediately; verify preview is refreshed.
- [ ] Delete/edit refill or inventory adjustment and verify company summary cards update immediately.
- [ ] Expand a report day, switch dates quickly, and refocus the screen; verify no stale/null overwrite or flicker.
- [ ] Edit an order/collection to an older effective date; verify activity/report ordering uses business time.
- [ ] Delete a customer with no orders but with another unreversed transaction; verify frontend matches backend rule/message.
- [ ] Submit malformed `init_inventory` payloads and verify clean 4xx responses.
- [ ] Test zero/partial collection payloads for payment/payout/return against backend validation.
- [ ] Fail one row during "Save all prices" and verify partial-success UX is explicit and recoverable.
- [ ] Verify expense-category filter behavior when primary expense filter is "All".
- [ ] Verify offline / slow-network submission behavior and retry guidance.
- [ ] Verify modal keyboard avoidance, bottom safe area, and small-screen usability.

## 7) Additional verify / document tasks
- [ ] Document the intended ownership of:
  - [ ] customer balances
  - [ ] customer order counts
  - [ ] company balances
  - [ ] report-day cache state
  - [ ] business-date calculation
- [ ] Document whether negative wallet / negative inventory / negative company balance states are intentional and where they are allowed.
- [ ] Document whether `next_security_check_at` is persisted for query/performance reasons or should remain derived-only.

## 8) Recommended execution order
1. Fix high-severity security/privacy issues.
2. Fix correctness issues that can corrupt visible totals, balances, counts, or ledger integrity.
3. Fix stale-state and cache invalidation gaps.
4. Fix duplicate-submit / race / out-of-order response risks.
5. Fix operational-safety issues around deletes, edits, and user messaging.
6. Fix source-of-truth and ownership problems.
7. Standardize naming, formatting, and repeated helpers/components.
8. Clean up dead code and verify-before-delete leftovers.
9. Then tackle larger architecture splits (`Add` screen, `Reports` screen, API module, router-heavy backend workflows).
