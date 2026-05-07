# Ticket: Centralized Currency Settings — Update Endpoint + Settings Screen

## Branch
Stay on the current branch — do NOT create a new branch.

---

## Rules — Read These First

- **Read every file before modifying it.**
- **No improvisation.** If anything is unclear, stop and ask.
- No logic changes beyond what is described. Do not touch unrelated code.
- Run the verification commands at the end and confirm they pass.

---

## Background

Currency (`currency_code`) and decimal precision (`money_decimals`) are stored in the
`SystemSettings` table and served by `GET /system/settings`. The frontend reads them at boot
via `getSystemSettings()` in `frontend/lib/api/company.ts`, which calls `setCurrencyCode()` and
`setMoneyDecimals()` — module-level globals in `frontend/lib/money.ts` that every component
reads at render time via `getCurrencyCode()` / `getCurrencySymbol()`.

**The gap:** there is no endpoint to update these settings after initialization, and no UI to
change currency. This ticket adds both.

There is also one remaining bug: `balanceTransitions.ts` calls `getCurrencyCode()` in one place
where it should call `getCurrencySymbol()`, causing preview text in order/inventory screens to
show "70 USD" instead of "70 $".

---

## Step 1 — Add `SystemSettingsUpdate` schema

**File:** `backend/app/schemas/system.py`

Read the file first.

`Optional` is already imported at the top of this file. Find the `SystemSettingsOut` class
(currently at line 63):

```python
class SystemSettingsOut(SQLModel):
  id: str
  is_setup_completed: bool
  currency_code: str
  money_decimals: int
  created_at: datetime
```

Add the following new class **directly after** `SystemSettingsOut`:

```python
class SystemSettingsUpdate(SQLModel):
  currency_code: Optional[str] = None
  money_decimals: Optional[int] = None
```

**Do not change anything else in this file.**

---

## Step 2 — Export `SystemSettingsUpdate` from the schemas package

**File:** `backend/app/schemas/__init__.py`

Read the file first.

Find the line that imports from `.system`. It currently looks like:

```python
from .system import CustomerOpeningBalance, LedgerHealthIssue, SystemCreate, SystemHealthCheckOut, SystemInitialize, SystemOut, SystemSettingsOut, SystemTypeOptionCreate, SystemTypeOptionOut, SystemTypeOptionUpdate, SystemUpdate
```

Add `SystemSettingsUpdate` to that same import line (keep alphabetical order within the list).

**Do not change anything else in this file.**

---

## Step 3 — Add `PATCH /system/settings` endpoint

**File:** `backend/app/routers/system_global.py`

Read the file first.

### 3a — Update the schemas import

Find:
```python
from app.schemas import (
    LedgerHealthIssue, 
    SystemHealthCheckOut, 
    SystemInitialize, 
    SystemSettingsOut
)
```

Replace with:
```python
from app.schemas import (
    LedgerHealthIssue,
    SystemHealthCheckOut,
    SystemInitialize,
    SystemSettingsOut,
    SystemSettingsUpdate,
)
```

### 3b — Add the endpoint

`get_system_settings` ends at line ~60 and `initialize_system` starts at line 62 with
`@router.post("/initialize", ...)`. Add the following function **between** them — after the
closing of `get_system_settings`, before the `@router.post("/initialize"` decorator:

```python
@router.patch("/settings", response_model=SystemSettingsOut)
def update_system_settings(
    payload: SystemSettingsUpdate,
    session: Session = Depends(get_session),
) -> SystemSettingsOut:
    """Update currency_code and/or money_decimals after initialization."""
    settings = session.get(SystemSettings, "system")
    if not settings:
        raise HTTPException(status_code=400, detail="system_not_initialized")
    if payload.currency_code is not None:
        settings.currency_code = payload.currency_code.strip()
    if payload.money_decimals is not None:
        settings.money_decimals = max(0, payload.money_decimals)
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return SystemSettingsOut(
        id=settings.id,
        is_setup_completed=settings.is_setup_completed,
        currency_code=settings.currency_code,
        money_decimals=settings.money_decimals,
        created_at=settings.created_at,
    )
```

**Do not change anything else in this file.**

---

## Step 4 — Add `updateSystemSettings` to the frontend API

**File:** `frontend/lib/api/company.ts`

Read the file first.

Find `getSystemSettings` (around line 25):

```ts
export async function getSystemSettings(): Promise<SystemSettings> {
  const { data } = await api.get("/system/settings");
  const parsed = parse(SystemSettingsSchema, data);
  setMoneyDecimals(parsed.money_decimals);
  setCurrencyCode(parsed.currency_code);
  return parsed;
}
```

Add the following function **directly after** `getSystemSettings`:

```ts
export async function updateSystemSettings(payload: {
  currency_code?: string;
  money_decimals?: number;
}): Promise<SystemSettings> {
  const { data } = await api.patch("/system/settings", payload);
  const parsed = parse(SystemSettingsSchema, data);
  setMoneyDecimals(parsed.money_decimals);
  setCurrencyCode(parsed.currency_code);
  return parsed;
}
```

**Do not change anything else in this file.**

---

## Step 5 — Export `updateSystemSettings` from the API barrel

**File:** `frontend/lib/api/index.ts`

Read the file first.

Find the line that re-exports from `./company`. It currently looks like:

```ts
export { getSystemSettings, getCompanyBalances, createCompanyBalanceAdjustment, createCompanyPayment, listCompanyPayments, deleteCompanyPayment, createCompanyBuyIron, initializeSystem, getSystemHealthCheck } from "./company";
```

Add `updateSystemSettings` to that same export line.

**Do not change anything else in this file.**

---

## Step 6 — Add `useUpdateSystemSettings` hook

**File:** `frontend/hooks/useSystemSettings.ts`

Read the file first.

Find the import at the top:

```ts
import { getSystemSettings, initializeSystem } from "@/lib/api";
```

Replace with:

```ts
import { getSystemSettings, initializeSystem, updateSystemSettings } from "@/lib/api";
```

Then find the export of `useInitializeSystem`. Add the following new hook **directly after** `useInitializeSystem`:

```ts
export function useUpdateSystemSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { currency_code?: string; money_decimals?: number }) =>
      updateSystemSettings(payload),
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to update settings."));
      logApiError("[updateSystemSettings ERROR]", err);
    },
    onSuccess: () => {
      showToast("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
    },
  });
}
```

**Do not change anything else in this file.**

---

## Step 7 — Create the Currency Settings screen

**File:** `frontend/app/(tabs)/account/configuration/currency-settings.tsx`

Create this new file with the following content exactly:

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useSystemSettings, useUpdateSystemSettings } from "@/hooks/useSystemSettings";
import { getCurrencyCode, getMoneyDecimals } from "@/lib/money";

const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "USD — US Dollar ($)" },
  { code: "ILS", label: "ILS — Israeli Shekel (₪)" },
  { code: "EUR", label: "EUR — Euro (€)" },
  { code: "GBP", label: "GBP — British Pound (£)" },
  { code: "JOD", label: "JOD — Jordanian Dinar (JD)" },
  { code: "EGP", label: "EGP — Egyptian Pound (E£)" },
  { code: "SAR", label: "SAR — Saudi Riyal (﷼)" },
  { code: "AED", label: "AED — UAE Dirham (د.إ)" },
];

const DECIMAL_OPTIONS = [
  { value: 0, label: "0 — No decimals (e.g. 100)" },
  { value: 2, label: "2 — Two decimals (e.g. 100.00)" },
];

export default function CurrencySettingsScreen() {
  const router = useRouter();
  const settingsQuery = useSystemSettings();
  const updateMutation = useUpdateSystemSettings();

  const [selectedCode, setSelectedCode] = useState<string>(getCurrencyCode());
  const [selectedDecimals, setSelectedDecimals] = useState<number>(getMoneyDecimals());

  useEffect(() => {
    if (settingsQuery.data) {
      setSelectedCode(settingsQuery.data.currency_code);
      setSelectedDecimals(settingsQuery.data.money_decimals);
    }
  }, [settingsQuery.data]);

  const currentCode = settingsQuery.data?.currency_code ?? getCurrencyCode();
  const currentDecimals = settingsQuery.data?.money_decimals ?? getMoneyDecimals();
  const isDirty = selectedCode !== currentCode || selectedDecimals !== currentDecimals;

  async function handleSave() {
    await updateMutation.mutateAsync({
      currency_code: selectedCode,
      money_decimals: selectedDecimals,
    });
    router.back();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Currency</Text>
      <View style={styles.optionGroup}>
        {SUPPORTED_CURRENCIES.map((c) => (
          <Pressable
            key={c.code}
            style={[styles.optionRow, selectedCode === c.code && styles.optionRowSelected]}
            onPress={() => setSelectedCode(c.code)}
          >
            <Text style={[styles.optionText, selectedCode === c.code && styles.optionTextSelected]}>
              {c.label}
            </Text>
            {selectedCode === c.code && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Decimal Places</Text>
      <View style={styles.optionGroup}>
        {DECIMAL_OPTIONS.map((d) => (
          <Pressable
            key={d.value}
            style={[styles.optionRow, selectedDecimals === d.value && styles.optionRowSelected]}
            onPress={() => setSelectedDecimals(d.value)}
          >
            <Text style={[styles.optionText, selectedDecimals === d.value && styles.optionTextSelected]}>
              {d.label}
            </Text>
            {selectedDecimals === d.value && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.saveButton, (!isDirty || updateMutation.isPending) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!isDirty || updateMutation.isPending}
      >
        {updateMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "NunitoSans-SemiBold",
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  optionGroup: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  optionRowSelected: {
    backgroundColor: "#eff6ff",
  },
  optionText: {
    fontSize: 16,
    color: "#111",
  },
  optionTextSelected: {
    color: "#1d4ed8",
    fontFamily: "NunitoSans-SemiBold",
  },
  checkmark: {
    fontSize: 16,
    color: "#1d4ed8",
  },
  saveButton: {
    marginTop: 32,
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#93c5fd",
  },
  saveButtonText: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "NunitoSans-SemiBold",
  },
});
```

---

## Step 8 — Register the route in `_layout.tsx`

**File:** `frontend/app/(tabs)/_layout.tsx`

Read the file first.

Every screen under `account/configuration/` must be explicitly registered with `href: null` to
hide it from the tab bar. Find the existing `expense-categories` Tabs.Screen block:

```tsx
      <Tabs.Screen
        name="account/configuration/expense-categories"
        options={{
          href: null,
        }}
      />
```

Add a new `Tabs.Screen` block **directly after** it:

```tsx
      <Tabs.Screen
        name="account/configuration/currency-settings"
        options={{
          href: null,
        }}
      />
```

**Do not change anything else in this file.**

---

## Step 9 — Add Currency row to the Account menu

**File:** `frontend/app/(tabs)/account/index.tsx`

Read the file first.

Find the Expense Categories row in the Configuration section:

```tsx
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/expense-categories")}>
          <Text style={styles.rowText}>Expense Categories</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
```

Add a new row **directly after** it:

```tsx
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/currency-settings")}>
          <Text style={styles.rowText}>Currency</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
```

**Do not change anything else in this file.**

---

## Step 10 — Fix `getCurrencyCode` → `getCurrencySymbol` in `balanceTransitions.ts`

**File:** `frontend/lib/balanceTransitions.ts`

Read the file first.

Find `formatMoneyValue` (around line 35):

```ts
function formatMoneyValue(value: number, formatMoney: FormatMoney) {
  return `${formatMoney(Math.abs(value))} ${getCurrencyCode()}`;
}
```

Replace with:

```ts
function formatMoneyValue(value: number, formatMoney: FormatMoney) {
  return `${formatMoney(Math.abs(value))} ${getCurrencySymbol()}`;
}
```

After making this change, check whether `getCurrencyCode` appears anywhere else in the file.
If it no longer appears anywhere else, remove it from the import line at the top. If it still
appears elsewhere, leave the import untouched.

**Do not change anything else in this file.**

---

## Verification

### Backend
```bash
cd backend && python -c "from app.routers.system_global import router; print('OK')"
```
Expected: `OK`.

### Frontend
```bash
cd frontend && npm run build
```
Expected: 0 TypeScript errors.

### Manual checks

1. Open Account → Configuration — a **Currency** row should appear below Expense Categories.
2. Tap Currency — screen shows 8 currency options and 2 decimal options; current values are pre-selected.
3. Select a different currency (e.g. ILS) and tap Save.
4. Toast shows "Settings saved" and screen goes back.
5. Navigate to any activity card — amounts show `₪` instead of `$`.
6. Open a new order or inventory screen — preview text shows `₪` (not `ILS`).
7. Change back to USD — amounts show `$` again.
8. Save button is disabled when nothing has changed.
