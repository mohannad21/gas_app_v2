# Ticket — Schema rename and dead code cleanup

## Branch
Continue on `feat/live-ledger-display`.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **Do not improvise.** If anything is unclear or not covered by this ticket, stop and ask.
- **No logic changes.** This ticket is pure rename and dead-code removal. Do not change any behavior.
- Run `cd frontend && npm run build` at the end — 0 TypeScript errors required.
- Run `cd backend && python -m pytest` at the end — no new failures.

---

## Background

Two naming problems to fix:

1. **Expense schemas**: `ExpenseCreateLegacy` / `ExpenseOutLegacy` are the active schemas but named as if deprecated. Two dead schemas (`ExpenseCreate`, `ExpenseOut`) exist alongside them unused.
2. **Daily report V2 suffix**: There is no v1 anymore. The `V2` suffix on all report schemas, types, endpoints, and functions is misleading noise.

---

## Part 1 — Expense schema cleanup

### Files to read first
- `backend/app/schemas/transaction.py`
- `backend/app/routers/expenses.py`

### Current state (transaction.py)

| Lines | Name | Status |
|-------|------|--------|
| 44–54 | `ExpenseCreate` | Dead — defined but never imported or used |
| 55–67 | `ExpenseOut` | Dead — defined but never imported or used |
| 69–75 | `ExpenseCreateLegacy` | Active — used by expenses router |
| 86–95 | `ExpenseOutLegacy` | Active — used by expenses router |

### Steps

**Step 1a** — Delete the dead schemas from `transaction.py`:
- Delete the entire `ExpenseCreate` class (lines 44–54)
- Delete the entire `ExpenseOut` class (lines 55–67)

**Step 1b** — Rename the Legacy schemas in `transaction.py`:
- Rename `ExpenseCreateLegacy` → `ExpenseCreate`
- Rename `ExpenseOutLegacy` → `ExpenseOut`

**Step 1c** — Update `expenses.py`:
- Change the import line from `ExpenseCreateLegacy, ExpenseOutLegacy` to `ExpenseCreate, ExpenseOut`
- Replace every occurrence of `ExpenseCreateLegacy` → `ExpenseCreate`
- Replace every occurrence of `ExpenseOutLegacy` → `ExpenseOut`

Do not change any other logic in `expenses.py`.

---

## Part 2 — Drop the V2 suffix from daily report naming

### Files affected

**Backend (read before modifying):**
- `backend/app/schemas/report.py` — 8 schema class definitions
- `backend/app/schemas/__init__.py` — exports
- `backend/app/routers/reports.py` — 2 route paths + all schema references
- `backend/app/services/reports_aggregates.py` — schema references
- `backend/app/services/reports_event_fields.py` — schema references

**Frontend (read before modifying):**
- `frontend/types/report.ts` — type definitions
- `frontend/lib/api/reports.ts` — function names + endpoint URL strings
- `frontend/lib/api/index.ts` — re-exports
- `frontend/hooks/useReports.ts` — imports
- `frontend/hooks/useDailyReportScreen.ts` — imports
- `frontend/lib/activityAdapter.ts` — type references
- `frontend/components/reports/SlimActivityRow.tsx` — type references
- `frontend/components/reports/DaySummaryBox.tsx` — type references
- `frontend/components/reports/DayPickerStrip.tsx` — type references
- `frontend/dev/level3-fixtures.ts` — type references

### Rename map — apply everywhere across all files above

| Old name | New name |
|----------|----------|
| `DailyReportV2CashMath` | `DailyReportCashMath` |
| `DailyReportV2MathCustomers` | `DailyReportMathCustomers` |
| `DailyReportV2MathCompany` | `DailyReportMathCompany` |
| `DailyReportV2MathResult` | `DailyReportMathResult` |
| `DailyReportV2Math` | `DailyReportMath` |
| `DailyReportV2Card` | `DailyReportCard` |
| `DailyReportV2Event` | `DailyReportEvent` |
| `DailyReportV2Day` | `DailyReportDay` |
| `listDailyReportsV2` | `listDailyReports` |
| `getDailyReportV2` | `getDailyReport` |

### Route path renames — backend AND frontend must match

| Old path | New path |
|----------|----------|
| `GET /reports/daily_v2` | `GET /reports/daily` |
| `GET /reports/day_v2` | `GET /reports/day` |

- In `reports.py`: change `@router.get("/daily_v2", ...)` → `@router.get("/daily", ...)`  and `@router.get("/day_v2", ...)` → `@router.get("/day", ...)`
- In `frontend/lib/api/reports.ts`: change the hardcoded URL strings `"/reports/daily_v2"` → `"/reports/daily"` and `"/reports/day_v2"` → `"/reports/day"`

### Test file renames — read each before modifying

These test files reference the old schema names and must also be updated:

| Old filename | New filename |
|---|---|
| `tests/backend/test_day_v2_level3_contract.py` | `tests/backend/test_day_level3_contract.py` |
| `tests/backend/test_day_v2_smartticket.py` | `tests/backend/test_day_smartticket.py` |
| `tests/backend/test_reports_v2.py` | `tests/backend/test_reports.py` |
| `tests/backend/test_reports_v2_unit.py` | `tests/backend/test_reports_unit.py` |

For each: rename the file, then replace any `DailyReportV2*` references inside it using the rename map above.

---

## Verification

### Frontend build
```bash
cd frontend && npm run build
```
Expected: 0 TypeScript errors.

### Backend import check
```bash
cd backend && python -c "from app.routers.reports import router; from app.routers.expenses import router as er; print('OK')"
```
Expected: prints `OK` with no errors.

### Backend tests

Run only the tests that exercise the renamed code — do NOT run the full suite.
Note: explicit file paths do not work in this repo because `pythonpath` is only set up when pytest runs via `testpaths`. Use `-k` to filter by module name instead:

```bash
cd backend && python -m pytest -v \
  -k "test_reports or test_reports_unit or test_day_level3_contract or test_day_smartticket or test_distributor_workflow"
```

Expected: **18 failures, 12 passed** — these exact 18 failures are pre-existing (confirmed in `backend/tests_results.txt` before any rename work). If you see the same 18 failures and no new ones, the rename is clean. Do NOT try to fix these failures — they are out of scope for this ticket.

### Grep check — confirm no old names remain

This environment uses PowerShell. Run:
```powershell
Get-ChildItem -Recurse -Include *.py,*.ts,*.tsx -Path backend,frontend,tests | Select-String -Pattern "DailyReportV2|ExpenseCreateLegacy|ExpenseOutLegacy|daily_v2|day_v2|listDailyReportsV2|getDailyReportV2"
```
Expected: no output.
