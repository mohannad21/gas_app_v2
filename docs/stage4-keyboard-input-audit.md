# Stage 4 Keyboard/Input/Form Audit

Branch observed during audit: `feat/stage-4`

This audit records the current form ownership, keyboard wrappers, keyboard modes,
toggle usage, stepper usage, and footer constraints before Stage 4 implementation.

No production code was changed for this audit.

## Central Files Reviewed

- `frontend/constants/currency.ts`
- `frontend/constants/gas.ts`
- `frontend/constants/level3.ts`
- `frontend/constants/spacing.ts`
- `frontend/constants/theme.ts`
- `frontend/constants/typography.ts`
- `frontend/constants/steppers.ts`
- `frontend/lib/wording.ts`
- `frontend/lib/activityToggle.ts`
- `frontend/lib/activityKindMeta.ts`
- `frontend/lib/activityAdapter.ts`
- `frontend/lib/filterHelpers.ts`
- `frontend/lib/filterOptions.ts`
- `frontend/lib/balanceTransitions.ts`
- `frontend/lib/money.ts`
- `frontend/lib/date.ts`
- `frontend/lib/countInput.ts`
- `frontend/lib/ledgerMath.ts`
- `frontend/lib/saveFlow.ts`

## Form Files Reviewed

- `frontend/app/orders/new.tsx`
- `frontend/app/inventory/new.tsx`
- `frontend/components/AddRefillModal.tsx`
- `frontend/components/CashExpensesView.tsx`
- `frontend/components/entry/CompanyAdjustInlineForm.tsx`
- `frontend/components/entry/CustomerAdjustInlineForm.tsx`
- `frontend/components/entry/FieldPair.tsx`
- `frontend/components/entry/FooterActions.tsx`
- `frontend/components/entry/KeyboardAwareForm.tsx`
- `frontend/components/entry/KeyboardDismissView.tsx`
- `frontend/components/entry/ActivityToggleButton.tsx`
- `frontend/components/entry/PriceConfigButton.tsx`

## Keyboard Wrappers

| File | Line | Wrapper | Current scope | Footer inside wrapper? | Stage 4 note |
|---|---:|---|---|---|---|
| `frontend/app/orders/new.tsx` | 1515-1589 | `KeyboardAvoidingView` | WhatsApp/secondary modal area | No | Review only if S4-1 touches modal keyboard UX. |
| `frontend/app/orders/new.tsx` | 1594-2860 | `KeyboardAvoidingView` | Main orders screen body, scroll content, footer, and iOS accessory | Yes, `FooterActions` at 2778 | S4-1 must not blindly migrate this full wrapper; footer behavior must be decided from UX. |
| `frontend/app/orders/new.tsx` | 2614-2740 | `KeyboardAvoidingView` | Initialize inventory modal inside orders screen | No `FooterActions`; contains iOS accessory at 2732 | S4-1 removes Done accessory and can keep/replace modal body wrapper if safe. |
| `frontend/components/AddRefillModal.tsx` | 1296-1308 | `KeyboardAvoidingView` | Refill modal body wrapper | No | S4-1 can review for form-body-only keyboard behavior. |
| `frontend/components/AddRefillModal.tsx` | 1467-1536 | `KeyboardAvoidingView` | Buy-full/company modal body, fields, and footer | Yes, `FooterActions` at 1527 | S4-8 must avoid wrapping this footer if it should stay behind keyboard. |
| `frontend/components/CashExpensesView.tsx` | 339-429 | `KeyboardAvoidingView` | Cash/expense form body card only | No, `FooterActions` at 431 is outside | Current placement matches the safe pattern. |
| `frontend/components/entry/CompanyAdjustInlineForm.tsx` | 449-525 | `KeyboardAvoidingView` | Company adjust scroll content, footer, calendar/time modals | Yes, `FooterActions` at 512 | S4-9 should move keyboard behavior to body only if footer should stay behind keyboard. |
| `frontend/components/entry/KeyboardAwareForm.tsx` | 49-60 | `KeyboardAvoidingView` | Shared wrapper component | N/A | Safe only around form body/scroll content, not full hubs or absolute footers. |

## InputAccessoryView Done Buttons

| File | Line | Native ID / purpose | Remove in S4-1? | Notes |
|---|---:|---|---|---|
| `frontend/app/orders/new.tsx` | 2732-2738 | `initAccessoryId` for initialize inventory modal | Yes | Also remove matching `inputAccessoryViewID={initAccessoryId}` on lines 2646, 2661, 2678, 2693. |
| `frontend/app/orders/new.tsx` | 2852-2858 | `orderAccessoryId` for main orders form | Yes | Also remove matching order-field accessory wiring found by S4-1. |
| `frontend/app/inventory/new.tsx` | 1279-1285 | `accessoryId` for inventory/company hub inline forms | Yes | Hub-level KAV was removed in S3.5; do not re-add it. |
| `frontend/components/AddRefillModal.tsx` | 1233-1239 | `paidAccessoryViewId` for refill/buy paid amount | Yes | Remove paid-field accessory wiring with this Done button. |
| `frontend/components/entry/CompanyAdjustInlineForm.tsx` | 527-533 | `accessoryId` for company adjust note field | Yes | KAV closes before this accessory. |
| `frontend/components/entry/CustomerAdjustInlineForm.tsx` | 455-461 | `accessoryId` for customer adjust reason field | Yes | No KAV in this file. |

## Text Inputs And Keyboard Types

| File | Line | Form/activity | Field | Current keyboard/input/value mode | Expected mode | Stage 4 ticket |
|---|---:|---|---|---|---|---|
| `frontend/components/entry/FieldPair.tsx` | 196-197 | shared `FieldCell` | numeric field engine | decimal -> `decimal-pad`/`decimal`, integer -> `number-pad`/`numeric` | Review in S4-0/S4-1; do not change globally unless proven safe | S4-1 |
| `frontend/app/orders/new.tsx` | 2051 | replacement | `price_total` | `valueMode="decimal"` | decimal | S4-2 |
| `frontend/app/orders/new.tsx` | 2085 | replacement | `paid_amount` | `valueMode="decimal"` | decimal unless S4-2 changes payment spec | S4-2 |
| `frontend/app/orders/new.tsx` | 2160 | customer payment | `paid_amount` | `valueMode="decimal"` | integer per bug list for payment_from_customer/payment_to_customer | S4-4 |
| `frontend/app/orders/new.tsx` | 2337 | sell_full | `Iron Price` | `valueMode="decimal"` | decimal price field | S4-3 |
| `frontend/app/orders/new.tsx` | 2378 | sell_full | `Gas Price` | `valueMode="decimal"` | decimal price field | S4-3 |
| `frontend/app/orders/new.tsx` | 2414 | sell_full | read-only total | `valueMode="decimal"` | decimal read-only total | S4-3 |
| `frontend/app/orders/new.tsx` | 2430 | sell_full | `paid_amount` | `valueMode="decimal"` | integer if S4-0 bug spec applies to paid amount | S4-3 |
| `frontend/app/orders/new.tsx` | 2497 | buy_empty_from_customer | `Iron Price` | `valueMode="decimal"` | decimal price field | S4-3 |
| `frontend/app/orders/new.tsx` | 2533 | buy_empty_from_customer | read-only total | `valueMode="decimal"` | decimal read-only total | S4-3 |
| `frontend/app/orders/new.tsx` | 2549 | buy_empty_from_customer | `paid_amount` | `valueMode="decimal"` | integer if S4-0 bug spec applies to paid amount | S4-3 |
| `frontend/app/orders/new.tsx` | 2641-2693 | initialize inventory | full/empty counts | `keyboardType="numeric"`, `inputMode="numeric"` | integer | S4-1 |
| `frontend/app/orders/new.tsx` | 2812-2838 | sticky payment display | read-only total/paid | `keyboardType="numeric"`, `inputMode="numeric"`, `editable={false}` | integer/read-only display | S4-1 |
| `frontend/app/inventory/new.tsx` | 617 | cash adjustment | `Amount` | `valueMode="decimal"` | integer/negative support per bug list for adjust_wallet | S4-10/S4-9 routing note |
| `frontend/app/inventory/new.tsx` | 902 | company payment | `Amount` | `valueMode="decimal"` | decimal fine-grain per company payment bug list | S4-9 |
| `frontend/components/AddRefillModal.tsx` | 1074 | refill/buy | iron price 12kg | `valueMode="decimal"` | decimal price, read-only in buy_full after S4-8 | S4-8 |
| `frontend/components/AddRefillModal.tsx` | 1112 | refill/buy | iron price 48kg | `valueMode="decimal"` | decimal price, read-only in buy_full after S4-8 | S4-8 |
| `frontend/components/AddRefillModal.tsx` | 1152 | refill/buy | total | `valueMode="decimal"`, `editable={false}` | decimal read-only | S4-7/S4-8 |
| `frontend/components/AddRefillModal.tsx` | 1161 | refill/buy | paid | `valueMode="decimal"` | decimal for refill/buy full payment | S4-7/S4-8 |
| `frontend/components/AddRefillModal.tsx` | 1485-1520 | buy-full modal | full/empty counts | `keyboardType="numeric"` | integer | S4-1/S4-8 |
| `frontend/components/CashExpensesView.tsx` | 379 | expense | amount | `valueMode="decimal"` | decimal with fine steppers | S4-10 |
| `frontend/components/CashExpensesView.tsx` | 411 | bank/wallet transfer | amount | `valueMode="decimal"` | integer per bug list for bank_to_wallet/wallet_to_bank/adjust_wallet | S4-10 |
| `frontend/components/entry/CompanyAdjustInlineForm.tsx` | 428, 480 | adjust_company_balance | money amount | dynamic `valueMode`, money passes `"decimal"` | decimal/fine money steppers; preserve sign semantics | S4-9 |
| `frontend/components/entry/CompanyAdjustInlineForm.tsx` | 489, 498 | adjust_company_balance | cylinder amounts | default integer mode | integer with cylinder steppers | S4-9 |
| `frontend/components/entry/CustomerAdjustInlineForm.tsx` | 363, 400 | adjust_customer_balance | money amount | dynamic `valueMode`, money passes `"decimal"` | integer per bug list | S4-9 |
| `frontend/components/entry/CustomerAdjustInlineForm.tsx` | 409, 418 | adjust_customer_balance | cylinder amounts | default integer mode | integer with cylinder steppers | S4-9 |

## Footer Behavior

Rule: full hub screens and absolute `FooterActions` must not be wrapped in `KeyboardAwareForm`.

| File | Line | Footer owner | Absolute footer? | Should stay behind keyboard? | Stage 4 note |
|---|---:|---|---|---|---|
| `frontend/app/orders/new.tsx` | 2778 | main orders form | Yes, shared `FooterActions` is absolute | Confirm in S4-1 | Currently inside outer KAV; do not blindly migrate. |
| `frontend/app/inventory/new.tsx` | 471 | inventory adjustment form | Yes | Yes, current S3.5 pattern keeps hub wrapper as normal `View` | Keep hub-level KAV removed. |
| `frontend/app/inventory/new.tsx` | 630 | cash adjustment form | Yes | Yes | Keep hub-level KAV removed. |
| `frontend/app/inventory/new.tsx` | 947 | company payment form | Yes | Yes | Current pilot fixed footer floating by removing hub-level KAV. |
| `frontend/components/AddRefillModal.tsx` | 630 | refill modal/card footer | Yes | Confirm per modal UX | Outside KAV at this point. |
| `frontend/components/AddRefillModal.tsx` | 1527 | buy-full modal footer | Yes | Likely yes | Currently inside KAV; review in S4-8. |
| `frontend/components/CashExpensesView.tsx` | 431 | cash/expense view footer | Yes | Yes | Already outside KAV; safe pattern. |
| `frontend/components/entry/CompanyAdjustInlineForm.tsx` | 512 | company adjust footer | Yes | Likely yes | Currently inside KAV; review in S4-9. |
| `frontend/components/entry/CustomerAdjustInlineForm.tsx` | 433 | customer adjust footer | Yes | Yes | No KAV in file; safe pattern. |

## Inline Toggle Buttons Still Present

| File | Line | Activity/form | Current labels | Should migrate to ActivityToggleButton? | Stage 4 ticket |
|---|---:|---|---|---|---|
| `frontend/app/orders/new.tsx` | 2006-2024 | replacement received | `Didn't return`, `Returned`, `Returned all` | Yes, receive variant; old labels/state are non-contract | S4-2 |
| `frontend/app/orders/new.tsx` | 2111-2129 | replacement payment | `Didn't pay`, `Paid`, `Paid all` | Yes, payment variant | S4-2 |
| `frontend/app/orders/new.tsx` | 2186-2200 | payment_from_customer/payment_to_customer | `Pay all`, `Receive all`, `Didn't pay` | Yes, payment/receive behavior needs S4-4 review | S4-4 |
| `frontend/app/orders/new.tsx` | 2248-2258 | customer_return_empties | `Didn't return`, `Return all` | Yes, return variant | S4-5 |
| `frontend/components/AddRefillModal.tsx` | 757-773 | dist_return_empties 12kg | `Didn't return`, `Return all` | Yes, return variant and zero-balance visibility fix | S4-6 |
| `frontend/components/AddRefillModal.tsx` | 804-820 | dist_return_empties 48kg | `Didn't return`, `Return all` | Yes, return variant and zero-balance visibility fix | S4-6 |
| `frontend/components/AddRefillModal.tsx` | 863-879 | refill 12kg return | `Didn't return`, `Returned` | Yes, return variant; label should be `Return all` | S4-7 |
| `frontend/components/AddRefillModal.tsx` | 913-929 | refill 48kg return | `Didn't return`, `Returned` | Yes, return variant; label should be `Return all` | S4-7 |
| `frontend/components/AddRefillModal.tsx` | 987-997 | refill/buy 12kg price shortcut | `Set price` | Replace with `PriceConfigButton` or canonical route | S4-7/S4-8 |
| `frontend/components/AddRefillModal.tsx` | 1039-1049 | refill/buy 48kg price shortcut | `Set price` | Replace with `PriceConfigButton` or canonical route | S4-7/S4-8 |
| `frontend/components/AddRefillModal.tsx` | 1179-1191 | refill/buy payment | `Paid all`, `Didn't pay` | Yes, payment variant; label should be `Pay all` | S4-7/S4-8 |
| `frontend/app/inventory/new.tsx` | 1525, 1534 | inventory styles only | no active JSX usage found | Cleanup only after Stage 4 if still unused | S5 |

## Shared ActivityToggleButton Already Used

| File | Line | Activity/form | Variant | Notes |
|---|---:|---|---|---|
| `frontend/app/inventory/new.tsx` | 721, 911 | payment_to_company/payment_from_company | `payment` or `receive` via `getActivityToggleVariant` | S3.5 pilot already migrated this company payment form. |

## Local Stepper Arrays

| File | Line | Local constant | Values | Existing shared preset? | Stage 4 action |
|---|---:|---|---|---|---|
| `frontend/app/inventory/new.tsx` | 67 | `CASH_ADJUST_STEPPERS` | -100, +100, -20, +20, -5, +5 | `MONEY_100_20_5_STEPPERS` | Replace if exact behavior still desired; S4-10 may require finer preset. |
| `frontend/app/inventory/new.tsx` | 75 | `MONEY_STEPPERS` | -20, +20, -5, +5 | `MONEY_20_5_STEPPERS` | Replace in S4-9 unless company payment needs fine decimal steppers. |
| `frontend/components/AddRefillModal.tsx` | 187 | `FIELD_MONEY_STEPPERS` | -20, +20, -5, +5 | `MONEY_20_5_STEPPERS` | Replace in S4-7/S4-8. |
| `frontend/components/AddRefillModal.tsx` | 193 | `FIELD_PAID_STEPPERS` | -20, +20, -5, +5, -1, +1, -0.1, +0.1, -0.01, +0.01 | `MONEY_FINE_DECIMAL_STEPPERS` except lacks +/-20 positions matching? Same deltas | Replace in S4-7/S4-8 if layout positions are acceptable. |
| `frontend/components/AddRefillModal.tsx` | 205 | `FIELD_QTY_STEPPERS` | -1, +1 with compact labels | `COMPACT_COUNT_1_STEPPERS` | Replace in S4-7/S4-8. |
| `frontend/components/CashExpensesView.tsx` | 106 | `MONEY_STEPPERS` | -100, +100, -20, +20, -5, +5 | `MONEY_100_20_5_STEPPERS` | S4-10 needs expense fine preset including -1/+1/-0.1/+0.1/-0.01/+0.01. |
| `frontend/components/entry/CompanyAdjustInlineForm.tsx` | 48 | `MONEY_STEPPERS` | -20, +20, -5, +5 | `MONEY_20_5_STEPPERS` | S4-9 likely needs `MONEY_FINE_DECIMAL_STEPPERS`. |
| `frontend/components/entry/CompanyAdjustInlineForm.tsx` | 55 | `QTY_STEPPERS` | -1, +1 | `COUNT_1_STEPPERS` | Replace in S4-9 if exact. |
| `frontend/components/entry/CustomerAdjustInlineForm.tsx` | 46 | `MONEY_STEPPERS` | -100, +100, -20, +20, -5, +5 | `MONEY_100_20_5_STEPPERS` | S4-9 changes keyboard type; stepper spec should be confirmed. |
| `frontend/components/entry/CustomerAdjustInlineForm.tsx` | 55 | `COUNT_STEPPERS` | -5, +5, -1, +1 | `QTY_5_1_STEPPERS` | Replace in S4-9 if exact. |

## Activity Ownership

| Activity / bug area | Owner file(s) | Confirmed lines | Stage 4 ticket |
|---|---|---:|---|
| `replacement` | `frontend/app/orders/new.tsx` | replacement sections around 1960-2130 | S4-2 |
| `sell_full` | `frontend/app/orders/new.tsx` | sell/full alias section around 2300-2455 | S4-3 |
| `buy_empty_from_customer` | `frontend/app/orders/new.tsx` | buy-empty alias section around 2470-2565 | S4-3 |
| `payment_from_customer` | `frontend/app/orders/new.tsx` | event type line 1090, payment UI around 2140-2200 | S4-4 |
| `payment_to_customer` | `frontend/app/orders/new.tsx` | event type line 1090, payment UI around 2140-2200 | S4-4 |
| `customer_return_empties` | `frontend/app/orders/new.tsx` | event type line 1160, return UI around 2220-2260 | S4-5 |
| `dist_return_empties` | `frontend/components/AddRefillModal.tsx`; edit routing in `frontend/app/inventory/new.tsx` | AddRefill owner line 72; inventory edit detection lines 1079, 1120 | S4-6 |
| `refill` | `frontend/components/AddRefillModal.tsx`; launched by `frontend/app/inventory/new.tsx` | AddRefill owner lines 71-72, 177-184; inventory mode line 1209 | S4-7 |
| `buy_full_from_company` | `frontend/components/AddRefillModal.tsx`; launched by `frontend/app/inventory/new.tsx` | AddRefill owner line 72; buy UI around 700-1195; inventory mode line 1209 | S4-8 |
| `payment_to_company` | `frontend/app/inventory/new.tsx` | kind line 762, highlight line 771, toggle variant line 721 | S4-9 |
| `payment_from_company` | `frontend/app/inventory/new.tsx` | kind line 762, highlight line 771, toggle variant line 721 | S4-9 |
| `adjust_company_balance` | `frontend/components/entry/CompanyAdjustInlineForm.tsx`; launched by `frontend/app/inventory/new.tsx` | amount render line 428; hub usage line 1235 | S4-9 |
| `adjust_customer_balance` | `frontend/components/entry/CustomerAdjustInlineForm.tsx` | amount render line 363 | S4-9 |
| `adjust_inventory` | `frontend/app/inventory/new.tsx` | footer line 471 and inventory adjust form root before line 500 | Guardrail only |
| `expense` | `frontend/components/CashExpensesView.tsx` | mode labels lines 30-32, amount line 379 | S4-10 |
| `bank_to_wallet` | `frontend/components/CashExpensesView.tsx`; transfer route links in orders/AddRefill/inventory | mode line 32, transfer line 411 | S4-10 |
| `wallet_to_bank` | `frontend/components/CashExpensesView.tsx` | mode line 31, transfer line 411 | S4-10 |
| `adjust_wallet` | `frontend/app/inventory/new.tsx` cash adjustment form and `CashExpensesView` related money workflow | highlight lines 576-579, amount line 617 | S4-10 |

## Dist Return Empties Ownership

Confirmed owner file(s):

- `frontend/components/AddRefillModal.tsx`
- `frontend/app/inventory/new.tsx` only routes/loads edit state; it is not the owner form.

Evidence:

- `frontend/components/AddRefillModal.tsx:72` maps `mode === "return"` to `dist_return_empties`.
- `frontend/components/AddRefillModal.tsx:477` and `502` submit/update return mode with kind `dist_return_empties`.
- `frontend/app/inventory/new.tsx:1079` and `1120` inspect `dist_return_empties` to open the Return tab for editing.

Stage 4 ticket:

- S4-6

## Buy Full From Company Ownership

Confirmed owner file(s):

- `frontend/components/AddRefillModal.tsx`
- `frontend/app/inventory/new.tsx` only launches the AddRefillModal form in `mode="buy"`.

Evidence:

- `frontend/components/AddRefillModal.tsx:72` maps `mode === "buy"` to `buy_full_from_company`.
- `frontend/components/AddRefillModal.tsx:360`, `369`, and `378` use `company_buy_full` intent in buy mode.
- `frontend/app/inventory/new.tsx:1209` passes `mode={activeTab === "return" ? "return" : activeTab === "buy" ? "buy" : "refill"}`.

Stage 4 ticket:

- S4-8

## Keyboard UX Rules For S4-1

- Remove activity-form `InputAccessoryView` Done buttons.
- Do not wrap full hub screens with `KeyboardAwareForm`.
- Do not wrap `FooterActions` with `KeyboardAwareForm`.
- Use keyboard-aware behavior only inside form body/scroll content.
- If a footer should stay behind the keyboard, it must remain outside keyboard-aware layout.
- Tap-outside dismiss must not move absolute footers.
- `CashExpensesView.tsx` is the current safe example: KAV around body content, footer outside.
- `inventory/new.tsx` is the current hub warning example: hub-level KAV was removed because it moved the footer.

## Open Questions Before Implementation

| Question | Blocking ticket | Answer / recommendation |
|---|---|---|
| Should orders main `FooterActions` stay behind the keyboard like inventory? | S4-1 | Confirm manually before changing outer orders KAV; do not blindly wrap with shared KAV. |
| Should company adjust footer stay behind the keyboard? | S4-9 | If yes, move KAV to body content only. |
| Should buy-full modal footer stay behind the keyboard? | S4-8 | If yes, remove footer from KAV scope. |
| Do customer payment paid fields require integer keyboard even when money can be decimal? | S4-4 | Bug list says decimal -> integer; implement only in affected payment forms. |
| Does CashExpensesView need a new shared expense fine stepper preset? | S4-10 | Yes if final expense set is -100/+100/-20/+20/-5/+5/-1/+1/-0.1/+0.1/-0.01/+0.01. |

## S4 Ticket Routing Notes

| Ticket | Confirmed files | Notes |
|---|---|---|
| S4-1 | `orders/new.tsx`, `inventory/new.tsx`, `AddRefillModal.tsx`, `CashExpensesView.tsx`, `CompanyAdjustInlineForm.tsx`, `CustomerAdjustInlineForm.tsx` | Remove Done buttons and place keyboard wrappers safely. |
| S4-2 | `orders/new.tsx` | Replacement received/payment toggles and Gas Selling Price. |
| S4-3 | `orders/new.tsx` | Sell full and buy empty customer trade controls. |
| S4-4 | `orders/new.tsx` | Customer payment forms. |
| S4-5 | `orders/new.tsx` | Customer return empties. |
| S4-6 | `AddRefillModal.tsx`; edit routing in `inventory/new.tsx` only if needed | Distributor return empties owner confirmed as AddRefillModal. |
| S4-7 | `AddRefillModal.tsx` | Refill form. |
| S4-8 | `AddRefillModal.tsx` | Buy full from company owner confirmed as AddRefillModal. |
| S4-9 | `inventory/new.tsx`, `CompanyAdjustInlineForm.tsx`, `CustomerAdjustInlineForm.tsx` | Company payment and adjust forms. |
| S4-10 | `CashExpensesView.tsx`, maybe `frontend/constants/steppers.ts` | Cash expense/wallet keyboards and stepper presets. |
| S4-11 | `tests/frontend/__tests__/` | Regression tests only. |
