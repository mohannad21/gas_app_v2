# Ticket: Price Input Form with Steppers + Expense Category Management Link

## Branch
Work on the existing branch:
```
git checkout fix/consolidate-screens
```

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.
- **Do not add features** not listed here.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.
- Run `cd backend && python -c "from app.routers.prices import router; print('OK')"` to confirm backend imports work.

---

## Overview

The `PriceInputForm` component (created in this ticket) is used in **two places**:
1. The onboarding wizard (`frontend/app/welcome/index.tsx`) — prices step
2. The profile configuration screen (`frontend/app/(tabs)/account/configuration/prices.tsx`)

The form has **5 expandable boxes** using the existing `BigBox` + `FieldPair` + `FieldCell` components:

| Box | Fields | Steppers | Default |
|-----|--------|----------|---------|
| Gas Selling Prices | sell12, sell48 | +1, −1, +5, −5 | **expanded** |
| Gas Buying Prices | buy12, buy48 | +1, −1, +0.01, −0.01 | **expanded** |
| Iron Buy — Customer | buyIron12, buyIron48 | +1, −1, +5, −5 | collapsed |
| Iron Buy — Company | companyIron12, companyIron48 | +1, −1, +0.01, −0.01 | collapsed |
| Iron Sell — Customer | sellIron12, sellIron48 | +1, −1, +5, −5 | collapsed |

`companyIron` is a **new field** — it requires a backend migration, model change, and schema change before the frontend work.

---

## Step 1 — Backend: add `company_iron_price` to the price catalog

### 1a — New migration file

**Create:** `backend/alembic/versions_v2/l1_add_company_iron_price.py`

```python
"""Add company_iron_price to price_catalog."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "l1_add_company_iron_price"
down_revision = "k1_add_tenant_profile_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "price_catalog",
        sa.Column("company_iron_price", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("price_catalog", "company_iron_price", server_default=None)


def downgrade() -> None:
    op.drop_column("price_catalog", "company_iron_price")
```

### 1b — Model

**File:** `backend/app/models.py`

Find the `PriceCatalog` model. It currently ends with:
```python
  buy_iron_price: int = Field(default=0)
```

Add one line after it:
```python
  company_iron_price: int = Field(default=0)
```

### 1c — Schema

**File:** `backend/app/schemas/price.py`

In `PriceCreate`, after `buying_iron_price: int = 0`, add:
```python
  company_iron_price: int = 0
```

In `PriceOut`, after `buying_iron_price: int`, add:
```python
  company_iron_price: int
```

### 1d — Prices router

**File:** `backend/app/routers/prices.py`

In `list_prices`, in each `PriceOut(...)` call, after `buying_iron_price=row.buy_iron_price,` add:
```python
      company_iron_price=row.company_iron_price,
```

In `create_price`, in the `PriceCatalog(...)` constructor, after `buy_iron_price=payload.buying_iron_price,` add:
```python
    company_iron_price=payload.company_iron_price,
```

In the `PriceOut(...)` return of `create_price`, after `buying_iron_price=row.buy_iron_price,` add:
```python
      company_iron_price=row.company_iron_price,
```

### 1e — System initialize schema

**File:** `backend/app/schemas/system.py`

Find `SystemInitialize`. After `buy_iron_price_48: int = 0`, add:
```python
  company_iron_price_12: int = 0
  company_iron_price_48: int = 0
```

### 1f — System initialize router

**File:** `backend/app/routers/system_global.py`

Find the two `PriceCatalog(...)` constructor calls (one for `"12kg"`, one for `"48kg"`).

In the `"12kg"` block, after `buy_iron_price=payload.buy_iron_price_12,` add:
```python
            company_iron_price=payload.company_iron_price_12,
```

In the `"48kg"` block, after `buy_iron_price=payload.buy_iron_price_48,` add:
```python
            company_iron_price=payload.company_iron_price_48,
```

---

## Step 2 — Frontend: update types and API layer

### 2a — Frontend type

**File:** `frontend/types/price.ts`

Read the file. In `PriceSettingSchema`, after `buying_iron_price: z.number().optional().nullable(),` add:
```ts
    company_iron_price: z.number().optional().nullable(),
```

### 2b — Frontend API

**File:** `frontend/lib/api/prices.ts`

Read the file.

In `listPriceSettings`, in the `.map(...)` that converts minor units, after the `buying_iron_price` conversion line, add:
```ts
    company_iron_price:
      p.company_iron_price != null ? fromMinorUnits(p.company_iron_price) : p.company_iron_price,
```

In `savePriceSetting`, add `company_iron_price?: number;` to the payload type. In the `api.post(...)` body, after `buying_iron_price: toMinorUnits(payload.buying_iron_price ?? 0),` add:
```ts
    company_iron_price: toMinorUnits(payload.company_iron_price ?? 0),
```

In the `return {...}` block, after the `buying_iron_price` conversion, add:
```ts
    company_iron_price:
      parsed.company_iron_price != null
        ? fromMinorUnits(parsed.company_iron_price)
        : parsed.company_iron_price,
```

---

## Step 3 — Create `PriceInputForm` component

**Create:** `frontend/components/PriceInputForm.tsx`

This component uses the existing `BigBox`, `FieldPair`, and `FieldCell` (with `FieldStepper`) from `@/components/entry/`.

```tsx
import BigBox from "@/components/entry/BigBox";
import FieldPair from "@/components/entry/FieldPair";
import { type FieldStepper } from "@/components/entry/FieldPair";

export type PriceFormValues = {
  sell12: number;
  sell48: number;
  buy12: number;
  buy48: number;
  buyIron12: number;
  buyIron48: number;
  companyIron12: number;
  companyIron48: number;
  sellIron12: number;
  sellIron48: number;
};

type Props = {
  values: PriceFormValues;
  onChange: (key: keyof PriceFormValues, value: number) => void;
  disabled?: boolean;
};

const SELL_STEPPERS: FieldStepper[] = [
  { delta: -5, label: "-5", position: "bottom" },
  { delta: 5, label: "+5", position: "top" },
];

const BUY_STEPPERS: FieldStepper[] = [
  { delta: -0.01, label: "-0.01", position: "bottom" },
  { delta: 0.01, label: "+0.01", position: "top" },
];

function makeCell(
  key: keyof PriceFormValues,
  title: string,
  values: PriceFormValues,
  onChange: Props["onChange"],
  steppers: FieldStepper[],
  disabled: boolean
) {
  const value = values[key];
  return {
    title,
    value,
    onIncrement: () => onChange(key, value + 1),
    onDecrement: () => onChange(key, Math.max(0, value - 1)),
    onChangeText: (text: string) => {
      const parsed = parseFloat(text);
      onChange(key, isNaN(parsed) ? 0 : Math.max(0, parsed));
    },
    steppers,
    editable: !disabled,
  };
}

export default function PriceInputForm({ values, onChange, disabled = false }: Props) {
  return (
    <>
      <BigBox title="Gas Selling Prices" defaultExpanded>
        <FieldPair
          left={makeCell("sell12", "12kg", values, onChange, SELL_STEPPERS, disabled)}
          right={makeCell("sell48", "48kg", values, onChange, SELL_STEPPERS, disabled)}
        />
      </BigBox>

      <BigBox title="Gas Buying Prices" defaultExpanded>
        <FieldPair
          left={makeCell("buy12", "12kg", values, onChange, BUY_STEPPERS, disabled)}
          right={makeCell("buy48", "48kg", values, onChange, BUY_STEPPERS, disabled)}
        />
      </BigBox>

      <BigBox title="Iron Buy — Customer">
        <FieldPair
          left={makeCell("buyIron12", "12kg", values, onChange, SELL_STEPPERS, disabled)}
          right={makeCell("buyIron48", "48kg", values, onChange, SELL_STEPPERS, disabled)}
        />
      </BigBox>

      <BigBox title="Iron Buy — Company">
        <FieldPair
          left={makeCell("companyIron12", "12kg", values, onChange, BUY_STEPPERS, disabled)}
          right={makeCell("companyIron48", "48kg", values, onChange, BUY_STEPPERS, disabled)}
        />
      </BigBox>

      <BigBox title="Iron Sell — Customer">
        <FieldPair
          left={makeCell("sellIron12", "12kg", values, onChange, SELL_STEPPERS, disabled)}
          right={makeCell("sellIron48", "48kg", values, onChange, SELL_STEPPERS, disabled)}
        />
      </BigBox>
    </>
  );
}
```

---

## Step 4 — Update `configuration/prices.tsx`

**File:** `frontend/app/(tabs)/account/configuration/prices.tsx`

Replace the entire file content with:

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { usePriceSettings, useSavePriceSetting } from "@/hooks/usePrices";
import PriceInputForm, { PriceFormValues } from "@/components/PriceInputForm";

const DEFAULT_VALUES: PriceFormValues = {
  sell12: 0, sell48: 0,
  buy12: 0, buy48: 0,
  buyIron12: 0, buyIron48: 0,
  companyIron12: 0, companyIron48: 0,
  sellIron12: 0, sellIron48: 0,
};

export default function PricesConfigurationScreen() {
  const router = useRouter();
  const pricesQuery = usePriceSettings();
  const savePriceMutation = useSavePriceSetting();
  const [values, setValues] = useState<PriceFormValues>(DEFAULT_VALUES);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!pricesQuery.data) return;
    const find = (gas: "12kg" | "48kg") =>
      pricesQuery.data!
        .filter((p) => p.gas_type === gas)
        .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    const p12 = find("12kg");
    const p48 = find("48kg");
    setValues({
      sell12: p12?.selling_price ?? 0,
      sell48: p48?.selling_price ?? 0,
      buy12: p12?.buying_price ?? 0,
      buy48: p48?.buying_price ?? 0,
      buyIron12: p12?.buying_iron_price ?? 0,
      buyIron48: p48?.buying_iron_price ?? 0,
      companyIron12: p12?.company_iron_price ?? 0,
      companyIron48: p48?.company_iron_price ?? 0,
      sellIron12: p12?.selling_iron_price ?? 0,
      sellIron48: p48?.selling_iron_price ?? 0,
    });
  }, [pricesQuery.data]);

  function handleChange(key: keyof PriceFormValues, value: number) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!values.sell12 || values.sell12 <= 0) {
      setFormError("Enter a valid 12kg selling price.");
      return;
    }
    if (!values.sell48 || values.sell48 <= 0) {
      setFormError("Enter a valid 48kg selling price.");
      return;
    }
    setFormError(null);
    try {
      await savePriceMutation.mutateAsync({
        gas_type: "12kg",
        selling_price: values.sell12,
        buying_price: values.buy12,
        buying_iron_price: values.buyIron12,
        company_iron_price: values.companyIron12,
        selling_iron_price: values.sellIron12,
      });
      await savePriceMutation.mutateAsync({
        gas_type: "48kg",
        selling_price: values.sell48,
        buying_price: values.buy48,
        buying_iron_price: values.buyIron48,
        company_iron_price: values.companyIron48,
        selling_iron_price: values.sellIron48,
      });
    } catch {
      // Error toast handled by mutation hook.
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>Prices</Text>
          <View style={styles.backButtonSpacer} />
        </View>

        {pricesQuery.isLoading ? (
          <View style={styles.centerCard}>
            <ActivityIndicator size="small" color="#0a7ea4" />
            <Text style={styles.meta}>Loading prices...</Text>
          </View>
        ) : null}

        {pricesQuery.isError ? (
          <View style={styles.centerCard}>
            <Text style={styles.errorText}>Could not load prices.</Text>
          </View>
        ) : null}

        {!pricesQuery.isLoading && !pricesQuery.isError ? (
          <PriceInputForm
            values={values}
            onChange={handleChange}
            disabled={savePriceMutation.isPending}
          />
        ) : null}

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryButton, savePriceMutation.isPending && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={savePriceMutation.isPending || pricesQuery.isLoading}
        >
          {savePriceMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Save Prices</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f7f9" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 112, gap: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  backButtonText: { fontSize: 20, color: "#111" },
  backButtonSpacer: { width: 36, height: 36 },
  title: { fontSize: 26, fontFamily: "NunitoSans-Bold" },
  centerCard: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 24, paddingHorizontal: 16, alignItems: "center", gap: 10 },
  meta: { color: "#64748b", fontSize: 13, fontFamily: "NunitoSans-Regular" },
  errorText: { color: "#b00020", fontSize: 14, fontFamily: "NunitoSans-SemiBold", marginTop: 8 },
  footer: { position: "absolute", left: 20, right: 20, bottom: 24 },
  primaryButton: { backgroundColor: "#0a7ea4", borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontFamily: "NunitoSans-Bold" },
  buttonDisabled: { opacity: 0.6 },
});
```

---

## Step 5 — Update the welcome wizard

**File:** `frontend/app/welcome/index.tsx`

Read the file first.

### 5a — Expand WizardState

Find the `type WizardState` block. It currently has `buyIron12: string` and `buyIron48: string` as the last price-related fields. Add two new string fields after `buyIron48`:

```ts
  companyIron12: string;
  companyIron48: string;
```

### 5b — Expand initialState

Find `const initialState: WizardState`. After `buyIron48: "",` add:

```ts
  companyIron12: "",
  companyIron48: "",
```

### 5c — Add import

After the existing imports at the top of the file, add:

```tsx
import PriceInputForm, { PriceFormValues } from "@/components/PriceInputForm";
```

### 5d — Replace prices step rendering

Find this line (around line 494):
```tsx
{step.type === "inputs" ? renderFields(step.fields) : null}
```

Replace it with:
```tsx
{step.type === "inputs" ? (
  step.id === "prices" ? (
    <PriceInputForm
      values={{
        sell12: toNumber(state.sell12),
        sell48: toNumber(state.sell48),
        buy12: toNumber(state.buy12),
        buy48: toNumber(state.buy48),
        buyIron12: toNumber(state.buyIron12),
        buyIron48: toNumber(state.buyIron48),
        companyIron12: toNumber(state.companyIron12),
        companyIron48: toNumber(state.companyIron48),
        sellIron12: toNumber(state.sellIron12),
        sellIron48: toNumber(state.sellIron48),
      }}
      onChange={(key: keyof PriceFormValues, value: number) =>
        updateField(key as keyof WizardState, String(value))
      }
    />
  ) : (
    renderFields(step.fields)
  )
) : null}
```

### 5e — Expand handleFinish payload

Find the `payload` object inside `handleFinish`. After `buy_iron_price_48: toNumber(state.buyIron48),` add:

```ts
        company_iron_price_12: toNumber(state.companyIron12),
        company_iron_price_48: toNumber(state.companyIron48),
```

**Do not change anything else in this file.**

---

## Step 6 — Add "Manage expense categories" link in the Add Expense flow

### Step 6a — Add prop to CashExpensesView

**File:** `frontend/components/CashExpensesView.tsx`

Read the file first.

In `CashExpensesViewProps` (around line 39), add before the closing `}`:

```tsx
  onManageCategories?: () => void;
```

In the component function where props are destructured, add `onManageCategories` to the list.

After the closing `</View>` of the `expenseTypeGrid` block (after `{expenseTypes.map(...)}` closes, around line 330), add:

```tsx
{onManageCategories ? (
  <Pressable onPress={onManageCategories} style={styles.manageCategoriesBtn}>
    <Text style={styles.manageCategoriesText}>Manage expense categories</Text>
  </Pressable>
) : null}
```

At the end of `StyleSheet.create({...})`, before the closing `}`, add:

```tsx
  manageCategoriesBtn: {
    marginTop: 4,
    alignSelf: "flex-start",
  },
  manageCategoriesText: {
    color: "#0a7ea4",
    fontSize: 13,
    fontFamily: "NunitoSans-SemiBold",
  },
```

### Step 6b — Pass the prop from expenses/new.tsx

**File:** `frontend/app/expenses/new.tsx`

Read the file. In the `<CashExpensesView ... />` block (around line 243), add before the closing `/>`:

```tsx
        onManageCategories={() => router.push("/(tabs)/account/configuration/expense-categories")}
```

`router` is already imported at the top. Do not add another import.

---

## Step 7 — Show recent expenses on the Expense Categories screen

**File:** `frontend/app/(tabs)/account/configuration/expense-categories.tsx`

Read the file first.

### 7a — Add imports

After the existing imports block (after line 22), add:

```tsx
import { useExpenses } from "@/hooks/useExpenses";
import { formatDateMedium } from "@/lib/date";
import { getCurrencyCode, getMoneyDecimals } from "@/lib/money";
```

### 7b — Add hook and helper

Inside the component body, after `const toggleCategoryMutation = useToggleExpenseCategory();`, add:

```tsx
  const expensesQuery = useExpenses();
  const recentExpenses = (expensesQuery.data ?? []).slice(0, 15);

  function formatMoney(value: number) {
    return `${value.toFixed(getMoneyDecimals())} ${getCurrencyCode()}`;
  }
```

### 7c — Add Recent Expenses section

Inside the `<ScrollView>`, after the closing of the categories section (`{!categoriesQuery.isLoading && !categoriesQuery.isError ? ... : null}`), add:

```tsx
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Expenses</Text>
          {expensesQuery.isLoading ? (
            <Text style={styles.emptyText}>Loading...</Text>
          ) : recentExpenses.length === 0 ? (
            <Text style={styles.emptyText}>No expenses recorded yet.</Text>
          ) : (
            recentExpenses.map((expense) => (
              <View key={expense.id} style={styles.itemRow}>
                <View style={styles.itemMain}>
                  <Text style={styles.itemTitle}>
                    {expense.expense_type.charAt(0).toUpperCase() + expense.expense_type.slice(1)}
                  </Text>
                  <Text style={styles.itemMeta}>{formatDateMedium(expense.date, undefined, "-")}</Text>
                </View>
                <Text style={styles.expenseAmount}>{formatMoney(expense.amount)}</Text>
              </View>
            ))
          )}
        </View>
```

### 7d — Add style and adjust paddingBottom

In `StyleSheet.create({...})`, before the closing `}`, add:

```tsx
  expenseAmount: {
    fontSize: 14,
    fontFamily: "NunitoSans-SemiBold",
    color: "#111",
  },
```

Change `paddingBottom: 112` in the `content` style to `paddingBottom: 160`.

---

## Verification

```bash
# Backend
cd backend && python -c "from app.routers.prices import router; print('OK')"

# Frontend
cd frontend && npm run build
```

Expected: 0 TypeScript errors, backend import succeeds.

Manual checks:
1. Run the Alembic migration: `cd backend && alembic upgrade head`
2. Profile → Configuration → Prices → 5 expandable boxes appear → Gas Selling and Gas Buying are open by default → iron boxes are collapsed → tap a +5 button → value increases → tap Save Prices → toast
3. Onboarding wizard → prices step shows the same 5 boxes
4. Add Expense → below expense type grid → "Manage expense categories" link → tap → opens Expense Categories screen
5. Expense Categories screen shows "Recent Expenses" section with last 15 entries
