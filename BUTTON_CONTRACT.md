# Button Behavior Contract

Last updated: 2026-06-08

Applies to:
- frontend/app/orders/new.tsx
- frontend/app/inventory/new.tsx
- frontend/components/CashExpensesView.tsx
- frontend/components/AddRefillModal.tsx

This contract supersedes the previous 3-state cycle button spec.

---

## 1. Shared Terms

- `target`: the transaction-specific base amount for the field.
  - Money: order total, purchase total, or balance owed.
  - Cylinders: qty installed this order, qty bought this refill, or cylinder
    balance owed.
- `target` is always a non-negative amount shown in the input. For activities
  where the internal balance is signed (e.g. payment_to_customer,
  payment_from_company), use the absolute value of the amount owed or
  receivable. Sign handling belongs to submit and ledger logic, not the button.
- Debt and credit adjustments are NOT handled by buttons. The user applies
  them manually using the steppers after the button sets the base value.
- Button-controlled fields open with the field pre-filled to `target` (S1).
  This is the confirmed default for all activities in this contract.

Fields are always editable. Button state never disables or locks the input.

> **Current code note:** Several existing forms still open at `0` for
> button-controlled fields or auto-sync to totals using form effects. Later
> implementation stages must align those defaults with this contract.

---

## 2. 2-State Toggle Button

All **button-controlled** payment and cylinder fields use the same 2-state
toggle. There is no 3-state button anywhere in the app.

Fields that intentionally have no button (adjustment forms, wallet/bank
transfers, expense) are listed in Section 4.

**Label convention:** Button label describes what tapping will do next.
**Color convention:** Color describes the next button action - Green means
the button will fill/set the target value; Red means the button will clear the
field to zero.

### Three label variants

**Payment variant** - all money/payment fields except payment_from_company:

| State | Label | Field value | Color |
|---|---|---|---|
| S1 - default | Didn't pay | `target` | Red |
| S2 | Pay all | `0` | Green |

**Receive variant** - payment_from_company (company pays us) and replacement
cylinders (customer returns empties to us):

| State | Label | Field value | Color |
|---|---|---|---|
| S1 - default | Didn't receive | `target` | Red |
| S2 | Receive all | `0` | Green |

**Return variant** - all cylinder return fields:

| State | Label | Field value | Color |
|---|---|---|---|
| S1 - default | Didn't return | `target` | Red |
| S2 | Return all | `0` | Green |

> **Current code note:** `payment_from_company` currently reuses the "Didn't
> pay" label when the receive direction has a non-zero amount. This contract
> requires "Didn't receive".

### Tap Cycle

| Before tap: button | Before tap: field | Before tap: color | After tap: button | After tap: field | After tap: color |
|---|---:|---|---|---:|---|
| S1 | `target` | Red | S2 | `0` | Green |
| S2 | `0` | Green | S1 | `target` | Red |

> **Current code note:** Existing `payment_from_customer`,
> `payment_to_customer`, `payment_to_company`, `payment_from_company`,
> customer return, distributor return, and refill toggles mostly cycle between
> target and zero, but their labels and Green/Red assignment do not consistently
> match this table.

### Field -> Button Snap

Snap fires on every `onChangeText`.

| User typed field value | Button snaps to |
|---|---|
| exactly `target` | S1, Red |
| exactly `0` | S2, Green |
| anything else | no snap; keep previous button state |

> **Current code note:** Some current buttons derive state directly from
> `value === 0` or `value === target`, while others use partial replacement
> states. Later implementation must preserve the previous button state for
> custom values that do not match `target` or `0`.

### Free-Edit Guarantee

The field is always focusable and manually editable regardless of button state.
The user can type any custom value and use steppers to adjust after the button
sets the base value.

> **Current code note:** Distributor return sections can disable return inputs
> and hide the action button when the owed balance is zero. This violates the
> free-edit guarantee.

---

## 3. Shared Rules

1. Fields are always editable.
2. Button tap sets the field value.
3. Manual field typing can snap the button state.
4. Snap fires on every `onChangeText`, not only on blur.
5. Custom/manual values that do not match `target` or `0` keep the previous
   button state.
6. Button state does not disable, lock, hide, or blur the field.
7. Targets update when their source value changes:
   - replacement Cylinders target follows installed qty.
   - replacement Money target follows price x installed qty.
   - refill 12kg/48kg Return target follows bought qty.
   - refill Money target follows refill total cost.
8. When target changes: if the field was at the old target (S1 snap point),
   update the field to the new target and stay in S1. If the field was manually
   typed, preserve the manual value.

> **Current code note:** Existing replacement logic includes special
> `with_old` states that set values using old debt balances. This contract
> removes debt/credit button handling; debt and credit adjustments are manual.

---

## 4. Activity Reference Table

Activity kind names are the canonical identifiers used throughout the codebase.

> **Alias note:** In `orders/new.tsx`, `sell_iron` is the internal order mode
> that saves/highlights as `sell_full`, and `buy_iron` is the internal order
> mode that saves/highlights as `buy_empty_from_customer`. They are aliases for
> those canonical activity kinds, not separate activity kinds in this contract.

| Activity | Section | S1 label - Red | S2 label - Green | Target definition |
|---|---|---|---|---|
| replacement | Cylinders | Didn't receive | Receive all | installed qty |
| replacement | Money | Didn't pay | Pay all | price x installed qty |
| payment_from_customer | Money | Didn't pay | Pay all | customer money balance |
| payment_to_customer | Money | Didn't pay | Pay all | absolute value of customer credit balance |
| customer_return_empties | 12kg | Didn't return | Return all | 12kg cylinder balance customer owes |
| customer_return_empties | 48kg | Didn't return | Return all | 48kg cylinder balance customer owes |
| sell_full | Money | Didn't pay | Pay all | sell price x qty |
| buy_empty_from_customer | Money | Didn't pay | Pay all | buy price x qty |
| refill | 12kg Return | Didn't return | Return all | qty bought 12kg |
| refill | 48kg Return | Didn't return | Return all | qty bought 48kg |
| refill | Money | Didn't pay | Pay all | refill total cost |
| buy_full_from_company | Money | Didn't pay | Pay all | purchase total |
| dist_return_empties | 12kg | Didn't return | Return all | 12kg cylinder debt we owe distributor |
| dist_return_empties | 48kg | Didn't return | Return all | 48kg cylinder debt we owe distributor |
| payment_from_company | Money | Didn't receive | Receive all | absolute value of company credit owed to us |
| payment_to_company | Money | Didn't pay | Pay all | money debt we owe to company |

Activities with no button - amount fields only:

| Activity |
|---|
| adjust_customer_balance |
| adjust_company_balance |
| adjust_inventory |
| bank_to_wallet |
| wallet_to_bank |
| adjust_wallet |
| expense |

> **Current code note:** `sell_full`/`sell_iron` and
> `buy_empty_from_customer`/`buy_iron` currently have no payment toggle in
> `orders/new.tsx`. This contract requires a 2-state payment toggle for both.

---

## 5. Price Config Route

Canonical route: `/add?prices=1`

All in-form "Update price" buttons must navigate using:

```ts
router.push("/add?prices=1")
```

The route `/(tabs)/account/configuration/prices` is for account settings
navigation only. It is not the target for in-form price shortcuts.

> **Current code note:** `orders/new.tsx` already uses `/add?prices=1` for
> price setup notices. `AddRefillModal.tsx` currently routes "Set price"
> buttons to `/(tabs)/account/configuration/prices`; later stages must change
> those in-form shortcuts to the canonical route.

---

## 6. Existing Config File Map

Before creating any new file in later stages, check this map first.
Extend an existing file if the concept fits. Only create a new file when no
existing file is appropriate.

| Concept | Canonical file |
|---|---|
| Display strings, labels, wording | `frontend/lib/wording.ts` |
| Activity kind metadata | `frontend/lib/activityKindMeta.ts` |
| Balance transition / comment formatters | `frontend/lib/balanceTransitions.ts` |
| Money formatting | `frontend/lib/money.ts` |
| Date formatting | `frontend/lib/date.ts` |
| Count / integer input parsing | `frontend/lib/countInput.ts` |
| Ledger arithmetic | `frontend/lib/ledgerMath.ts` |
| Save flow / pending action helpers | `frontend/lib/saveFlow.ts` |
| Static design tokens | `frontend/constants/` |
| Gas size constants | `frontend/constants/gas.ts` |
| Currency display config | `frontend/constants/currency.ts` |

---

## 7. Current Code Notes

Discrepancies found while reading the scoped source files:

- `orders/new.tsx` uses internal modes `sell_iron` and `buy_iron`; these map
  to canonical activity kinds `sell_full` and `buy_empty_from_customer`.
- `replacement` Cylinders and Money currently include a `with_old` balance
  branch, using a teal/alternate button state for old debts. This contract
  removes button-managed debt/credit adjustments.
- `replacement` defaults currently pre-fill received/payment values from the
  selected system/installed total. This agrees with the target-default
  direction, but the labels/colors still need to be aligned with S1 Red.
- `payment_from_customer` and `payment_to_customer` currently show Green when
  the amount is zero and Red when it is non-zero. That color pairing matches
  this contract; later stages still need to align labels and snap behavior.
- `customer_return_empties` currently shows Green when received is non-zero and
  Red when it is zero. This is inverted relative to this contract.
- `sell_full` and `buy_empty_from_customer` currently have no payment toggle.
- `inventory/new.tsx` company payment currently uses "Didn't pay" for both pay
  and receive directions after a value is entered. `payment_from_company`
  requires "Didn't receive".
- `inventory/new.tsx` company payment currently shows Green at zero and Red at
  non-zero, matching this contract after the shared toggle migration.
- `AddRefillModal.tsx` return and paid toggles currently show Green at zero or
  at not-target states in several branches, and Red at target/non-zero states.
  This is inverted relative to this contract.
- `AddRefillModal.tsx` `buy_full_from_company` payment button can show
  "Paid all"; this contract requires "Didn't pay" at target and "Pay all" at
  zero.
- `AddRefillModal.tsx` disables return inputs and hides return buttons for
  zero-balance distributor return sections. This violates the free-edit rule.
- `CashExpensesView.tsx` covers expense, bank_to_wallet, and wallet_to_bank
  amount fields. Those activities intentionally have no button under this
  contract.
