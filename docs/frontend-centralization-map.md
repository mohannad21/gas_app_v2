# Frontend Centralization Map

This map explains where shared frontend concepts live. Update this file whenever a ticket adds a new central file, shared preset, shared route, shared metadata registry, or shared behavior.

## Static Design Tokens

Directory: `frontend/constants/`

- `colors.ts`  
  Global semantic color system: brand, surface, text, border, scope, intent, gas, price category, and Level 3 report colors.

- `currency.ts`  
  Default currency code.

- `gas.ts`  
  Gas type colors and gas color lookup.

- `level3.ts`  
  Level 3 report display tokens: spacing, typography, and report-row colors.

- `prices.ts`
  Price configuration metadata: price families, price section tabs, field mappings, default form values, and price category color keys.

- `spacing.ts`  
  Shared spacing scale.

- `steppers.ts`  
  Shared numeric stepper presets and `FieldStepper` types.

- `theme.ts`  
  App theme colors and platform font mapping.

- `typography.ts`  
  Shared font families and font sizes.

## Business Logic, Registries, And Formatters

Directory: `frontend/lib/`

- `wording.ts`  
  Shared display strings and wording helpers.

- `activityKindMeta.ts`  
  Activity kind registry, activity groups, activity labels, report card metadata, filter group labels, and activity surface visibility.

- `activityToggle.ts`  
  Shared 2-state activity toggle logic, snap behavior, target-change behavior, and activity-field-to-toggle-variant mapping.

- `activityAdapter.ts`  
  Domain-to-daily-report event shape converters.

- `filterHelpers.ts`  
  Filter badge visibility and filter state helper logic.

- `filterOptions.ts`  
  Filter hierarchy, chip option builders, and filter option metadata.

- `balanceTransitions.ts`  
  Balance transition formatters and transition comment helpers.

- `money.ts`  
  Money formatting, currency symbol lookup, decimal configuration, and minor-unit helpers.

- `priceResolution.ts`
  Shared price selection logic for latest-price and effective-at price lookup.

- `date.ts`  
  Date/time parsing and display formatting.

- `countInput.ts`  
  Integer count input sanitizing and parsing.

- `ledgerMath.ts`  
  Ledger math helpers for customer/company money and cylinder deltas.

- `saveFlow.ts`  
  Add-flow report routing helpers and report highlight params.

## Utility Files

These are shared utilities, not configuration registries.

- `frontend/lib/addShortcut.ts`
- `frontend/lib/apiErrors.ts`
- `frontend/lib/auth-storage.ts`
- `frontend/lib/toast.ts`
- `frontend/lib/successPulse.ts`

## Other Existing Config-Like Files

These files currently contain local or specialized metadata/config and should be considered before adding duplicates.

- `frontend/lib/i18n/translations.ts`  
  Translation dictionary.

- `frontend/lib/reports/eventColors.ts`  
  Report event color helpers/config. Review before adding report-specific colors.

- `frontend/components/customers/customerListFilters.ts`  
  Customer list filter option metadata.

- `frontend/components/PriceInputForm.tsx`  
  Price form field layout and local price stepper usage. If price field metadata grows, consider moving metadata to a central price config file.

- `frontend/components/PriceMatrix.tsx`  
  Legacy price matrix component/config. Review before reuse; may be cleanup candidate if unused.

- `frontend/app/(tabs)/reports/index.tsx`  
  Contains report filter option config local to the reports screen.

- `frontend/components/AddRefillModal.tsx`  
  Contains local refill/buy/return form steppers and labels. Prefer central `frontend/constants/steppers.ts` for new shared presets.

- `frontend/components/CashExpensesView.tsx`  
  Contains local expense mode labels, expense icon map, and money steppers. Prefer central files for new shared concepts.

- `frontend/components/entry/CompanyAdjustInlineForm.tsx`  
  Contains local balance selector options and steppers.

- `frontend/components/entry/CustomerAdjustInlineForm.tsx`  
  Contains local balance selector options and steppers.

- `frontend/app/welcome/index.tsx`  
  Contains setup wizard field definitions and local steppers.

## Shared Entry UI Components

- `frontend/components/entry/FormActionRow.tsx`
  Shared layout wrapper for form action buttons. Use it for full-width single-field actions and left/right aligned two-field actions.

- `frontend/components/entry/ActivityToggleButton.tsx`
  Shared 2-state action button for payment, receive, and return toggles. Labels come from `frontend/lib/wording.ts`; behavior comes from `frontend/lib/activityToggle.ts`.

## Routes

Known canonical route decisions:

- Price configuration: `/(tabs)/account/configuration/prices`
- Old Add price modal route `/add?prices=1` must not be used.

If more repeated routes are added, centralize them before reuse.

## Colors

Central color file:

- `frontend/constants/colors.ts`

Exports `AppColors` with these groups:

- `brand` — app primary color and text-on-primary color
- `surface` — app/card/muted/subtle surface colors
- `text` — primary, secondary, muted, inverse text colors
- `border` — default and muted border colors
- `scope` — customer, company, money, ledger activity colors
- `intent` — success, danger, warning, neutral colors and supporting backgrounds/borders
- `gas` — 12kg, 48kg, fallback
- `price` — customer/company price accents and named price category colors
- `level3` — Level 3 report display colors

Do not add new hardcoded colors in `frontend/app/` or `frontend/components/` unless explicitly approved.

Migrated central color consumers:

- `frontend/constants/theme.ts` - uses `AppColors` for light brand tint and matching light card background values
- `frontend/constants/gas.ts` - uses `AppColors.gas`
- `frontend/constants/level3.ts` - uses `AppColors.level3`
- `frontend/lib/activityKindMeta.ts` - uses `AppColors.scope`
- `frontend/lib/reports/eventColors.ts` - uses centralized report fallback color
- `frontend/components/entry/ActivityToggleButton.tsx` - uses `AppColors.intent` and `AppColors.brand.onPrimary`
- `frontend/components/entry/FooterActions.tsx` - uses `AppColors.brand` and `AppColors.intent`
- `frontend/components/entry/PriceConfigButton.tsx` - uses `AppColors.brand`

Known intentional exception:

- `frontend/constants/theme.ts` keeps `tintColorDark = "#fff"` because dark-mode theme tint is not the same semantic concept as `brand.onPrimary`.

Known remaining local colors:

- Screen-level and component-level hardcoded colors outside this P2 scope still exist.
- Do not add new hardcoded colors in future tickets; reuse `AppColors` or add a new semantic token centrally.

## Prices

Current price config route:

- `/(tabs)/account/configuration/prices`

Current price form value type:

- `PriceFormValues` in `frontend/constants/prices.ts`

Central price metadata file:

- `frontend/constants/prices.ts`

Contains:

- price family tabs: Gas, Iron
- price section tabs: Buy from Company, Sell to Customer, Buy from Customer
- mapping from each price section to `PriceFormValues` keys
- default price form values
- price category color keys for P4/P5 accents

## Updating This Map

Any ticket that adds a central file or moves a shared concept must update this map in the same ticket.

Examples:

- adding `frontend/constants/colors.ts`
- adding `frontend/constants/prices.ts`
- moving local steppers into `frontend/constants/steppers.ts`
- moving labels into `frontend/lib/wording.ts`
- adding a shared route helper
- adding a shared UI behavior/hook
