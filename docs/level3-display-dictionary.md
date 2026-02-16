# Level 3 Activity Display Dictionary (Single Source of Truth)

Goal: Level 3 is a minimal activity feed for drivers. It must be consistent across backend + frontend.

Global Rules
- Level 3 never shows totals, received empties, or before/after cash/inventory.
- Level 3 always shows a single **hero** text.
- Level 3 shows **money** only as a verb + absolute amount (no sign).
- Level 3 **system** appears only for Replacement.
- Level 3 actions are **directional chips** derived from post‑state balances.

Settled Rule (Customer/Company)
- A settlement describes whether the relationship is cleared *after this event*.
- Customer components (post‑state):
  - money: `debt_cash == 0`
  - cylinders: `debt_cylinders_12 == 0`, `debt_cylinders_48 == 0`
- Company components (post‑state):
  - money: `company_after == 0`
  - cylinders: `company_12kg_after == 0`, `company_48kg_after == 0`
- `is_settled = money && cyl12 && cyl48` when scope is `customer` or `company`.
- `scope = none` for neutral activities (Expense/Adjust/Cash Adjust/Deposit).

Action Chip Schema
- Money action:
  - `{ category: "money", direction, amount }`
- Cylinder action:
  - `{ category: "cylinders", direction, gas_type: "12"|"48", qty, unit: "empty"|"full" }`

Action Chip Directions
- Money:
  - `customer_pays` (customer → distributor)
  - `pay_customer` (distributor → customer)
  - `pay_company` (distributor → company)
  - `company_pays` (company → distributor)
- Cylinders:
  - `customer_returns_empty` (customer → distributor)
  - `return_empty_to_company` (distributor → company)
  - `deliver_full_to_customer` (distributor → customer)
  - `company_delivers_full_to_you` (company → distributor, optional/rare)

Action Chip Text Templates (UI)
- Money:
  - `customer_pays` → `Collect {amount}`
  - `pay_customer` → `Pay customer {amount}`
  - `pay_company` → `Pay company {amount}`
  - `company_pays` → `Company pays {amount}`
- Cylinders:
  - `customer_returns_empty` → `Return {qty}x{gas} empty`
  - `return_empty_to_company` → `Return {qty}x{gas} to company`
  - `deliver_full_to_customer` → `Deliver {qty}x{gas} full`
  - `company_delivers_full_to_you` → `Company delivers {qty}x{gas} full`

Event Mapping

Customer — Replacement (event_type=order, order_mode=replacement)
- Hero: `Replace {gas}` (gas = 12kg/48kg when known)
- Context: counterparty = customer (name + description)
- System: **present** (`system.display_name`)
- Money: verb=`received`, amount=`order_paid` (if > 0 else `none`)
- Settlement scope: customer (post‑state debts)
- Actions:
  - If debt_cash > 0: `customer_pays`
  - If debt_cash < 0: `pay_customer`
  - If debt_cylinders_12 > 0: `customer_returns_empty` (12)
  - If debt_cylinders_12 < 0: `deliver_full_to_customer` (12)
  - If debt_cylinders_48 > 0: `customer_returns_empty` (48)
  - If debt_cylinders_48 < 0: `deliver_full_to_customer` (48)

Customer — Sell Full (event_type=order, order_mode=sell_iron)
- Hero: `Sell Full {gas}`
- Context: counterparty = customer
- System: null
- Money: verb=`received`, amount=`order_paid` (if > 0 else `none`)
- Settlement scope: customer (post‑state debts)
- Actions:
  - From post‑state debts (see Replacement)

Customer — Buy Empty (event_type=order, order_mode=buy_iron)
- Hero: `Buy Empty {gas}`
- Context: counterparty = customer
- System: null
- Money: verb=`paid`, amount=`order_paid` (if > 0 else `none`)
- Settlement scope: customer (post‑state debts)
- Actions:
  - From post‑state debts (see Replacement)

Customer — Late Pay (event_type=collection_money)
- Hero: `Late Pay`
- Context: counterparty = customer
- System: null
- Money: verb=`received`, amount=`cash_delta` (if > 0 else `none`)
- Settlement scope: customer (post‑state debts)
- Actions: none

Customer — Late Return (event_type=collection_empty)
- Hero: `Late Return`
- Context: counterparty = customer
- System: null
- Money: verb=`none`
- Settlement scope: customer (post‑state debts)
- Actions: none

Company — Refill (event_type=refill)
- Hero: `Refill`
- Context: counterparty = company
- System: null
- Money: verb=`paid`, amount=`paid_now` (if > 0 else `none`)
- Settlement scope: company (post‑state debts)
- Actions:
  - If company_after > 0: `pay_company`
  - If company_after < 0: `company_pays`
  - If company_12kg_after < 0: `return_empty_to_company` (12)
  - If company_12kg_after > 0: `company_delivers_full_to_you` (12)
  - If company_48kg_after < 0: `return_empty_to_company` (48)
  - If company_48kg_after > 0: `company_delivers_full_to_you` (48)

Company — Company Payment (event_type=company_payment)
- Hero: `Pay Company`
- Context: counterparty = company
- System: null
- Money: verb=`paid`, amount=`paid_now` (if > 0 else `none`)
- Settlement scope: company (post‑state debts)
- Actions: none

Neutral — Expense (event_type=expense)
- Hero: `Expense` (optional suffix: `Expense: {expense_type}`)
- Context: none
- System: null
- Money: verb=`paid`, amount=`total_cost` (if > 0 else `none`)
- Settlement scope: none
- Actions: none

Neutral — Inventory Adjustment (event_type=adjust)
- Hero: `Inventory Adjust`
- Context: none
- System: null
- Money: verb=`none`
- Settlement scope: none
- Actions: none

Neutral — Cash Adjust (event_type=cash_adjust)
- Hero: `Cash Adjust`
- Context: none
- System: null
- Money: verb=`received` if delta > 0, `paid` if delta < 0, else `none`
- Settlement scope: none
- Actions: none

Neutral — Bank Deposit (event_type=bank_deposit)
- Hero: `Bank Deposit`
- Context: none
- System: null
- Money: verb=`received`, amount=`total_cost` (if > 0 else `none`)
- Settlement scope: none
- Actions: none
