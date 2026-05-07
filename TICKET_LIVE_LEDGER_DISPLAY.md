# Live Ledger Display — Overview

This work is split into 5 focused tickets. Implement them in order.

| # | File | Scope |
|---|------|-------|
| 1 | `TICKET_LIVE_01_BUY_IRON_KIND.md` | Add explicit `kind` to company inventory summary; fix frontend buy_iron classification |
| 2 | `TICKET_LIVE_02_CUSTOMER_SNAPSHOT_HELPER.md` | Add `snapshot_customer_debts` helper to `ledger.py`; return live customer fields from adjustments + collections |
| 3 | `TICKET_LIVE_03_COMPANY_SNAPSHOT_FIELDS.md` | Return live company fields from refills + company payments |
| 4 | `TICKET_LIVE_04_FRONTEND_ADAPTERS.md` | Switch frontend adapters to prefer `live_debt_*` fields |
| 5 | `TICKET_LIVE_05_REGRESSION_TESTS.md` | History-change regression tests (delete old, insert past, verify cards update) |

Each ticket says what branch to use and ends with a build/test verification. Some tickets depend on earlier ones — see the Dependencies column.

| # | Depends on |
|---|------------|
| 1 | — |
| 2 | — |
| 3 | Ticket 1 (uses `kind` field added there) |
| 4 | Tickets 1, 2, 3 (reads all new live fields) |
| 5 | Tickets 1–4 (acceptance tests for the whole branch) |
