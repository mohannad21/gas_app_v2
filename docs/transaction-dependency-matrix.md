# Transaction Dependency Matrix

This document turns the current app into a single business map:

- which balances are canonical
- which event types exist
- which values each event changes
- which report levels must update on add / update / delete
- which red-box messages should be generated

It is written for the distributor workflow first.

## 1. Canonical balances

The core rule already matches your requirement:

- A customer may have many systems.
- A customer has only one shared cash balance.
- A customer has only one shared `12kg` empty-cylinder balance.
- A customer has only one shared `48kg` empty-cylinder balance.
- Those balances are independent from system count.
- `system_id` is operational context for replacement orders only; it is not a balance bucket.

The single source of truth is `ledger_entries`.

### 1.1 Customer <-> Distributor balances

- `cust_money_debts` by `customer_id`
  - positive = customer owes distributor money
  - negative = distributor owes customer money
- `cust_cylinders_debts` by `customer_id` + gas type
  - positive = customer owes distributor empty cylinders
  - negative = distributor owes customer full cylinders

### 1.2 Company <-> Distributor balances

- `company_money_debts`
  - positive = distributor owes company money
  - negative = company owes distributor money
- `company_cylinders_debts` by gas type
  - positive = company owes distributor full cylinders
  - negative = distributor owes company empty cylinders

### 1.3 Operational balances

- `inv / full / 12kg`
- `inv / empty / 12kg`
- `inv / full / 48kg`
- `inv / empty / 48kg`
- `cash`
- `bank`

These are not relationship balances; they are stock / wallet state.

## 2. Event catalog and exact dependencies

Every event changes one or more of:

- customer relationship balances
- company relationship balances
- distributor inventory
- distributor cash / bank
- day report
- level-3 event feed
- level-4 expanded ledger

## 2.1 Customer events

### A. Replacement

- Source row: `CustomerTransaction(kind="order", mode="replacement")`
- Input: customer, system, gas type, installed, received, total, paid
- Changes:
  - inventory full gas `- installed`
  - inventory empty gas `+ received`
  - cash `+ paid`
  - customer money `+ (total - paid)`
  - customer cylinders for gas `+ (installed - received)`
- Meaning:
  - if `total > paid`, customer still owes money
  - if `installed > received`, customer still owes empties
  - if `paid > total`, customer has money credit
  - if `received > installed`, customer has cylinder credit and you owe full cylinders

### B. Sell Full

- Source row: `CustomerTransaction(kind="order", mode="sell_iron")`
- Input: customer, gas type, installed, total, paid
- Changes:
  - inventory full gas `- installed`
  - cash `+ paid`
  - customer money `+ (total - paid)`
- No customer cylinder balance change

### C. Buy Empty

- Source row: `CustomerTransaction(kind="order", mode="buy_iron")`
- Input: customer, gas type, received, total, paid
- Changes:
  - inventory empty gas `+ received`
  - cash `- paid`
  - customer money `+ (paid - total)`
- No customer cylinder balance change
- Meaning:
  - negative customer money after event = you still owe customer money
  - positive customer money after event = customer owes you because you overpaid

### D. Late Pay

- Source row: `CustomerTransaction(kind="payment")`
- UI event type: `collection_money`
- Changes:
  - cash `+ amount`
  - customer money `- amount`

### E. Late Return Empties

- Source row: one or two `CustomerTransaction(kind="return")`
- UI event type: `collection_empty`
- Grouping rule:
  - 12kg and 48kg returns on the same logical action should be grouped into one event
- Changes:
  - inventory empty gas `+ returned`
  - customer cylinders gas `- returned`

### F. Customer Payout

- Source row: `CustomerTransaction(kind="payout")`
- UI event type: `collection_payout`
- Changes:
  - cash `- amount`
  - customer money `+ amount`
- Used when customer has money credit and distributor gives money back

### G. Customer Adjustment

- Source row: one or more `CustomerTransaction(kind="adjust")`
- UI event type: `customer_adjust`
- Changes:
  - customer money `+ amount_money`
  - customer 12kg cylinders `+ count_12kg`
  - customer 48kg cylinders `+ count_48kg`
- No inventory / cash movement unless you explicitly create separate inventory or cash adjustments

## 2.2 Company events

### H. Refill

- Source row: `CompanyTransaction(kind="refill")`
- Input: `buy12`, `return12`, `buy48`, `return48`, `total_cost`, `paid_now`
- Changes:
  - inventory full12 `+ buy12`
  - inventory empty12 `- return12`
  - inventory full48 `+ buy48`
  - inventory empty48 `- return48`
  - cash `- paid_now`
  - company money `+ (total_cost - paid_now)`
  - company 12kg cylinders `+ (return12 - buy12)`
  - company 48kg cylinders `+ (return48 - buy48)`

Interpretation:

- `company money > 0` = you still owe company money
- `company money < 0` = company still owes you money
- `company 12kg < 0` = you still owe company empty `12kg`
- `company 12kg > 0` = company still owes you full `12kg`
- `company 48kg < 0` = you still owe company empty `48kg`
- `company 48kg > 0` = company still owes you full `48kg`

Your example:

- distributor returns `25 x 12kg empty` and `5 x 48kg empty`
- company gives `30 x 12kg full` and only `4 x 48kg full`

Result:

- company `12kg` balance delta = `25 - 30 = -5`
  - you still owe company `5 x 12kg empty`
- company `48kg` balance delta = `5 - 4 = +1`
  - company still owes you `1 x 48kg full`

### I. Company Payment

- Source row: `CompanyTransaction(kind="payment")`
- UI event type: `company_payment`
- Changes:
  - cash `- amount`
  - company money `- amount`

### J. Buy New Empty Shells

- Source row: `CompanyTransaction(kind="buy_iron")`
- UI event type: `company_buy_iron`
- Changes:
  - inventory empty12 `+ new12`
  - inventory empty48 `+ new48`
  - cash `- paid_now`
  - company money `+ (total_cost - paid_now)`
- No company cylinder debt change

### K. Company Cylinder Settle

- API path exists as a special helper, but it still posts a `refill`
- Two practical subtypes:
  - receive full only
  - return empty only
- Reporting should treat them as refill subtypes, not a different balance model

## 2.3 Neutral operational events

### L. Expense

- Source row: `Expense(kind="expense")`
- Changes:
  - cash `- amount` when paid from cash
  - bank `- amount` when paid from bank

### M. Bank Deposit

- Source row: `Expense(kind="deposit")`
- Changes:
  - cash `- amount`
  - bank `+ amount`

### N. Inventory Adjustment

- Source row: `InventoryAdjustment`
- Changes:
  - inventory full gas `+ delta_full`
  - inventory empty gas `+ delta_empty`

### O. Cash Adjustment

- Source row: `CashAdjustment`
- Changes:
  - cash `+ delta_cash`

### P. System Init / Opening Balances

- Source row: `system_init` ledger lines
- Changes opening stock, opening cash, opening customer balances, opening company balances

## 3. Four report levels and what must update

## 3.1 Level 1: Global balances

This is the integration across all time.

Must show only non-zero final balances:

- customers who owe money
- customers with money credit
- customers who owe `12kg` empties
- customers with `12kg` full-cylinder credit
- customers who owe `48kg` empties
- customers with `48kg` full-cylinder credit
- company money payable / receivable
- company `12kg` payable / receivable
- company `48kg` payable / receivable

Dependency:

- derived only from ledger sums
- any add / update / delete on any historical date changes level 1 immediately

## 3.2 Level 2: Day card

This is the distributor’s daily control surface.

Must include:

- day and date
- sold `12kg`
- sold `48kg`
- cash at day end
- expenses of that day
- unresolved customer money
- unresolved customer empties
- newly settled balances
- extra payments / extra empties that created credit
- company unresolved money / cylinders

Recommended rule:

- build level 2 only from events on that business day
- show only customers / company that had activity that day
- hide zero lines
- if a balance changed sign through zero, show both the settlement and the new side

## 3.3 Level 3: Event feed

One logical event row per action.

Must show:

- type
- time
- counterparty
- system name only for replacement
- event-specific business details
- red box when something still needs action, something got settled, or credit was created / consumed

## 3.4 Level 4: Expanded ledger

This must explain exactly what moved.

Current UI already shows cash and inventory boxes.

Recommended final rule:

- show all changed operational boxes
- show all changed relationship boxes
- hide unchanged boxes

For customer events, the expanded row should be able to show:

- inventory full gas
- inventory empty gas
- cash
- customer money balance
- customer 12kg balance
- customer 48kg balance

For company events, the expanded row should be able to show:

- inventory full12
- inventory empty12
- inventory full48
- inventory empty48
- cash
- company money balance
- company 12kg balance
- company 48kg balance

Without the relationship boxes, the user cannot fully understand why a red box exists.

## 4. Add / update / delete dependency rules

## 4.1 Add

When an event is added:

- create source row(s)
- post ledger entries
- update post-state balances on the source row when needed
- insert event into that day’s level-3 feed
- update that day’s level-2 card
- update all later day start / end balances if the event is backdated
- update level-1 global balances

## 4.2 Update

Current pattern is reversal + replacement.

When an event is updated:

- create reversal ledger lines for the original source
- mark original source row as reversed
- create new source row
- post new ledger lines
- if date or time changed:
  - original day must lose the event
  - new day must gain the event
  - all later days must be recalculated

## 4.3 Delete

Current pattern is reversal only.

When an event is deleted:

- create reversal ledger lines
- mark original source row as reversed
- remove it from level 3
- restore level-2 and level-1 balances as if it never happened
- restore all later running day balances

## 5. Entry-time red box: what must exist

The entry-time red box should exist before save, right after the user picks:

- a customer for customer events
- company context for refill / company payment / company buy-iron events

It should always have two sections:

- `Current state`
- `After save`

## 5.1 Customer entry-time red box

Extract from current customer balances:

- money
- `12kg`
- `48kg`

Current-state lines:

- `Customer must pay you ₪X`
- `You must pay customer ₪X`
- `Customer must return X x 12kg empty`
- `You must give customer X x 12kg full`
- `Customer must return X x 48kg empty`
- `You must give customer X x 48kg full`
- hide the line when that component is zero

After-save lines:

- compute draft delta from the form
- compute `after = before + delta`
- generate sentence from the transition rule in section 6

Important:

- do not scope this box by system
- balances are per customer, not per system
- system only changes replacement context and gas restriction

## 5.2 Company entry-time red box

Extract from current company balances:

- money
- `12kg`
- `48kg`

Current-state lines:

- `You must pay company ₪X`
- `Company must pay you ₪X`
- `You must return X x 12kg empty to company`
- `Company must give you X x 12kg full`
- `You must return X x 48kg empty to company`
- `Company must give you X x 48kg full`

After-save lines:

- compute draft delta from refill / payment / buy-iron form
- apply same transition rule

## 6. Recommended transition-to-sentence rule

This rule should drive:

- entry-time red box
- level-2 day problem lines
- level-3 event notes

For each balance component, compare `before` and `after`.

## 6.1 If `before = 0` and `after > 0`

- new debt

Examples:

- `Customer now owes you ₪130`
- `Customer now owes you 2x12kg empty`
- `You now owe company ₪500`
- `You now owe company 5x12kg empty`

## 6.2 If `before > 0` and `after > 0`

- still debt

Examples:

- `Customer still owes you ₪130 (was ₪260)`
- `Customer still owes you 2x12kg empty (was 3)`
- `You still owe company ₪500 (was ₪700)`
- `You still owe company 5x12kg empty (was 8)`

## 6.3 If `before > 0` and `after = 0`

- settled old debt

Examples:

- `Paid earlier ₪130 -> settled`
- `Returned earlier 2x12kg empty -> settled`
- `Paid company ₪500 -> settled`
- `Returned company 5x12kg empty -> settled`

## 6.4 If `before > 0` and `after < 0`

- crossed zero from debt into credit
- must produce two lines, not one

Examples:

- `Settled previous debt ₪130`
- `Extra payment ₪40; you owe customer ₪40`

- `Settled previous 1x12kg empty`
- `Extra return 2x12kg; you owe customer 1x12kg full`

- `Settled previous company debt ₪500`
- `Company now owes you ₪20`

## 6.5 If `before = 0` and `after < 0`

- new credit

Examples:

- `You now owe customer ₪40`
- `You now owe customer 1x12kg full`
- `Company now owes you ₪20`
- `Company now owes you 1x48kg full`

## 6.6 If `before < 0` and `after < 0`

- still credit

Examples:

- `You still owe customer ₪40 (was ₪25)`
- `You still owe customer 1x12kg full (was 2)`
- `Company still owes you ₪20 (was ₪10)`
- `Company still owes you 1x48kg full (was 3)`

## 6.7 If `before < 0` and `after = 0`

- credit fully used / settled

Examples:

- `Previous customer credit ₪40 was used -> settled`
- `Previous 1x12kg full credit was used -> settled`
- `Previous company credit ₪20 was used -> settled`
- `Previous 1x48kg full company credit was used -> settled`

## 6.8 If `before < 0` and `after > 0`

- crossed zero from credit into debt
- must produce two lines

Examples:

- `Used previous customer credit ₪40`
- `Customer now owes you ₪90`

- `Used previous 1x12kg full credit`
- `Customer now owes you 2x12kg empty`

- `Used previous company 1x48kg full credit`
- `You now owe company 3x48kg empty`

This is the exact answer for the sensitive case:

- if a customer had `1` cylinder credit and the new action creates `2` missing empties
- do not write one ambiguous sentence
- write:
  - `Used previous 1x12kg full credit`
  - `Customer now owes you 1x12kg empty`

Same rule applies to company balances.

## 7. Sentence catalog by level

## 7.1 Entry-time red box

Recommended short copy:

- `Customer must pay you ₪X`
- `You must pay customer ₪X`
- `Customer must return X x 12kg empty`
- `You must give customer X x 12kg full`
- `Customer must return X x 48kg empty`
- `You must give customer X x 48kg full`
- `You must pay company ₪X`
- `Company must pay you ₪X`
- `You must return X x 12kg empty to company`
- `Company must give you X x 12kg full`
- `You must return X x 48kg empty to company`
- `Company must give you X x 48kg full`
- `After save: settled`
- `After save: customer still owes ...`
- `After save: company still owes ...`
- `After save: credit created ...`

## 7.2 Level-2 day card

Recommended copy:

- `Remaining payment: Osama ₪400`
- `Paid earlier: Osama ₪130 ✅ Settled`
- `Extra paid: Osama ₪70`
- `Remaining empties: Tufeq 1x12kg empty`
- `Returned earlier: Mahmud 2x12kg empty ✅ Settled`
- `Extra empties: Samer 1x12kg empty`
- `Remaining company payment: ₪500`
- `Paid earlier: company ₪300 ✅ Settled`
- `Extra paid: company ₪50`
- `Remaining company empties: 5x12kg empty`
- `Returned earlier: company 3x12kg empty ✅ Settled`
- `Extra company full credit: 1x48kg full`

## 7.3 Level-3 event red box

Recommended copy:

- `Customer still owes you ₪130 (was ₪260)`
- `Customer still owes you 2x12kg empty (was 3)`
- `You still owe company ₪500 (was ₪700)`
- `You still owe company 5x12kg empty (was 8)`
- `Paid earlier ₪130`
- `Returned earlier 2x12kg empty`
- `Company owes you ₪20`
- `Company owes you 1x48kg full`
- `You owe customer ₪40`
- `You owe customer 1x12kg full`
- `Settled previous debt ₪130`
- `Used previous 1x12kg full credit`

## 7.4 Level-4 expanded ledger

Recommended box labels:

- `Cash`
- `12kg F`
- `12kg E`
- `48kg F`
- `48kg E`
- `Cust Cash`
- `Cust 12kg`
- `Cust 48kg`
- `Co Cash`
- `Co 12kg`
- `Co 48kg`

Only show changed boxes for the specific event.

## 8. Gaps to close before the app is “driver-safe”

These are the important gaps found while tracing the repo:

1. Level 4 currently shows cash / inventory, but not the relationship balance boxes.
   - A driver cannot fully understand unresolved debt without customer/company balance boxes.

2. Backend already emits `action_pills` for unresolved events, but the main slim event row is driven mainly by `notes`.
   - Some company refill / company payment problems can become invisible or too quiet if `notes` is empty.

3. Cross-zero transitions need explicit two-line messaging.
   - One-line text is not enough when debt becomes credit or credit becomes debt.

4. Customer / company preview boxes should be driven from the same transition function as report red boxes.
   - Otherwise the add screen and reports will drift.

5. Customer adjustment and company adjustment-style actions should also carry before / after values when you want perfect red-box wording.
   - The safest long-term contract is: every event payload exposed to reports should have the post-state and, when possible, the pre-state.

## 9. Recommended backend contract

To keep all four levels consistent, every reportable event should expose:

- event type
- happened time
- counterparty identity
- system identity when relevant
- operational deltas
- relationship balance before
- relationship balance after
- cash before
- cash after
- inventory before
- inventory after

Then all UI layers can be pure formatting on top of one event contract.
