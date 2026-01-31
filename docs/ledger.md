# Ledger Entries

The `ledger_entries` table is the single source of truth for balances. All intent tables post ledger lines through the posting engine.

## Schema (ledger_entries)

- id (uuid, pk)
- happened_at (timestamptz)
- day (date)
- source_type (text)
- source_id (uuid/text)
- customer_id (uuid, nullable)
- account (text)
- gas_type (text, nullable: "12kg" | "48kg")
- state (text, nullable: "full" | "empty")
- unit (text: "money" | "count")
- amount (int, signed)
- note (text, nullable)

Uniqueness guard: `(source_type, source_id, account, gas_type, state, unit)` must be unique.

## Accounts

- cash (money)
- bank (money)
- inv (count, gas_type + state)
- cust_money_debts (money, customer_id)
- cust_cylinders_debts (count, gas_type + state=empty, customer_id)
- company_money_debts (money)
- company_cylinders_debts (count, gas_type)
- expense (money)
- cash_adjustments (money)

## Source types

- customer_txn
- company_txn
- inventory_adjust
- expense
- cash_adjust
- system_init

## Business date

`day` is derived from `happened_at` in the business timezone (Europe/Berlin).
