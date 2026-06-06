# Activity Reference — Gas App

This document describes every activity type the distributor can enter in the app,
what changes in the UI when each activity is saved, and how activity cards behave
inside the Daily Report.

---

## How to Read This Document

Each activity section answers four questions:

1. **Where does the new card appear?** — which screens and lists show the new entry.
2. **What changes on the Customer side?** — balances, lists, filters, stats.
3. **What changes on the Company side?** — company balances, company activity list.
4. **What changes in the Daily Report?** — timeline card, summary numbers, outstanding indicators.

A fifth section, **What does NOT change**, is included to prevent confusion about
side-effects that do not exist for that activity type.

---

## Daily Report Card — Expanded Mode

Every activity card in the Daily Report timeline has a collapsed and an expanded state.

### Collapsed state
Shows the minimum identifying information:
- Activity type label (e.g. "Replacement", "Refill", "Company Payment")
- Counterparty name (customer name or "Company")
- Hero text: the key number for that activity (e.g. "Total 100 | Paid 60", "Bought: 3x 12kg")
- Time of day

### Expanded state
Tapping the card reveals the full before → after context for every balance that changed.
Each changed balance is shown as a transition pill: **X → Y**.

The pills shown depend on the activity type:

| Activity type | Transition pills shown in expanded mode |
|---|---|
| Replacement | Customer money before → after, Customer 12kg/48kg before → after (if cylinders moved) |
| Sell Full | Customer money before → after |
| Buy Empty | Customer money before → after, inventory empty before → after |
| Late Payment | Customer money before → after |
| Return Empties (from customer) | Customer 12kg/48kg before → after |
| Payout | Customer money before → after |
| Customer Adjustment | Customer money before → after (if adjusted), Customer 12kg/48kg before → after (if adjusted) |
| Refill | Company money before → after, Company 12kg/48kg before → after, Inventory before → after |
| Buy Full From Company | Inventory full before → after only — company cylinder pills must not appear (⚠ known display bug: add-screen card still shows false cylinder pills) |
| Return Empties To Company | Company 12kg/48kg before → after, Inventory empty before → after |
| Company Payment | Company money before → after |
| Company Adjustment | Company money before → after, Company 12kg/48kg before → after (⚠ known issue: some amount fields may render incomplete) |
| Expense | Wallet/cash before → after |
| Wallet To Bank | Wallet/cash before → after |
| Bank To Wallet | Wallet/cash before → after |
| Wallet Adjustment | Wallet/cash before → after |
| Inventory Adjustment | Inventory 12kg/48kg Full/Empty before → after |

The before value is the balance at the moment just before this event was applied.
The after value is the balance immediately after.
If a balance did not change, its pill is not shown.

---

## Customer Activities

---

### Replacement

A Replacement means the distributor delivers full cylinders and collects empties
in exchange. The customer pays part or all of the total, or owes the rest.

**Where the card appears:**
- Customer Details → Activities (under All, Replacement, and possibly a System filter)
- Add → Customer Activities
- Daily Report timeline for that day

**Customer Details changes:**
- Money balance updates (increases by the unpaid amount if not fully paid)
- 12kg and 48kg balance boxes update if empties were collected
- Last order date updates
- Lifetime cylinders ordered/sold updates for the gas type
- Activity count (X shown) updates
- Card appears under: All, Replacement, and the system filter if the order is linked to a system
- WhatsApp reminder text uses the updated balance if opened after the save

**Customers list changes:**
- Customer row: money balance, last order date, order count all update
- Customer may enter or leave the "Show only unpaid" filter
- Total Debt and Unpaid Customers count may change
- Customer may move in or out of the Overdue (120+ days) section because Last order changed

**Daily Report changes:**
- Sold 12kg or sold 48kg total increases
- Wallet cash increases by the paid amount
- Inventory full decreases for the delivered gas type
- Inventory empty increases for the collected empties
- Cash end / net today update
- Outstanding/problem indicators may change if the customer still owes money or empties

**What does NOT change:** company balances, company activity list.

**Example:**
Distributor delivers 3 x 12kg, collects 2 x 12kg empties, total 150, paid 100.
- Customer money balance increases by 50 debt
- Customer 12kg balance decreases by 1 (net: delivered 3, collected 2)
- Last order updates
- Wallet increases by 100
- Daily sold 12kg increases by 3
- Daily 12kg full inventory decreases by 3
- Daily 12kg empty inventory increases by 2

---

### Sell Full

The distributor sells full cylinders to a customer without collecting empties.
The customer pays part or all of the total.

**Where the card appears:**
- Customer Details → Activities (under All, Sell Full)
- Add → Customer Activities
- Daily Report timeline for that day

**Customer Details changes:**
- Money balance updates (increases by unpaid amount)
- 12kg / 48kg cylinder balance boxes do not change — Sell Full does not affect empty-cylinder debt
- Last order date updates
- Lifetime cylinders ordered/sold updates for the sold gas type
- Activity count (X shown) updates

**Customers list changes:**
- Customer row: money balance, last order date, order count update
- Customer may enter or leave unpaid/debt totals, unpaid customers count, overdue section

**Daily Report changes:**
- Wallet cash increases by the paid amount
- Sold 12kg or sold 48kg increases
- Inventory full decreases for that gas type
- Inventory empty does not change
- Cash end / net today update
- Outstanding/problem summaries may update if money is still owed

**What does NOT change:** customer cylinder balances, company balances, company activity list.

**Example:**
User sells 2 x 12kg, total 100, paid 60.
- Customer money balance increases by 40 debt
- Wallet increases by 60
- Daily sold 12kg increases by 2
- Daily 12kg full inventory decreases by 2

---

### Buy Empty

The distributor buys empty cylinders from a customer and pays the customer,
or the customer pays the distributor depending on the pricing direction.

**Where the card appears:**
- Customer Details → Activities (under All, Buy Empty)
- Add → Customer Activities
- Daily Report timeline for that day

**Customer Details changes:**
- Money balance updates by the difference between total and paid
- 12kg / 48kg cylinder balance boxes do not change for the buy-empty itself
- Last order date updates
- Activity count (X shown) updates

**Customers list changes:**
- Customer row: money balance, last order date, order count update
- Customer may enter or leave unpaid/debt totals, unpaid customers count, overdue section

**Daily Report changes:**
- Wallet cash changes according to the payment direction and amount
- Empty-cylinder inventory increases for the gas type bought
- Sold-cylinder totals do not change
- Full-cylinder inventory does not change
- Cash end / net today update
- Outstanding/problem summaries may update

**What does NOT change:** customer cylinder balances, company balances, company activity list.

**Example:**
User buys 3 x 12kg empties from customer, total 30, paid 20.
- Customer money balance updates by the 10 difference
- Daily 12kg empty inventory increases by 3
- Wallet changes by 20

---

### Late Payment

The customer pays money they owe from a previous order.
No cylinders are exchanged.

**Where the card appears:**
- Customer Details → Activities (under All, Late Payment)
- Add → Customer Activities
- Daily Report timeline for that day

**Customer Details changes:**
- Money balance decreases (debt reduces or turns to credit)
- 12kg / 48kg cylinder balance boxes do not change
- Last order date does not change
- Lifetime cylinder stats do not change
- Activity count (X shown) updates

**Customers list changes:**
- Customer row: money balance updates
- Order count and last order date do not change
- Customer may enter or leave unpaid/debt totals, unpaid customers count, unpaid-only filter

**Daily Report changes:**
- Wallet cash increases by the collected amount
- Sold-cylinder totals do not change
- Inventory does not change
- Cash end / net today update
- Outstanding/problem summaries may decrease because remaining money debt is smaller

**What does NOT change:** cylinder balances, company balances, company activity list.

**Example:**
Customer owed 100, distributor collects 40.
- Customer money balance changes from 100 debt to 60 debt
- Wallet increases by 40

---

### Return Empties (from customer)

The customer returns empty cylinders they owe the distributor.
No money is exchanged in a pure return.

**Where the card appears:**
- Customer Details → Activities (under All, Return Empties)
- Add → Customer Activities
- Daily Report timeline for that day

**Customer Details changes:**
- 12kg / 48kg balance boxes update according to the returned quantity
- Money balance box does not change
- Last order date does not change
- Lifetime cylinder stats do not change
- Activity count (X shown) updates

**Customers list changes:**
- Customer row: 12kg and 48kg cylinder balances update
- Money balance, order count, and last order date do not change

**Daily Report changes:**
- Empty-cylinder inventory increases for the returned gas type
- Wallet cash does not change
- Sold-cylinder totals do not change
- Full-cylinder inventory does not change
- Outstanding/problem summaries may change because customer cylinder debt decreases

**What does NOT change:** money balances, company balances, company activity list.

**Example:**
Customer returns 2 x 12kg empties.
- Customer 12kg balance decreases by 2 (debt settles or reduces)
- Daily 12kg empty inventory increases by 2

---

### Payout to Customer

The distributor pays money to the customer, typically to return a credit balance.

**Where the card appears:**
- Customer Details → Activities (under All, Payout)
- Add → Customer Activities
- Daily Report timeline for that day

**Customer Details changes:**
- Money balance decreases (credit reduces)
- 12kg / 48kg cylinder balance boxes do not change
- Last order date does not change
- Lifetime cylinder stats do not change
- Activity count (X shown) updates

**Customers list changes:**
- Customer row: money balance updates
- Order count and last order date do not change
- Customer may enter or leave unpaid/debt totals, unpaid customers count, unpaid-only filter

**Daily Report changes:**
- Wallet cash decreases by the payout amount
- Sold-cylinder totals do not change
- Inventory does not change
- Cash end / net today update
- Outstanding/problem summaries may change

**What does NOT change:** cylinder balances, company balances, company activity list.

**Example:**
Customer had 20 credit, distributor pays 10.
- Customer money balance changes from 20 credit to 10 credit
- Wallet decreases by 10

---

### Customer Balance Adjustment

The distributor manually sets the customer's money, 12kg, and/or 48kg balance
to a specific value. The system calculates the delta and records it as a transaction.

**Where the card appears:**
- Customer Details → Activities (under All, Adjustment) — appears immediately after save
- Add → Customer Activities — appears immediately after save
- Daily Report timeline for that day

**Customer Details changes:**
- Money balance updates if money was adjusted
- 12kg balance updates if 12kg was adjusted
- 48kg balance updates if 48kg was adjusted
- Last order date does not change
- Lifetime cylinder stats do not change
- Activity count (X shown) updates

**Customers list changes:**
- Customer row: money, 12kg, and 48kg balances update
- Order count and last order date do not change
- Customer may enter or leave unpaid/debt totals, unpaid customers count, unpaid-only filter

**Daily Report changes:**
- Adjustment card appears in the timeline
- Wallet cash does not change
- Sold-cylinder totals do not change
- Inventory full/empty counts do not change
- Outstanding/problem summaries may change because customer balances changed

**What does NOT change:** wallet, inventory, company balances, company activity list.

**Example:**
User adjusts customer to: money debt 80, 12kg credit 2, 48kg debt 3.
- All three top balance boxes on Customer Details update immediately
- Customer row in Customers list updates
- Daily report timeline shows the Adjustment card

---

### Opening Balance (New Customer)

When a new customer is created with a non-zero opening balance, the app creates
the customer and immediately records an Adjustment transaction for the opening values.

**Where the card appears:**
- A new customer row appears in the Customers list
- If opening balance is non-zero: Adjustment card in Customer Details → Activities — appears immediately
- If opening balance is non-zero: Adjustment card in Add → Customer Activities — appears immediately
- If opening balance is non-zero: Adjustment card in Daily Report timeline for that day

**Customer Details:**
- Top balance boxes show the opening money, 12kg, and 48kg values
- Last order is empty
- Order count is 0
- Lifetime cylinder stats are 0

**Customers list:**
- New row shows opening money, 12kg, and 48kg balances
- New customer may affect Total Debt, Unpaid Customers count, unpaid-only filter

**Daily Report:** same as Customer Balance Adjustment if opening balance is non-zero.

**What does NOT change:** wallet, inventory, company balances, company activity list, sold totals.

**Special case:** if opening balance is all zero, the customer is created but no Adjustment
card is recorded anywhere — no transaction is created for a zero opening balance.

---

## Company Activities

---

### Refill

The distributor receives full cylinders from the company and returns empties,
paying part or all of the amount owed.

**Where the card appears:**
- Add → Company Activities (under All, Refill) — appears immediately after save
- Daily Report timeline for that day

**Company Activities changes:**
- Company money balance updates if payment did not fully settle the amount owed
- Company 12kg balance updates
- Company 48kg balance updates

**Daily Report changes:**
- Wallet cash changes by the paid amount
- Inventory full increases for the gas received from the company
- Inventory empty decreases for the empties returned to the company
- Cash end / net today update
- Outstanding/problem summaries may change because company balances changed

**What does NOT change:** customer balances, customer activity lists, Customers list,
customer Last order, customer lifetime cylinders.

**Example:**
Buy 5 x 12kg full, return 4 x 12kg empties, pay 200.
- Company balances update
- Wallet changes by 200
- Daily 12kg full inventory increases by 5
- Daily 12kg empty inventory decreases by 4

---

### Buy Full From Company

The distributor buys full cylinders directly from the company as a stock purchase.
No empties are exchanged. This is a pure inventory purchase, not a cylinder debt transaction.

**Where the card appears:**
- Add → Company Activities (under All, Buy Full) — appears immediately after save
- Daily Report timeline for that day — card shows quantities (e.g. "Bought: 3x 12kg")

**Company Activities changes:**
- Company money balance updates if the payment did not fully cover the total cost
- Company cylinder balances (12kg / 48kg) do not change — buying full cylinders does not
  create or settle cylinder debt; the distributor is purchasing stock outright

**Daily Report changes:**
- Wallet cash decreases by the paid amount
- Inventory full increases for the gas type bought
- Inventory empty does not change
- Cash end / net today update
- Outstanding/problem summaries may change if money balance changed

**What does NOT change:** customer balances, customer activity lists, Customers list,
company cylinder balances.

**⚠ Known display bug:** the Add screen card for Buy Full currently shows false company
cylinder balance transition pills (e.g. "12kg: 3 → 0") even though cylinder debt does
not change for this activity. The data is correct; only the displayed pills are wrong.
This is a known open issue.

**Example:**
Buy 3 x 12kg full, total 300, paid 300.
- Wallet decreases by 300
- Daily 12kg full inventory increases by 3
- Company money balance stays settled
- Daily report card shows: Bought: 3x 12kg

---

### Return Empties To Company

The distributor returns empty cylinders to the company.
No money is typically exchanged in a pure return.

**Where the card appears:**
- Add → Company Activities (under All, Refill — there is no separate "Return Empties" filter)
- Daily Report timeline for that day

**Company Activities changes:**
- Company 12kg balance updates if 12kg empties were returned
- Company 48kg balance updates if 48kg empties were returned
- Company money balance usually does not change for a pure return

**Daily Report changes:**
- Inventory empty decreases for the gas type returned to the company
- Inventory full does not change
- Wallet cash usually does not change
- Outstanding/problem summaries may change because company cylinder balance changed

**What does NOT change:** customer balances, customer activity lists, Customers list,
customer Last order, customer lifetime cylinders.

**Example:**
Return 4 x 12kg empties to company.
- Company 12kg balance updates
- Daily 12kg empty inventory decreases by 4
- Wallet does not change

---

### Company Payment

The distributor pays money to the company to reduce the money debt owed.

**Where the card appears:**
- Add → Company Activities (under All, Company Payment)
- Daily Report timeline for that day

**Company Activities changes:**
- Company money balance updates (debt reduces)
- Company 12kg and 48kg cylinder balances do not change

**Daily Report changes:**
- Wallet cash decreases by the payment amount
- Cash end / net today update
- Inventory does not change
- Outstanding/problem summaries may change because company money balance changed

**What does NOT change:** customer balances, customer activity lists, Customers list,
customer Last order, customer lifetime cylinders, cylinder inventory.

**Known display limitation:** the Add screen payment card shows the amount paid but does
not show company before → after balance pills. This is a display limitation, not a data bug.

**Example:**
Pay company 200.
- Company money balance decreases by 200 debt
- Wallet decreases by 200
- Daily inventory does not change

---

### Company Balance Adjustment

The distributor manually sets the company's money, 12kg, and/or 48kg balance
to a specific value. The system calculates the delta and records it.

**Where the card appears:**
- Does NOT appear in Add → Company Activities (unlike Refill and Company Payment)
- Always appears in the Daily Report timeline for that day

**Company Activities changes:**
- Company money balance updates
- Company 12kg balance updates
- Company 48kg balance updates

**Daily Report changes:**
- Company adjustment card always appears in the timeline
- Outstanding/problem summaries may change because company balances changed

**What does NOT change:** customer balances, customer activity lists, Customers list,
customer Last order, customer lifetime cylinders, inventory full/empty counts,
sold-cylinder totals, wallet cash.

**⚠ Known issue:** the company adjustment card in the Daily Report timeline may show
incomplete amounts or labels due to partially wired event fields. The balances themselves
are correct; only the card display is affected.

**Example:**
Adjust company to: money debt 150, 12kg credit 4, 48kg debt 2.
- Company balances section updates to those new values
- Daily report for that day shows the company adjustment card
- No customer or inventory changes

---

## Expense and Ledger Activities

---

### Expense

The distributor records a business expense (fuel, rent, supplies, etc.)
paid from the wallet.

**Where the card appears:**
- Add → Expenses (under All, Expense, and its matching category filter)
- Daily Report timeline for that day

**Daily Report changes:**
- Wallet cash decreases by the expense amount
- Cash end / net today update
- The day's Expenses total increases
- Inventory does not change
- Sold-cylinder totals do not change

**What does NOT change:** customer balances, customer activity lists, Customers list,
company balances, company activity list, customer Last order, customer lifetime cylinders.

**Example:**
Fuel expense: 50.
- Wallet decreases by 50
- Daily Expenses total increases by 50
- Cash end updates

---

### Wallet To Bank

The distributor transfers money from the wallet to the bank account.
This is a transfer, not an expense.

**Where the card appears:**
- Add → Expenses (under All, Wallet to Bank)
- Daily Report timeline for that day

**Daily Report changes:**
- Wallet cash decreases by the transfer amount
- Cash end / net today update
- Expense totals do not change (this is a transfer, not an expense)
- Inventory does not change
- Sold-cylinder totals do not change

**What does NOT change:** customer balances, company balances, inventory, expense totals.

**Example:**
Transfer 100 wallet → bank.
- Wallet decreases by 100
- Cash end updates

---

### Bank To Wallet

The distributor withdraws money from the bank into the wallet.

**Where the card appears:**
- Add → Expenses (under All, Bank to Wallet)
- Daily Report timeline for that day

**Daily Report changes:**
- Wallet cash increases by the transfer amount
- Cash end / net today update
- Expense totals do not change
- Inventory does not change
- Sold-cylinder totals do not change

**What does NOT change:** customer balances, company balances, inventory, expense totals.

**Example:**
Transfer 100 bank → wallet.
- Wallet increases by 100
- Cash end updates

---

### Wallet Adjustment

The distributor manually corrects the wallet balance by a positive or negative amount.

**Where the card appears:**
- Add → Ledger Adjustments (under All, Wallet Adjustment)
- Daily Report timeline for that day

**Daily Report changes:**
- Wallet cash increases or decreases by the adjustment amount
- Cash end / net today update
- Inventory does not change
- Sold-cylinder totals do not change
- Expense totals do not change

**What does NOT change:** customer balances, company balances, inventory, expense totals.

**Example:**
Wallet adjustment +40.
- Wallet increases by 40
- Cash end updates

---

### Inventory Adjustment

The distributor manually corrects one or more inventory counts
(12kg Full, 12kg Empty, 48kg Full, 48kg Empty).

**Where the card appears:**
- Add → Ledger Adjustments (under All, Inventory Adjustment)
- Daily Report timeline for that day

**Daily Report changes:**
- The adjusted inventory values update for the affected gas type and state
- The top state boxes for that day show the inventory before → after
- Wallet cash does not change
- Cash end / net today does not change from the inventory adjustment itself
- Sold-cylinder totals do not change

**What does NOT change:** customer balances, customer activity lists, Customers list,
company activity list, customer Last order, customer lifetime cylinders.

**Example:**
Inventory adjustment: 12kg full +3, 12kg empty -1.
- Daily 12kg Full increases by 3
- Daily 12kg Empty decreases by 1
- Wallet does not change

---

## Quick Reference Table

| Activity | New card location | Customer balances | Company balances | Wallet | Inventory |
|---|---|---|---|---|---|
| Replacement | Customer Details, Add, Daily Report | Money + cylinders | — | +paid | Full −, Empty + |
| Sell Full | Customer Details, Add, Daily Report | Money only | — | +paid | Full − |
| Buy Empty | Customer Details, Add, Daily Report | Money only | — | ±paid | Empty + |
| Late Payment | Customer Details, Add, Daily Report | Money only | — | +collected | — |
| Return Empties (from cust.) | Customer Details, Add, Daily Report | Cylinders only | — | — | Empty + |
| Payout | Customer Details, Add, Daily Report | Money only | — | −payout | — |
| Customer Adjustment | Customer Details, Add, Daily Report | Money + cylinders | — | — | — |
| Opening Balance | Customer Details, Add, Daily Report | Money + cylinders | — | — | — |
| Refill | Add Company, Daily Report | — | Money + cylinders | ±paid | Full +, Empty − |
| Buy Full From Company | Add Company, Daily Report | — | Money only | −paid | Full + |
| Return Empties To Company | Add Company, Daily Report | — | Cylinders only | — | Empty − |
| Company Payment | Add Company, Daily Report | — | Money only | −paid | — |
| Company Adjustment | Daily Report only | — | Money + cylinders | — | — |
| Expense | Add Expenses, Daily Report | — | — | −amount | — |
| Wallet To Bank | Add Expenses, Daily Report | — | — | −amount | — |
| Bank To Wallet | Add Expenses, Daily Report | — | — | +amount | — |
| Wallet Adjustment | Add Ledger, Daily Report | — | — | ±amount | — |
| Inventory Adjustment | Add Ledger, Daily Report | — | — | — | ±adjusted |

---

## Known Open Issues

| # | Activity | Problem | Affects |
|---|---|---|---|
| 1 | Buy Full From Company | Add screen card shows false company cylinder transition pills (e.g. 3→0) | Add screen display only — data is correct |
| 2 | Company Balance Adjustment | Daily Report card may show incomplete amounts/labels | Daily Report display only — balances are correct |
| 3 | Company Payment | Add screen card has no company before→after balance pills | Add screen display only |
