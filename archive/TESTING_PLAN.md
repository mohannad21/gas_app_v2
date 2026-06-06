# Extended Testing Plan

Built from: proposal.txt (sections 10–13), coverage gap audit, and existing test suite.

---

## Guiding principles (from proposal)

1. **Every ledger-posting activity must appear in the day report** (§10.2.1)
2. **Every event row must be expandable with correct before/after fields** (§10.2.2)
3. **Backend is authoritative; report truth is derived from ledger boundaries, not stale snapshots** (§10.2.3)
4. **Deterministic ordering: happened_at → created_at → id** (§10.2.4)
5. **Edit/delete = reverse + repost; historical reporting must remain correct** (§8.2)

---

## Tier 0 — Smoke tests (NEW)

**Purpose**: Fast sanity check that nothing is broken end-to-end before any deployment or merge.  
**Target runtime**: < 2 minutes.  
**File**: `tests/backend/test_smoke.py`

| # | Test | What it verifies |
|---|------|-----------------|
| S1 | `test_smoke_health` | `GET /health` returns 200 |
| S2 | `test_smoke_inventory_init` | Can initialize inventory; `GET /inventory/latest` returns correct state |
| S3 | `test_smoke_customer_create_and_order` | Create customer → create order → customer appears in `GET /customers` |
| S4 | `test_smoke_collection_posts_to_report` | Create collection → appears in `GET /reports/day` |
| S5 | `test_smoke_refill_posts_to_report` | Create refill → appears in `GET /reports/day` |
| S6 | `test_smoke_expense_posts_to_report` | Create expense → appears in `GET /reports/day` |
| S7 | `test_smoke_company_payment_posts_to_report` | Create company payment → appears in `GET /reports/day` |
| S8 | `test_smoke_customer_balance_updates` | Create customer adjustment → `GET /customers/{id}/balances` reflects it |
| S9 | `test_smoke_company_balance_updates` | Create refill → `GET /company/balances` reflects it |
| S10 | `test_smoke_delete_reverses_report` | Create order → delete it → no longer appears in `GET /reports/day` |

**Run command**:
```bash
cd backend && python -m pytest tests/backend/test_smoke.py -v
```

---

## Tier 1 — Event catalog coverage (PARTIAL — needs gaps filled)

**Purpose**: Verify every activity type posts to the ledger and appears in the day report.  
**Proposal requirement**: §10.2.1 — minimum event set must all appear.

### Already covered (by test_activity_visibility.py)
- order (replacement)
- collection (payment)
- customer adjustment
- refill
- buy_iron (buy full)
- company payment
- cash adjustment
- expense

### Missing from test_activity_visibility.py
**File**: extend `tests/backend/test_activity_visibility.py`

| # | Test | Event type |
|---|------|-----------|
| E1 | `test_bank_deposit_appears_in_day_report` | wallet_to_bank (bank deposit) |
| E2 | `test_collection_payout_appears_in_day_report` | collection_payout |
| E3 | `test_collection_return_empties_appears_in_day_report` | collection with cylinder return |
| E4 | `test_company_settle_appears_in_day_report` | company cylinder settle |
| E5 | `test_inventory_adjustment_appears_in_day_report` | inventory adjust |
| E6 | `test_system_init_appears_in_day_report` | init/opening event |

**Run command**:
```bash
cd backend && python -m pytest tests/backend/test_activity_visibility.py -v
```

---

## Tier 2 — Report correctness (PARTIAL — core gaps)

**Purpose**: Verify the day report returns correct before/after fields for each event type.  
**Proposal requirement**: §10.2.2 — every event is expandable with correct structured fields; §11.5 quality gates.

### Already covered
- Day report contract: `test_day_level3_contract.py` (9 tests)
- Smart ticket wording: `test_day_smartticket.py` (4 tests)
- Reports shape: `test_reports.py`, `test_reports_unit.py`

### Missing
**File**: `tests/backend/test_report_event_fields.py`

| # | Test | What it checks |
|---|------|---------------|
| R1 | `test_order_event_has_customer_before_after` | order event in day report has `customer_money_before`, `customer_money_after` |
| R2 | `test_collection_event_has_customer_before_after` | collection event has customer money fields |
| R3 | `test_refill_event_has_company_before_after` | refill event has company money + cylinder before/after |
| R4 | `test_company_payment_event_has_company_before_after` | company payment event has company money before/after |
| R5 | `test_expense_event_has_cash_before_after` | expense event has cash before/after |
| R6 | `test_bank_deposit_event_has_cash_and_bank` | bank deposit event has both cash and bank before/after |
| R7 | `test_customer_adjustment_event_has_all_three_dimensions` | customer adjustment has money + cyl_12 + cyl_48 before/after |
| R8 | `test_inventory_adjustment_has_inventory_fields` | inventory adjust event has relevant inventory before/after |

**Run command**:
```bash
cd backend && python -m pytest tests/backend/test_report_event_fields.py -v
```

---

## Tier 3 — Historical edit/delete correctness (PARTIAL)

**Purpose**: Verify that editing or deleting a past activity causes later events' report fields to reflect the correct new state.  
**Proposal requirement**: §8.2 — reverse+repost preserves historical reporting; §13 — historical edit/delete report correctness.

### Already covered
- Live customer fields after history changes: `test_live_history_changes.py` (5 tests — customer adjustments, collections, refill boundary)

### Missing — edit paths
**File**: `tests/backend/test_history_edit_correctness.py`

| # | Test | Scenario |
|---|------|---------|
| H1 | `test_order_update_recalculates_later_events` | Update an order's amount → verify customer balance in next event updates |
| H2 | `test_refill_update_recalculates_company_balance` | Update refill total_cost → verify company balance on later company payment updates |
| H3 | `test_collection_delete_recalculates_later_collection` | Delete collection P1 → P2's live_debt_cash updates (customer side) |
| H4 | `test_refill_delete_recalculates_later_refill` | Delete refill R1 → R2's live_debt_cash updates (company side) |
| H5 | `test_backdated_order_shifts_later_balances` | Insert order in the past → all later events' customer balance shifts correctly |
| H6 | `test_backdated_refill_shifts_later_company_balances` | Insert refill in the past → later company payment balance shifts |

**Run command**:
```bash
cd backend && python -m pytest tests/backend/test_history_edit_correctness.py -v
```

---

## Tier 4 — Determinism (PARTIAL)

**Purpose**: Verify that same-timestamp events always produce stable, deterministic before/after states.  
**Proposal requirement**: §5.5 — ordering key is happened_at → created_at → id; §10.2.4.

### Already covered
- Snapshot tiebreaker: `test_snapshot_tiebreaker.py` (1 test)
- Ledger write safety: `test_ledger_write_safety.py` (3 tests)

### Missing
**File**: `tests/backend/test_determinism.py`

| # | Test | Scenario |
|---|------|---------|
| D1 | `test_same_timestamp_orders_stable_order` | Two orders at identical happened_at → before/after values are stable across multiple reads |
| D2 | `test_same_day_events_report_order_stable` | Multiple events on same day → day report event order is identical across repeated requests |
| D3 | `test_boundary_uses_full_triple_not_just_timestamp` | Two events at same happened_at but different created_at → boundary correctly splits them |

**Run command**:
```bash
cd backend && python -m pytest tests/backend/test_determinism.py -v
```

---

## Tier 5 — Edit/delete for untested CRUD operations (NEW)

**Purpose**: Verify that update and delete endpoints work correctly for the resource types currently missing tests.  
**Gap**: inventory adjust update/delete, refill update/delete, cash adjust update/delete, bank deposit delete.

### File: `tests/backend/test_crud_edit_delete.py`

| # | Test | Endpoint |
|---|------|---------|
| C1 | `test_inventory_adjust_update` | `PUT /inventory/adjust/{id}` |
| C2 | `test_inventory_adjust_delete` | `DELETE /inventory/adjust/{id}` |
| C3 | `test_refill_update` | `PUT /inventory/refills/{id}` |
| C4 | `test_refill_delete` | `DELETE /inventory/refills/{id}` |
| C5 | `test_cash_adjust_update` | `PUT /cash/adjust/{id}` |
| C6 | `test_cash_adjust_delete` | `DELETE /cash/adjust/{id}` |
| C7 | `test_bank_deposit_delete` | `DELETE /cash/bank_deposit/{id}` |
| C8 | `test_price_create` | `POST /prices` |

**Run command**:
```bash
cd backend && python -m pytest tests/backend/test_crud_edit_delete.py -v
```

---

## Tier 6 — Expenses (NEW — entire subsystem)

**Purpose**: Expenses are completely untested. They are a core daily-operations feature.

### File: `tests/backend/test_expenses.py`

| # | Test |
|---|------|
| X1 | `test_expense_create_and_list` |
| X2 | `test_expense_delete` |
| X3 | `test_expense_update` |
| X4 | `test_expense_categories_list` |
| X5 | `test_expense_creates_ledger_entry` (verify posting.py post_expense is called) |
| X6 | `test_expense_reduces_cash_balance` |

**Run command**:
```bash
cd backend && python -m pytest tests/backend/test_expenses.py -v
```

---

## Tier 7 — Frontend tests (NEW)

**Purpose**: Verify the frontend wording engine and adapter logic.  
**Proposal requirement**: §13 — wording consistency, preview correctness, day-detail fetch-on-expand.

### Already covered (tests/frontend/__tests__/)
- API error handling, health preflight
- Collections, orders, company payment API calls
- Customer balance invalidation hooks
- Ledger math
- Payment direction wording
- Smart ticket

### Missing
**File**: `tests/frontend/__tests__/activityAdapter.test.ts`

| # | Test |
|---|------|
| F1 | `refillSummaryToEvent uses live_debt_cylinders when available` |
| F2 | `refillSummaryToEvent falls back to stored debt_cylinders when live is null` |
| F3 | `buy_iron event has no cylinder transition` |
| F4 | `customerAdjustmentToEvent uses live_debt_cash when available` |
| F5 | `collectionToEvent uses live_debt_cash when available` |
| F6 | `companyPaymentToEvent renders money pill when live_debt_cash present` |
| F7 | `companyPaymentToEvent renders no pill when live_debt_cash is null` |

**File**: `tests/frontend/__tests__/balanceWording.test.ts`

| # | Test |
|---|------|
| W1 | `positive customer money → "Customer owes you"` |
| W2 | `negative customer money → "You owe customer"` |
| W3 | `zero customer money → settled wording` |
| W4 | `cross-zero transition renders two lines` |
| W5 | `positive company money → "You owe company"` |
| W6 | `negative company money → "Company owes you"` |

---

## Tier 8 — Live balance golden path (NEW — highest value)

**Purpose**: Verify that the balance pills on activity cards stay correct after removing old activities or inserting activities in the past — for both customer and company sides.

### What these tests check

Each activity card in the expanded view shows two distinct sets of numbers:

**Set A — Balance pills** (what these tests verify):
These are the relationship state AFTER this specific event. They update whenever history changes.
- Customer money balance (e.g. "customer money: 0 → 500")
- Customer 12kg balance (e.g. "customer 12kg: 0 → 2")
- Customer 48kg balance
- Company money balance (e.g. "company money: 240 → 90")
- Company 12kg cylinder balance
- Company 48kg cylinder balance

**Set B — Inventory/wallet transitions** (NOT tested here — different mechanism):
These reflect the physical movement from this specific event. They do not change when history is edited.
- 12kg Full: e.g. `71 → 76`
- 12kg Empty: e.g. `32 → 29`
- Wallet: e.g. `-2115 → -2315`

This is the comprehensive end-to-end version of what Ticket 5 started. Now that the company payment delete endpoint exists (added in Ticket 6), the company-side delete case can finally be tested.

**File**: `tests/backend/test_live_balance_golden_path.py`

---

### Customer side — delete path

**Test**: `test_customer_live_balance_after_delete`

```
Setup:
  - Create customer
  - Adjustment A at T=09:00, amount_money=300
    → customer money balance after A = 300
  - Collection P1 at T=10:00, amount=100
    → customer money balance after P1 = 200
  - Collection P2 at T=11:00, amount=50
    → customer money balance after P2 = 150

Verify initial balance pills:
  - A card:  customer money balance = 300
  - P1 card: customer money balance = 200
  - P2 card: customer money balance = 150

Action: delete P1 (DELETE /collections/{p1_id})

Verify balance pills after delete:
  - A card:  customer money balance = 300  (A is before P1 — unchanged)
  - P2 card: customer money balance = 250  (was 150; now 300 - 50 = 250)
```

---

### Customer side — insert past path

**Test**: `test_customer_live_balance_after_past_insert`

```
Setup:
  - Create customer
  - Adjustment A at T=10:00, amount_money=200
    → customer money balance after A = 200

Verify initial balance pill:
  - A card: customer money balance = 200

Action: insert adjustment B backdated to T=09:00, amount_money=100

Verify balance pills after insert:
  - B card: customer money balance = 100  (B is earliest)
  - A card: customer money balance = 300  (was 200; B came first so A captures B+A)
```

---

### Company side — delete path

**Test**: `test_company_live_balance_after_payment_delete`

```
Setup:
  - init_inventory
  - Refill R at T=09:00: total_cost=500, paid_now=0
    → company money balance after R = 500
  - Company payment P1 at T=10:00: amount=200
    → company money balance after P1 = 300
  - Company payment P2 at T=11:00: amount=100
    → company money balance after P2 = 200

Verify initial balance pills:
  - R card:  company money balance = 500
  - P1 card: company money balance = 300
  - P2 card: company money balance = 200

Action: delete P1 (DELETE /company/payments/{p1_id})

Verify balance pills after delete:
  - R card:  company money balance = 500  (R boundary is before P1 — unchanged)
  - P2 card: company money balance = 400  (was 200; now 500 - 100 = 400)
```

---

### Company side — insert past path

**Test**: `test_company_live_balance_after_past_refill_inserted`

```
Setup:
  - init_inventory
  - Refill R1 at T=10:00: total_cost=300, paid_now=0
    → company money balance after R1 = 300

Verify initial balance pill:
  - R1 card: company money balance = 300

Action: insert Refill R2 backdated to T=09:00: total_cost=200, paid_now=0

Verify balance pills after insert:
  - R2 card: company money balance = 200  (R2 is earliest)
  - R1 card: company money balance = 500  (was 300; R2 came first so R1 captures R2+R1)
```

---

### Cross-zero case

**Test**: `test_customer_live_balance_cross_zero_after_history_change`

```
Purpose: verify balance pills are correct when a history change causes the customer
money balance to cross zero (switches from "customer owes you" to "you owe customer").

Setup:
  - Create customer
  - Adjustment A at T=09:00, amount_money=100
    → customer money balance after A = 100
  - Collection P at T=10:00, amount=150
    → customer money balance after P = -50 (you owe customer 50)

Verify initial balance pills:
  - A card: customer money balance = 100
  - P card: customer money balance = -50

Action: insert adjustment B backdated to T=08:00, amount_money=200

Verify balance pills after insert:
  - B card: customer money balance = 200
  - A card: customer money balance = 300  (was 100; now B+A = 300)
  - P card: customer money balance = 150  (was -50; now 300 - 150 = 150)
```

---

**Run command**:
```bash
cd backend && python -m pytest tests/backend/test_live_balance_golden_path.py -v
```

---

## Summary — test tickets to create

| Priority | Ticket | New tests | Targets |
|----------|--------|-----------|---------|
| 1 — Critical | Smoke tests | 10 | Core end-to-end paths |
| 2 — Critical | Live balance golden path | 5 | x→y numbers after delete/insert-past, customer + company |
| 3 — High | Expenses | 6 | Untested subsystem |
| 4 — High | Event catalog gaps | 6 | Proposal §10.2.1 completeness |
| 5 — High | CRUD edit/delete | 8 | Untested update/delete paths |
| 6 — Medium | Report event fields | 8 | Proposal §10.2.2 expandability |
| 7 — Medium | History edit correctness | 6 | Proposal §8.2 / §13 |
| 8 — Medium | Frontend adapter | 14 | Live field rendering logic |
| 9 — Lower | Determinism | 3 | Proposal §5.5 / §10.2.4 |

**Total new tests: ~66**  
**Current total: 200**  
**Target total: ~266**

---

## Full test run groups (for CI or pre-merge)

### Smoke only (< 2 min)
```bash
cd backend && python -m pytest tests/backend/test_smoke.py -v
```

### Live balance correctness (< 2 min — run after any history/ledger change)
```bash
cd backend && python -m pytest -v \
  tests/backend/test_live_balance_golden_path.py \
  tests/backend/test_live_customer_fields.py \
  tests/backend/test_live_company_fields.py \
  tests/backend/test_live_history_changes.py
```

### Core business logic (< 5 min)
```bash
cd backend && python -m pytest -v \
  tests/backend/test_smoke.py \
  tests/backend/test_orders.py \
  tests/backend/test_collection_snapshots.py \
  tests/backend/test_company_transactions.py \
  tests/backend/test_live_customer_fields.py \
  tests/backend/test_live_company_fields.py \
  tests/backend/test_expenses.py
```

### Reports correctness (< 5 min)
```bash
cd backend && python -m pytest -v \
  tests/backend/test_activity_visibility.py \
  tests/backend/test_report_event_fields.py \
  tests/backend/test_day_level3_contract.py \
  tests/backend/test_day_smartticket.py \
  tests/backend/test_reports.py \
  tests/backend/test_reports_unit.py
```

### Full suite (15+ min — use only when needed)
```bash
cd backend && python -m pytest
```
