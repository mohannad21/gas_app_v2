# Epic 6 — Profile Tab Completion

## Branch
`epic/6-profile-tab`
Create from `main` (after Epic 5 merges). Do not merge until all tickets are done, all tests pass, and `npm run build` is clean.

## Context

**What exists after Epic 5:**
- `Account` tab with: Subscription → Plan & Billing, Team → Workers, Security → Change Password, Sign Out
- `Tenant` model has: `id`, `name`, `status`, `owner_user_id` — no business profile fields yet
- `SystemSettings` table has: `currency_code`, `money_decimals`, `is_setup_completed` — used for initial setup
- `ExpenseCategory` table exists but has no `tenant_id` (global, not per-tenant)
- `SystemTypeOption` table exists, no `tenant_id` (global)
- `PriceCatalog` table exists, no `tenant_id` (global)
- Backend API endpoints exist for system types, prices, and expense categories but are not surfaced in Profile
- No backend endpoint to read or update the tenant's business profile

**What this epic adds:**
- `Tenant` gains business profile fields (`business_name`, `owner_name`, `phone`, `address`)
- A `GET /profile` + `PATCH /profile` endpoint for the authenticated tenant
- Expense categories surfaced in Profile → Configuration
- System types surfaced in Profile → Configuration
- Prices surfaced in Profile → Configuration
- Four new sub-screens under Account: `business-profile`, `configuration/prices`, `configuration/system-types`, `configuration/expense-categories`
- Account index updated with a Business Profile section and a Configuration section

## Rules (Apply to All Tickets)
- Do not change any existing business logic or route behavior.
- Do not change any existing API response shapes.
- Do not add features outside the ticket scope.
- Read every file before modifying it.
- Run the verification command at the end of each ticket before declaring it done.

---

## Ticket E6-1 — Add Business Profile Fields to Tenant + Profile Endpoint

### Objective
Add editable business profile fields to the `Tenant` model and expose a `GET /profile` + `PATCH /profile` endpoint so the distributor can read and update their business details.

---

### Migration: `backend/alembic/versions_v2/k1_add_tenant_profile_fields.py`

```python
"""Add business profile fields to tenants table."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "k1_add_tenant_profile_fields"
down_revision = "j1_add_workers_roles_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("business_name", sa.String(), nullable=True))
    op.add_column("tenants", sa.Column("owner_name", sa.String(), nullable=True))
    op.add_column("tenants", sa.Column("phone", sa.String(), nullable=True))
    op.add_column("tenants", sa.Column("address", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "address")
    op.drop_column("tenants", "phone")
    op.drop_column("tenants", "owner_name")
    op.drop_column("tenants", "business_name")
```

---

### Model update: `backend/app/models.py`

Add 4 fields to the `Tenant` class after the existing `updated_at` field:

```python
business_name: Optional[str] = Field(default=None, nullable=True)
owner_name: Optional[str] = Field(default=None, nullable=True)
phone: Optional[str] = Field(default=None, nullable=True)
address: Optional[str] = Field(default=None, nullable=True)
```

---

### New schemas (add to `backend/app/schemas/profile.py`, create this file)

```python
from typing import Optional
from sqlmodel import SQLModel


class TenantProfileOut(SQLModel):
    id: str
    name: str
    business_name: Optional[str]
    owner_name: Optional[str]
    phone: Optional[str]
    address: Optional[str]


class TenantProfileUpdate(SQLModel):
    business_name: Optional[str] = None
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
```

Export both from `backend/app/schemas/__init__.py`:
```python
from .profile import TenantProfileOut, TenantProfileUpdate
```
And add both names to `__all__`.

---

### New router: `backend/app/routers/profile.py`

```python
"""Tenant business profile endpoints."""
from typing import Annotated
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.auth import get_tenant_id
from app.db import get_session
from app.models import Tenant
from app.schemas import TenantProfileOut, TenantProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=TenantProfileOut)
def get_profile(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    session: Session = Depends(get_session),
) -> TenantProfileOut:
    tenant = session.get(Tenant, tenant_id)
    return TenantProfileOut(
        id=tenant.id,
        name=tenant.name,
        business_name=tenant.business_name,
        owner_name=tenant.owner_name,
        phone=tenant.phone,
        address=tenant.address,
    )


@router.patch("", response_model=TenantProfileOut)
def update_profile(
    payload: TenantProfileUpdate,
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    session: Session = Depends(get_session),
) -> TenantProfileOut:
    tenant = session.get(Tenant, tenant_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(tenant, field, value)
    tenant.updated_at = datetime.now(timezone.utc)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return TenantProfileOut(
        id=tenant.id,
        name=tenant.name,
        business_name=tenant.business_name,
        owner_name=tenant.owner_name,
        phone=tenant.phone,
        address=tenant.address,
    )
```

---

### Register in `backend/app/main.py`

```python
from .routers import profile

app.include_router(profile.router, dependencies=protected_route_dependencies)
```

---

### Verification

```bash
cd backend && python -c "
from app.routers.profile import router
from app.schemas import TenantProfileOut, TenantProfileUpdate
print('E6-1 imports OK')
"
cd backend && alembic upgrade head
```

Expected: migration applies, imports pass.

---

## Ticket E6-2 — Frontend: Business Profile Screen

### Objective
Add a "Business Profile" sub-screen under Account where the distributor can view and edit their business name, owner name, phone, and address.

---

### New API functions: `frontend/lib/api/profile.ts`

```typescript
import { z } from "zod";
import { api, parse } from "./client";

export const TenantProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  business_name: z.string().nullable(),
  owner_name: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
});

export type TenantProfile = z.infer<typeof TenantProfileSchema>;

export async function getProfile(): Promise<TenantProfile> {
  const { data } = await api.get("/profile");
  return parse(TenantProfileSchema, data);
}

export async function updateProfile(payload: Partial<Omit<TenantProfile, "id" | "name">>): Promise<TenantProfile> {
  const { data } = await api.patch("/profile", payload);
  return parse(TenantProfileSchema, data);
}
```

Add to `frontend/lib/api/index.ts`:
```typescript
export { getProfile, updateProfile, type TenantProfile } from "./profile";
```

---

### New hook: `frontend/hooks/useProfile.ts`

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateProfile } from "@/lib/api/profile";

export function useProfile() {
  return useQuery({ queryKey: ["profile"], queryFn: getProfile });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
```

---

### New screen: `frontend/app/(tabs)/account/business-profile.tsx`

A form screen showing 4 editable fields: Business Name, Owner Name, Phone, Address.

- Load current values from `useProfile()`
- Each field is a `TextInput` pre-filled with current value
- A "Save" button calls `useUpdateProfile().mutateAsync(...)` with changed fields only
- On success, show `Alert.alert("Saved", "Profile updated.")`
- On error, show `Alert.alert("Error", "Could not save profile.")`
- Show `ActivityIndicator` while loading or saving
- Use the same `StyleSheet` pattern as `account/change-password.tsx`
- Include a back button (router.back())

---

### Update `frontend/app/(tabs)/account/index.tsx`

Add a "Business Profile" section at the top, before Subscription:

```tsx
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Business</Text>
  <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/business-profile")}>
    <Text style={styles.rowText}>Business Profile</Text>
    <Text style={styles.rowChevron}>{">"}</Text>
  </Pressable>
</View>
```

---

### Update `frontend/app/(tabs)/_layout.tsx`

Add:
```tsx
<Tabs.Screen name="account/business-profile" options={{ href: null }} />
```

---

### Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Manual test:
1. Open Account → Business Profile
2. Fields load with current values (empty on first use)
3. Edit a field, tap Save → success alert shown
4. Navigate back and re-enter → saved values persist

---

## Ticket E6-3 — Frontend: Configuration Screens (Prices, System Types, Expense Categories)

### Objective
Surface three existing management screens inside Account → Configuration: Prices, System Types, and Expense Categories. The backend endpoints already exist — this ticket is frontend only.

---

### Existing API functions to reuse (already in `frontend/lib/api/`)

- `listPriceSettings()`, `savePriceSetting()` — in `prices.ts`
- `listSystemTypes()`, `createSystemType()`, `updateSystemType()` — in `systems.ts`
- No expense categories API exists yet — add it (see below)

---

### New API functions: add to `frontend/lib/api/expenses.ts`

Read the current `expenses.ts` before editing. Add at the end:

```typescript
import { z } from "zod";

export const ExpenseCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
});

export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data } = await api.get("/expenses/categories");
  return parseArray(ExpenseCategorySchema, data);
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  const { data } = await api.post("/expenses/categories", { name });
  return parse(ExpenseCategorySchema, data);
}

export async function toggleExpenseCategory(id: string, is_active: boolean): Promise<ExpenseCategory> {
  const { data } = await api.patch(`/expenses/categories/${id}`, { is_active });
  return parse(ExpenseCategorySchema, data);
}
```

Add re-exports to `frontend/lib/api/index.ts`:
```typescript
export { listExpenseCategories, createExpenseCategory, toggleExpenseCategory } from "./expenses";
```

**Note:** This requires a new backend route `GET /expenses/categories`, `POST /expenses/categories`, `PATCH /expenses/categories/{id}` — see backend task below.

---

### Backend: add expense categories endpoints to `backend/app/routers/expenses.py`

Read `expenses.py` first. Add 3 new endpoints at the end of the file:

```python
@router.get("/categories", response_model=list[ExpenseCategoryOut])
def list_expense_categories(session: Session = Depends(get_session)) -> list[ExpenseCategoryOut]:
    rows = session.exec(select(ExpenseCategory).order_by(ExpenseCategory.name)).all()
    return [ExpenseCategoryOut(id=r.id, name=r.name, is_active=r.is_active, created_at=r.created_at) for r in rows]


@router.post("/categories", response_model=ExpenseCategoryOut, status_code=201,
             dependencies=[Depends(require_permission("settings:write"))])
def create_expense_category(payload: ExpenseCategoryCreate, session: Session = Depends(get_session)) -> ExpenseCategoryOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name_required")
    existing = session.exec(select(ExpenseCategory).where(ExpenseCategory.name == name)).first()
    if existing:
        raise HTTPException(status_code=409, detail="category_exists")
    row = ExpenseCategory(name=name)
    session.add(row)
    session.commit()
    session.refresh(row)
    return ExpenseCategoryOut(id=row.id, name=row.name, is_active=row.is_active, created_at=row.created_at)


@router.patch("/categories/{category_id}", response_model=ExpenseCategoryOut,
              dependencies=[Depends(require_permission("settings:write"))])
def toggle_expense_category(
    category_id: str,
    payload: ExpenseCategoryToggle,
    session: Session = Depends(get_session),
) -> ExpenseCategoryOut:
    row = session.get(ExpenseCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="category_not_found")
    row.is_active = payload.is_active
    session.add(row)
    session.commit()
    session.refresh(row)
    return ExpenseCategoryOut(id=row.id, name=row.name, is_active=row.is_active, created_at=row.created_at)
```

Add schemas to `backend/app/schemas/` — create `backend/app/schemas/expense_categories.py`:

```python
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel


class ExpenseCategoryOut(SQLModel):
    id: str
    name: str
    is_active: bool
    created_at: datetime


class ExpenseCategoryCreate(SQLModel):
    name: str


class ExpenseCategoryToggle(SQLModel):
    is_active: bool
```

Export from `backend/app/schemas/__init__.py`:
```python
from .expense_categories import ExpenseCategoryOut, ExpenseCategoryCreate, ExpenseCategoryToggle
```

Import these in `expenses.py`:
```python
from app.schemas import ExpenseCategoryCreate, ExpenseCategoryOut, ExpenseCategoryToggle
```

---

### New screens

#### `frontend/app/(tabs)/account/configuration/prices.tsx`

- Load prices with `listPriceSettings()` (already exists in hooks or call directly)
- Display each price entry: gas type, selling price, buying price, effective date
- A "New Price" button opens a modal/form calling `savePriceSetting()`
- Use same StyleSheet patterns as other account screens

#### `frontend/app/(tabs)/account/configuration/system-types.tsx`

- Load system types with `listSystemTypes()`
- Display each type: name, active badge
- "Add Type" button → input + confirm → `createSystemType(name)`
- Tap a row → toggle active/inactive via `updateSystemType(id, { is_active: !current })`

#### `frontend/app/(tabs)/account/configuration/expense-categories.tsx`

- Load categories with `listExpenseCategories()`
- Display each: name, active badge
- "Add Category" button → input + confirm → `createExpenseCategory(name)`
- Tap a row → toggle active/inactive via `toggleExpenseCategory(id, !current)`

All three screens follow the same `StyleSheet` as `account/workers.tsx` — white cards, section titles, item rows with action buttons.

---

### Update `frontend/app/(tabs)/account/index.tsx`

Add a "Configuration" section after Team and before Security:

```tsx
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Configuration</Text>
  <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/prices")}>
    <Text style={styles.rowText}>Prices</Text>
    <Text style={styles.rowChevron}>{">"}</Text>
  </Pressable>
  <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/system-types")}>
    <Text style={styles.rowText}>System Types</Text>
    <Text style={styles.rowChevron}>{">"}</Text>
  </Pressable>
  <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/expense-categories")}>
    <Text style={styles.rowText}>Expense Categories</Text>
    <Text style={styles.rowChevron}>{">"}</Text>
  </Pressable>
</View>
```

---

### Update `frontend/app/(tabs)/_layout.tsx`

Add:
```tsx
<Tabs.Screen name="account/configuration/prices" options={{ href: null }} />
<Tabs.Screen name="account/configuration/system-types" options={{ href: null }} />
<Tabs.Screen name="account/configuration/expense-categories" options={{ href: null }} />
```

---

### Verification

```bash
cd backend && python -c "
from app.routers.expenses import router
from app.schemas import ExpenseCategoryOut, ExpenseCategoryCreate, ExpenseCategoryToggle
print('E6-3 backend imports OK')
"
cd frontend && npm run build
```

Expected: imports pass, 0 TypeScript errors.

Manual test:
1. Account → Configuration → Prices → list loads
2. Account → Configuration → System Types → list loads, add type works
3. Account → Configuration → Expense Categories → list loads, add category works

---

## Acceptance Criteria

```
✓ k1_ migration applies without error
✓ GET /profile returns tenant business profile fields
✓ PATCH /profile updates and persists fields
✓ GET /expenses/categories, POST /expenses/categories, PATCH /expenses/categories/{id} work
✓ Account screen shows: Business, Subscription, Team, Configuration, Security sections
✓ Business Profile screen loads and saves
✓ Prices screen lists existing prices and allows adding new
✓ System Types screen lists and allows add/toggle
✓ Expense Categories screen lists and allows add/toggle
✓ pytest tests/backend/ -q → all tests pass
✓ npm run build → 0 TypeScript errors
```
