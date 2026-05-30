# Activity Kind Naming Audit

Canonical backend kinds vs what is emitted, enriched, and aliased across the codebase.

Last updated: 2026-05-23

## Status Key

- ✓ Correct / matches canonical
- FIXED — was broken, fixed in `fix/activity-kind-enrichment` (cherry-picked into `feat/backend-missing-tests`)
- DEAD — alias exists in code but nothing emits it; scheduled for removal in Ticket 7
- MIGRATE — adapter alias scheduled for migration to canonical name in Ticket 7

---

## Full Table

| # | Canonical Kind | `reports.py` emits | `reports_event_fields.py` enriches | `activityAdapter.ts` emits | `utils.ts` / `eventColors.ts` aliases | Problem |
|---|---|---|---|---|---|---|
| 1 | `replacement` | `replacement` ✓ | `replacement` ✓ | `"order"` | — | Adapter wraps all 3 order kinds under one synthetic `"order"` kind — MIGRATE |
| 2 | `sell_full` | `sell_full` ✓ | `sell_full` ✓ | `"order"` | — | Same — MIGRATE |
| 3 | `buy_empty_from_customer` | `buy_empty_from_customer` ✓ | `buy_empty_from_customer` ✓ | `"order"` | — | Same — MIGRATE |
| 4 | `payment_from_customer` | `payment_from_customer` ✓ | `payment_from_customer` ✓ | `"collection_money"` | `collection_money` in utils.ts + eventColors.ts | Old "collection" terminology — MIGRATE |
| 5 | `payment_to_customer` | `payment_to_customer` ✓ | `payment_to_customer` ✓ | `"collection_payout"` | `collection_payout` in utils.ts + eventColors.ts | Same — MIGRATE |
| 6 | `customer_return_empties` | `customer_return_empties` ✓ | `customer_return_empties` ✓ | `"collection_empty"` | `collection_empty` in utils.ts + eventColors.ts | Same — MIGRATE |
| 7 | `adjust_customer_balance` | `adjust_customer_balance` ✓ | `adjust_customer_balance` ✓ | `"customer_adjust"` | `customer_adjust` in utils.ts + eventColors.ts | Adapter uses shortened alias — MIGRATE |
| 8 | `refill` | `refill` ✓ | `refill` ✓ | splits into `"buy_full_from_company"` or `"dist_return_empties"` via quantity heuristic | — | Adapter decomposes refill by heuristic; `refill.kind === "buy_iron"` check is dead — remove in Ticket 7 |
| 9 | `dist_return_empties` | `dist_return_empties` ✓ | `dist_return_empties` ✓ | (via refill heuristic) | `company_return_empties` in eventColors.ts | Dead legacy alias — DEAD |
| 10 | `buy_full_from_company` | `buy_full_from_company` ✓ | `buy_full_from_company` ✓ | (via refill heuristic) | `company_buy_iron`, `company_buy_full` in utils.ts + eventColors.ts | Two dead legacy aliases — DEAD |
| 11 | `payment_to_company` | `payment_to_company` ✓ | `payment_to_company` ✓ | `"company_payment"` | `company_payment` in utils.ts + eventColors.ts | Adapter collapses both directions into one kind — MIGRATE |
| 12 | `payment_from_company` | `payment_from_company` ✓ | `payment_from_company` ✓ | `"company_payment"` (same) | same | Same collapse — in/out distinction lost in adapter — MIGRATE |
| 13 | `adjust_company_balance` | `adjust_company_balance` ✓ | `adjust_company_balance` ✓ | `"company_adjustment"` | `company_adjustment` in utils.ts + eventColors.ts | Adapter uses different name — MIGRATE |
| 14 | `expense` | `expense` ✓ | `expense` ✓ | `"expense"` ✓ | — | Clean |
| 15 | `bank_deposit` | `bank_deposit` ✓ | `bank_deposit` ✓ | `"bank_deposit"` ✓ | — | Clean |
| 16 | `adjust_wallet` | `"adjust_wallet"` ✓ | `"adjust_wallet"` ✓ FIXED | `"adjust_wallet"` (single adj) | `cash_adjust` still in utils.ts + eventColors.ts | Enrichment bug FIXED; dead alias `cash_adjust` remains — DEAD |
| 17 | `adjust_inventory` | `"adjust_inventory"` ✓ | `"adjust_inventory"` ✓ FIXED | `"adjust"` (single) / `"adjust_inventory"` (group) — inconsistent | `adjust` still in utils.ts + eventColors.ts | Enrichment bug FIXED; adapter inconsistent between single and group; dead alias `adjust` remains — DEAD + MIGRATE |
