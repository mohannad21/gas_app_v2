# Epic 4 — Plans, Billing & Subscription

## Branch
`epic/4-plans-billing`
Create from `main` (after Epic 3 merges). Do not merge until all tickets are done, all tests pass, and `npm run build` is clean.

## Context

Epic 3 added tenant enforcement. Every authenticated user is now scoped to a tenant. Epic 4 adds a billing layer on top of that tenant: a plan that controls what the tenant is allowed to do and a billing ledger that records payments and charges.

**Current state of relevant tables:**
- `Tenant` model exists with fields: `id`, `name`, `status` (`"active"|"suspended"|"disabled"`), `owner_user_id`, `created_at`, `updated_at`
- No plan tables exist yet
- `status` on `Tenant` is set manually — nothing enforces it automatically

**What this epic adds:**
- 5 new tables: `plans`, `plan_entitlements`, `tenant_plan_subscriptions`, `tenant_plan_overrides`, `billing_events`
- A default plan seeded alongside the migration
- Plan enforcement middleware: read-only if in grace period, blocked if suspended
- Developer-only API: record payment, apply charge, change plan, apply discount, set trial
- Frontend: Profile → Plan & Billing screen (read-only view for the distributor)

---

## Rules for Codex (Apply to All Tickets in This Epic)

- **Do not touch any existing business logic or route behavior.**
- **Do not change any existing API response shapes.**
- **Do not add features outside the ticket scope.**
- **Read every file before modifying it.**
- **Migration files must be additive** — no existing columns removed.
- **Run the verification command at the end of each ticket before declaring it done.**
- **One migration file per ticket** (prefix: `i1_` for E4-1, `i2_` for E4-2, etc.)

---

## Ticket E4-1 — Add Plan & Billing Tables

### Objective
Create the 5 new tables, insert a default plan, and link the existing default tenant to it.

### New Models (add to `backend/app/models.py`)

Add all 5 models after `ActivationChallenge` and before `Customer`. Follow the existing model pattern exactly: `_uuid` for primary keys, `_utcnow` for timestamps, `sa.Column(sa.DateTime(timezone=True))` for datetime fields.

---

#### `Plan`

```python
class Plan(SQLModel, table=True):
  __tablename__ = "plans"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  name: str = Field(index=True)                         # e.g. "Starter", "Pro", "Enterprise"
  description: Optional[str] = Field(default=None, nullable=True)
  is_active: bool = Field(default=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
```

---

#### `PlanEntitlement`

Defines what a plan allows (e.g. max_workers = 3, max_customers = 500).

```python
class PlanEntitlement(SQLModel, table=True):
  __tablename__ = "plan_entitlements"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  plan_id: str = Field(foreign_key="plans.id", index=True)
  key: str = Field(index=True)        # e.g. "max_workers", "max_customers"
  value: str                          # stored as string; caller parses as int/bool
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
```

---

#### `TenantPlanSubscription`

Links a tenant to a plan and tracks the billing cycle.

```python
class TenantPlanSubscription(SQLModel, table=True):
  __tablename__ = "tenant_plan_subscriptions"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  plan_id: str = Field(foreign_key="plans.id", index=True)
  status: str = Field(default="active", index=True)
  # Allowed values: "active" | "grace_period" | "suspended" | "trial" | "cancelled"
  started_at: datetime = Field(
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  current_period_start: Optional[date] = Field(
    default=None,
    sa_column=sa.Column(sa.Date, nullable=True),
  )
  current_period_end: Optional[date] = Field(
    default=None,
    sa_column=sa.Column(sa.Date, nullable=True),
  )
  grace_period_end: Optional[date] = Field(
    default=None,
    sa_column=sa.Column(sa.Date, nullable=True),
  )
  cancelled_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  updated_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
```

---

#### `TenantPlanOverride`

Developer-applied overrides for a specific tenant (e.g. extra workers, extended trial).

```python
class TenantPlanOverride(SQLModel, table=True):
  __tablename__ = "tenant_plan_overrides"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  key: str = Field(index=True)        # same keys as PlanEntitlement
  value: str
  note: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  created_by: Optional[str] = Field(default=None, nullable=True)  # developer user id
```

---

#### `BillingEvent`

Immutable ledger of all billing activity for a tenant.

```python
class BillingEvent(SQLModel, table=True):
  __tablename__ = "billing_events"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  kind: str = Field(index=True)
  # Allowed values:
  #   "payment"    — distributor paid
  #   "charge"     — monthly/one-time charge
  #   "discount"   — developer-applied discount
  #   "credit"     — developer-applied credit
  #   "refund"     — developer-applied refund
  amount: int                        # in minor units (fils/cents), positive = credit, negative = charge
  note: Optional[str] = Field(default=None, nullable=True)
  effective_at: datetime = Field(
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, index=True),
  )
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  created_by: Optional[str] = Field(default=None, nullable=True)  # developer user id
```

---

### Migration file

Create `backend/alembic/versions_v2/i1_add_plan_billing_tables.py`:

```python
"""Add plan and billing tables."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "i1_add_plan_billing_tables"
down_revision = "h1_add_auth_tables"
branch_labels = None
depends_on = None

DEFAULT_PLAN_ID = "00000000-0000-0000-0000-000000000002"
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plans_name", "plans", ["name"], unique=False)

    op.create_table(
        "plan_entitlements",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("plan_id", sa.String(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plan_entitlements_plan_id", "plan_entitlements", ["plan_id"], unique=False)
    op.create_index("ix_plan_entitlements_key", "plan_entitlements", ["key"], unique=False)

    op.create_table(
        "tenant_plan_subscriptions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("plan_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'active'")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_start", sa.Date(), nullable=True),
        sa.Column("current_period_end", sa.Date(), nullable=True),
        sa.Column("grace_period_end", sa.Date(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tps_tenant_id", "tenant_plan_subscriptions", ["tenant_id"], unique=False)
    op.create_index("ix_tps_status", "tenant_plan_subscriptions", ["status"], unique=False)

    op.create_table(
        "tenant_plan_overrides",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tpo_tenant_id", "tenant_plan_overrides", ["tenant_id"], unique=False)

    op.create_table(
        "billing_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_billing_events_tenant_id", "billing_events", ["tenant_id"], unique=False)
    op.create_index("ix_billing_events_kind", "billing_events", ["kind"], unique=False)
    op.create_index("ix_billing_events_effective_at", "billing_events", ["effective_at"], unique=False)

    # Seed the default plan
    op.execute(
        f"""
        INSERT INTO plans (id, name, description, is_active, created_at)
        VALUES (
            '{DEFAULT_PLAN_ID}',
            'Starter',
            'Default plan for all distributors',
            true,
            now()
        )
        ON CONFLICT (id) DO NOTHING
        """
    )

    # Seed default entitlements for the Starter plan
    op.execute(
        f"""
        INSERT INTO plan_entitlements (id, plan_id, key, value, created_at) VALUES
            (gen_random_uuid()::text, '{DEFAULT_PLAN_ID}', 'max_workers', '5', now()),
            (gen_random_uuid()::text, '{DEFAULT_PLAN_ID}', 'max_customers', '500', now())
        """
    )

    # Link the existing default tenant to the default plan
    op.execute(
        f"""
        INSERT INTO tenant_plan_subscriptions
            (id, tenant_id, plan_id, status, started_at, created_at)
        VALUES (
            gen_random_uuid()::text,
            '{DEFAULT_TENANT_ID}',
            '{DEFAULT_PLAN_ID}',
            'active',
            now(),
            now()
        )
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("billing_events")
    op.drop_table("tenant_plan_overrides")
    op.drop_table("tenant_plan_subscriptions")
    op.drop_table("plan_entitlements")
    op.drop_table("plans")
```

---

### Verification

```bash
cd backend && python -c "
from app.models import Plan, PlanEntitlement, TenantPlanSubscription, TenantPlanOverride, BillingEvent
print('E4-1 model imports OK')
"
```

Then run the migration:
```bash
cd backend && alembic upgrade head
```

Expected: migration applies without error.

---

## Ticket E4-2 — Add Plan Enforcement Middleware

### Objective
After every authenticated request, check the tenant's active subscription status. If the subscription is in `grace_period`, reject all write requests (POST/PUT/PATCH/DELETE) with 402. If `suspended` or `cancelled`, reject all requests with 402. `active` and `trial` pass through.

### Context

`get_tenant_id` in `auth.py` already resolves the tenant. This ticket adds a new dependency `get_plan_access` that is also called as part of the dependency chain. Routes that already use `get_tenant_id` can remain unchanged — the plan check plugs into the same dependency mechanism.

### New file: `backend/app/services/plan_access.py`

```python
"""Plan access enforcement."""
from datetime import date, timezone, datetime
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.db import get_session
from app.auth import get_tenant_id
from app.models import TenantPlanSubscription


def _active_subscription(session: Session, tenant_id: str) -> Optional[TenantPlanSubscription]:
    """Return the most recent non-cancelled subscription for this tenant."""
    return session.exec(
        select(TenantPlanSubscription)
        .where(TenantPlanSubscription.tenant_id == tenant_id)
        .where(TenantPlanSubscription.status != "cancelled")
        .order_by(TenantPlanSubscription.started_at.desc())
    ).first()


def require_write_access(
    request: Request,
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    session: Annotated[Session, Depends(get_session)],
) -> str:
    """
    Dependency that enforces plan access on every request.
    - active / trial: full access
    - grace_period: reads allowed, writes blocked (402)
    - suspended / cancelled / no subscription: all requests blocked (402)
    Returns tenant_id so it can be used by route handlers if needed.
    """
    sub = _active_subscription(session, tenant_id)

    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="no_active_subscription",
        )

    is_write = request.method in ("POST", "PUT", "PATCH", "DELETE")

    if sub.status in ("suspended", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="account_suspended",
        )

    if sub.status == "grace_period":
        # Grace period: reads allowed, writes blocked
        if is_write:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="account_grace_period",
            )
        # Check if grace period has expired
        if sub.grace_period_end and date.today() > sub.grace_period_end:
            if is_write:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail="grace_period_expired",
                )

    # active and trial: pass through
    return tenant_id
```

### Update `backend/app/main.py`

Add `require_write_access` to the protected route dependencies so it runs on every protected route.

**Current:**
```python
from .auth import get_current_user
...
protected_route_dependencies = [Depends(get_current_user)]
```

**New:**
```python
from .auth import get_current_user
from .services.plan_access import require_write_access
...
protected_route_dependencies = [Depends(get_current_user), Depends(require_write_access)]
```

`require_write_access` already calls `get_tenant_id` internally (via `Depends`), so FastAPI resolves it from cache — no double DB hit.

**Important:** `require_write_access` runs on every protected route. The `/auth/*` endpoints are not in `protected_route_dependencies` — they stay unprotected so login/refresh continue to work.

---

### Verification

```bash
cd backend && python -c "
from app.services.plan_access import require_write_access
from app.main import app
print('E4-2 imports OK')
"
```

Then verify a route still works:
```bash
cd backend && python -c "
from app.main import app
from fastapi.testclient import TestClient
print('app loads OK with', len(app.routes), 'routes')
"
```

---

## Ticket E4-3 — Developer Billing API

### Objective
Add a set of developer-only endpoints for managing tenant subscriptions and billing. These endpoints require `DEBUG=true` to be accessible (same guard as `/auth/developer/create-user`).

### New file: `backend/app/routers/developer.py`

```python
"""Developer-only management endpoints. Only available when DEBUG=true."""
from datetime import datetime, timezone, date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_session
from app.models import (
    BillingEvent,
    Plan,
    Tenant,
    TenantPlanOverride,
    TenantPlanSubscription,
)

router = APIRouter(prefix="/developer", tags=["developer"])


def _require_debug(settings=Depends(get_settings)) -> None:
    if not settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")


# All endpoints in this router require debug mode
_debug_dep = [Depends(_require_debug)]
```

#### Endpoint 1 — List tenants

```
GET /developer/tenants
```

Returns all tenants with their active subscription status and outstanding balance.

**Response:** list of:
```json
{
  "tenant_id": "...",
  "name": "...",
  "status": "active",
  "subscription_status": "active",
  "plan_name": "Starter",
  "outstanding_balance": 0
}
```

#### Endpoint 2 — Record a payment

```
POST /developer/tenants/{tenant_id}/billing/payment
```

Body:
```json
{
  "amount": 5000,
  "note": "Monthly payment for April",
  "effective_at": "2026-04-01T00:00:00Z"
}
```

Creates a `BillingEvent` with `kind="payment"`, `amount=+amount`. If the tenant's subscription is in `grace_period` and the outstanding balance is now ≤ 0, update subscription status to `active`.

#### Endpoint 3 — Apply a charge

```
POST /developer/tenants/{tenant_id}/billing/charge
```

Body:
```json
{
  "amount": 5000,
  "note": "Monthly subscription charge — April 2026",
  "effective_at": "2026-04-01T00:00:00Z"
}
```

Creates a `BillingEvent` with `kind="charge"`, `amount=-amount` (stored as negative).

#### Endpoint 4 — Apply a discount

```
POST /developer/tenants/{tenant_id}/billing/discount
```

Body:
```json
{
  "amount": 1000,
  "note": "Loyalty discount"
}
```

Creates a `BillingEvent` with `kind="discount"`, `amount=+amount`.

#### Endpoint 5 — Change subscription status

```
POST /developer/tenants/{tenant_id}/subscription/status
```

Body:
```json
{
  "status": "grace_period",
  "grace_period_end": "2026-05-01"
}
```

Updates the tenant's active `TenantPlanSubscription.status`. Valid values: `"active"`, `"grace_period"`, `"suspended"`, `"trial"`, `"cancelled"`. If changing to `grace_period`, `grace_period_end` is required.

#### Endpoint 6 — Change plan

```
POST /developer/tenants/{tenant_id}/subscription/plan
```

Body:
```json
{
  "plan_id": "..."
}
```

Updates `TenantPlanSubscription.plan_id` to the new plan. Creates a `BillingEvent` with `kind="plan_change"` noting the old and new plan names.

#### Endpoint 7 — Get billing history

```
GET /developer/tenants/{tenant_id}/billing
```

Returns all `BillingEvent` rows for the tenant, ordered by `effective_at DESC`. Also returns the running outstanding balance (sum of all event amounts; positive = credit, negative = owed by tenant).

---

### Register the router in `backend/app/main.py`

Add to imports:
```python
from .routers import developer
```

Add router (no auth dependency — debug guard is inside the router):
```python
app.include_router(developer.router)
```

---

### Verification

```bash
cd backend && python -c "
from app.routers.developer import router
print('E4-3 imports OK, routes:', [r.path for r in router.routes])
"
```

---

## Ticket E4-4 — Frontend: Profile → Plan & Billing Screen

### Objective
Add a "Plan & Billing" section to the Account screen and a new `plan-billing.tsx` screen that shows the distributor's current plan, subscription status, outstanding balance, and payment history.

### New API function in `frontend/lib/api/company.ts` (or a new `frontend/lib/api/billing.ts`)

```typescript
export async function getPlanBillingStatus(): Promise<PlanBillingStatus> {
  const { data } = await api.get("/tenant/billing/status");
  return parse(PlanBillingStatusSchema, data);
}
```

### New Backend endpoint — `GET /tenant/billing/status`

Add a new router `backend/app/routers/tenant.py`:

```
GET /tenant/billing/status
```

Returns the current tenant's billing summary for display in the Profile tab. **This is a tenant-scoped read endpoint** — not a developer endpoint.

Response:
```json
{
  "plan_name": "Starter",
  "subscription_status": "active",
  "current_period_end": "2026-05-01",
  "grace_period_end": null,
  "outstanding_balance": 0,
  "recent_events": [
    {
      "kind": "payment",
      "amount": 5000,
      "note": "April payment",
      "effective_at": "2026-04-01T00:00:00Z"
    }
  ]
}
```

Register in `main.py` with `protected_route_dependencies`.

### New schema types in `frontend/types/`

Create `frontend/types/billing.ts`:
```typescript
import { z } from "zod";

export const BillingEventSchema = z.object({
  kind: z.string(),
  amount: z.number(),
  note: z.string().nullable(),
  effective_at: z.string(),
});

export const PlanBillingStatusSchema = z.object({
  plan_name: z.string(),
  subscription_status: z.string(),
  current_period_end: z.string().nullable(),
  grace_period_end: z.string().nullable(),
  outstanding_balance: z.number(),
  recent_events: z.array(BillingEventSchema),
});

export type PlanBillingStatus = z.infer<typeof PlanBillingStatusSchema>;
export type BillingEvent = z.infer<typeof BillingEventSchema>;
```

### New hook `frontend/hooks/usePlanBilling.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import { getPlanBillingStatus } from "@/lib/api/billing";
import { PlanBillingStatus } from "@/types/billing";

export function usePlanBillingStatus() {
  return useQuery<PlanBillingStatus>({
    queryKey: ["tenant", "billing", "status"],
    queryFn: getPlanBillingStatus,
  });
}
```

### New screen `frontend/app/(tabs)/account/plan-billing.tsx`

A simple read-only screen showing:
- **Plan name** (e.g. "Starter")
- **Status** with a colored badge: green = active, yellow = grace period, red = suspended
- **Next payment due** (current_period_end, if set)
- **Outstanding balance** in major units (e.g. "50.00 AED")
- **Recent billing events** list: each row shows kind (payment/charge/discount), amount, note, date

Use the same styling patterns as `account/index.tsx` (section cards, row pattern, `NunitoSans` fonts).

Display a loading spinner while `usePlanBillingStatus` is pending. Display a simple error message if the query fails.

### Update `frontend/app/(tabs)/account/index.tsx`

Add a new section card above the Security section:

```tsx
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Subscription</Text>
  <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/plan-billing")}>
    <Text style={styles.rowText}>Plan & Billing</Text>
    <Text style={styles.rowChevron}>{">"}</Text>
  </Pressable>
</View>
```

---

### Verification

```bash
cd frontend && npm run build
```

Expected: 0 TypeScript errors.

Manual test:
1. Open the Account tab
2. "Subscription" section is visible with a "Plan & Billing" row
3. Tap it → Plan & Billing screen opens
4. Screen shows plan name, status, and billing history

---

## Implementation Order

1. **E4-1** — Tables + migration + seeded data (backend only)
2. **E4-2** — Plan enforcement middleware (backend only)
3. **E4-3** — Developer billing API (backend only)
4. **E4-4** — Frontend Plan & Billing screen (frontend + thin backend endpoint)

---

## Success Criteria

✓ 5 new tables exist in the DB with correct FKs
✓ Default plan seeded; default tenant linked to it
✓ Write requests blocked with 402 when subscription is `grace_period` or `suspended`
✓ Developer can record payments, charges, and discounts via API
✓ Developer can change a tenant's subscription status and plan
✓ `GET /tenant/billing/status` returns correct data for the authenticated tenant
✓ Frontend Plan & Billing screen renders with plan name, status, balance, events
✓ `pytest tests/backend/ -q` → all tests pass
✓ `npm run build` → 0 TypeScript errors
