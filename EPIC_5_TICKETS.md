# Epic 5 — Workers, Roles & Permissions

## Branch
`epic/5-workers-roles`
Create from `main` (after Epic 4 merges). Do not merge until all tickets are done, all tests pass, and `npm run build` is clean.

## Context

**What exists after Epic 4:**
- `User` — one row per person, has `tenant_id`, `phone`, `password_hash`, `is_active`
- `Tenant` — one row per business, has `status`, `owner_user_id`
- `TenantPlanSubscription` — links tenant to plan, has `status` (active/grace/suspended)
- `PlanEntitlement` — key/value limits, including `max_workers`
- `plan_access.py` — `require_write_access` dependency already on all protected routes
- `protected_route_dependencies = [Depends(get_current_user), Depends(require_write_access)]` in `main.py`

**What this epic adds:**
- 5 new tables: `roles`, `permissions`, `role_permissions`, `tenant_memberships`, `invites`
- System roles seeded: `distributor_owner`, `driver`, `cashier`, `accountant`
- Permission enforcement on sensitive routes (backend always validates)
- Distributor invite flow: create invite → OTP → activate → assigned role
- Worker seat limit checked against plan entitlement `max_workers`
- Frontend: Profile → Workers screen (list, invite, revoke)

---

## Rules for Codex (Apply to All Tickets in This Epic)

- **Do not change any existing business logic or route behavior.**
- **Do not change any existing API response shapes.**
- **Do not add features outside the ticket scope.**
- **Read every file before modifying it.**
- **Migration prefix: `j1_` for E5-1.**
- **Run the verification command at the end of each ticket before declaring it done.**

---

## Ticket E5-1 — Add Workers, Roles & Permissions Tables

### Objective
Create 5 new tables in one migration. Seed system roles and their default permissions. Link the existing distributor user as a `distributor_owner` member of the default tenant.

---

### New Models (add to `backend/app/models.py`)

Add all 5 models after `BillingEvent` and before `Customer`. Follow the existing model pattern: `_uuid` for PKs, `_utcnow` for timestamps, `sa.Column(sa.DateTime(timezone=True))` for datetime fields.

---

#### `Role`

```python
class Role(SQLModel, table=True):
  __tablename__ = "roles"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  name: str = Field(index=True)
  # System roles: "distributor_owner" | "driver" | "cashier" | "accountant"
  # Custom roles added by future epics can use any name.
  is_system: bool = Field(default=False)   # True = cannot be deleted
  description: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
```

---

#### `Permission`

```python
class Permission(SQLModel, table=True):
  __tablename__ = "permissions"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  code: str = Field(index=True, unique=True)
  # Example codes:
  #   "orders:write"          — create/update/delete orders
  #   "orders:read"           — read orders
  #   "collections:write"
  #   "collections:read"
  #   "inventory:write"
  #   "inventory:read"
  #   "reports:read"
  #   "company:write"         — refills, payments, buy-iron
  #   "company:read"
  #   "expenses:write"
  #   "expenses:read"
  #   "customers:write"
  #   "customers:read"
  #   "workers:manage"        — invite/revoke workers
  #   "prices:write"
  #   "settings:write"        — business profile, system types, categories
  description: Optional[str] = Field(default=None, nullable=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
```

---

#### `RolePermission`

```python
class RolePermission(SQLModel, table=True):
  __tablename__ = "role_permissions"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  role_id: str = Field(foreign_key="roles.id", index=True)
  permission_code: str = Field(index=True)
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
```

---

#### `TenantMembership`

Links a user to a tenant with a role. The owner row is created automatically when a tenant is set up.

```python
class TenantMembership(SQLModel, table=True):
  __tablename__ = "tenant_memberships"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  user_id: str = Field(foreign_key="users.id", index=True)
  role_id: str = Field(foreign_key="roles.id", index=True)
  is_active: bool = Field(default=True, index=True)
  joined_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  revoked_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
```

---

#### `Invite`

```python
class Invite(SQLModel, table=True):
  __tablename__ = "invites"

  id: str = Field(default_factory=_uuid, primary_key=True, index=True)
  tenant_id: str = Field(foreign_key="tenants.id", index=True)
  phone: str = Field(index=True)
  role_id: str = Field(foreign_key="roles.id", index=True)
  code_hash: str                           # hashed OTP, same pattern as ActivationChallenge
  status: str = Field(default="pending", index=True)
  # "pending" | "accepted" | "expired" | "cancelled"
  created_at: datetime = Field(
    default_factory=_utcnow,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  expires_at: datetime = Field(
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
  )
  accepted_at: Optional[datetime] = Field(
    default=None,
    sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
  )
  created_by: Optional[str] = Field(default=None, foreign_key="users.id", nullable=True)
```

---

### Migration file: `backend/alembic/versions_v2/j1_add_workers_roles_tables.py`

```python
"""Add workers, roles, and permissions tables."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "j1_add_workers_roles_tables"
down_revision = "i1_add_plan_billing_tables"
branch_labels = None
depends_on = None

# Fixed IDs for system roles — stable across environments
ROLE_OWNER_ID      = "00000000-0000-0000-role-000000000001"
ROLE_DRIVER_ID     = "00000000-0000-0000-role-000000000002"
ROLE_CASHIER_ID    = "00000000-0000-0000-role-000000000003"
ROLE_ACCOUNTANT_ID = "00000000-0000-0000-role-000000000004"

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"

# Permission codes assigned to each system role
OWNER_PERMISSIONS = [
    "orders:write", "orders:read",
    "collections:write", "collections:read",
    "inventory:write", "inventory:read",
    "reports:read",
    "company:write", "company:read",
    "expenses:write", "expenses:read",
    "customers:write", "customers:read",
    "workers:manage",
    "prices:write",
    "settings:write",
]
DRIVER_PERMISSIONS = [
    "orders:write", "orders:read",
    "collections:write", "collections:read",
    "inventory:read",
    "customers:read",
]
CASHIER_PERMISSIONS = [
    "orders:read",
    "collections:write", "collections:read",
    "expenses:write", "expenses:read",
    "customers:read",
    "reports:read",
]
ACCOUNTANT_PERMISSIONS = [
    "orders:read",
    "collections:read",
    "expenses:read",
    "company:read",
    "inventory:read",
    "reports:read",
    "customers:read",
]


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_roles_name", "roles", ["name"], unique=False)

    op.create_table(
        "permissions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_permissions_code"),
    )
    op.create_index("ix_permissions_code", "permissions", ["code"], unique=True)

    op.create_table(
        "role_permissions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("role_id", sa.String(), nullable=False),
        sa.Column("permission_code", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_role_permissions_role_id", "role_permissions", ["role_id"], unique=False)

    op.create_table(
        "tenant_memberships",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("role_id", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tm_tenant_id", "tenant_memberships", ["tenant_id"], unique=False)
    op.create_index("ix_tm_user_id", "tenant_memberships", ["user_id"], unique=False)
    op.create_index("ix_tm_is_active", "tenant_memberships", ["is_active"], unique=False)

    op.create_table(
        "invites",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("role_id", sa.String(), nullable=False),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invites_tenant_id", "invites", ["tenant_id"], unique=False)
    op.create_index("ix_invites_phone", "invites", ["phone"], unique=False)
    op.create_index("ix_invites_status", "invites", ["status"], unique=False)

    # Seed system roles
    op.execute(f"""
        INSERT INTO roles (id, name, is_system, description, created_at) VALUES
            ('{ROLE_OWNER_ID}',      'distributor_owner', true, 'Full access. Tenant owner.', now()),
            ('{ROLE_DRIVER_ID}',     'driver',            true, 'Create orders and collections.', now()),
            ('{ROLE_CASHIER_ID}',    'cashier',           true, 'Manage collections and expenses.', now()),
            ('{ROLE_ACCOUNTANT_ID}', 'accountant',        true, 'Read-only access to all reports and data.', now())
        ON CONFLICT (id) DO NOTHING
    """)

    # Seed all permission codes
    all_codes = list(dict.fromkeys(
        OWNER_PERMISSIONS + DRIVER_PERMISSIONS + CASHIER_PERMISSIONS + ACCOUNTANT_PERMISSIONS
    ))
    for code in all_codes:
        op.execute(f"""
            INSERT INTO permissions (id, code, created_at)
            VALUES (gen_random_uuid()::text, '{code}', now())
            ON CONFLICT (code) DO NOTHING
        """)

    # Assign permissions to roles
    role_perm_map = [
        (ROLE_OWNER_ID, OWNER_PERMISSIONS),
        (ROLE_DRIVER_ID, DRIVER_PERMISSIONS),
        (ROLE_CASHIER_ID, CASHIER_PERMISSIONS),
        (ROLE_ACCOUNTANT_ID, ACCOUNTANT_PERMISSIONS),
    ]
    for role_id, perms in role_perm_map:
        for perm in perms:
            op.execute(f"""
                INSERT INTO role_permissions (id, role_id, permission_code, created_at)
                VALUES (gen_random_uuid()::text, '{role_id}', '{perm}', now())
            """)

    # Link the existing default tenant owner to the distributor_owner role.
    # Only runs if the tenant and its owner_user_id exist.
    op.execute(f"""
        INSERT INTO tenant_memberships (id, tenant_id, user_id, role_id, is_active, joined_at, created_at)
        SELECT
            gen_random_uuid()::text,
            t.id,
            t.owner_user_id,
            '{ROLE_OWNER_ID}',
            true,
            now(),
            now()
        FROM tenants t
        WHERE t.id = '{DEFAULT_TENANT_ID}'
          AND t.owner_user_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table("invites")
    op.drop_table("tenant_memberships")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
```

---

### Verification

```bash
cd backend && python -c "
from app.models import Role, Permission, RolePermission, TenantMembership, Invite
print('E5-1 model imports OK')
"
cd backend && alembic upgrade head
```

Expected: migration applies without error.

---

## Ticket E5-2 — Add `get_user_permissions` Dependency + Permission Enforcement

### Objective
Add a dependency that resolves the current user's permissions from their `TenantMembership` → `Role` → `RolePermission`. Apply it to the routes that require specific permissions.

### New function in `backend/app/auth.py`

Add at the end of `auth.py` (after `get_tenant_id`):

```python
def get_user_permissions(
  user_id: Annotated[str, Depends(get_current_user)],
  session: Annotated[Session, Depends(get_session)],
) -> set[str]:
  """
  Returns the set of permission codes for the current user.
  If the user has no membership (e.g. developer test user), returns an empty set.
  """
  from app.models import TenantMembership, RolePermission
  membership = session.exec(
    select(TenantMembership)
    .where(TenantMembership.user_id == user_id)
    .where(TenantMembership.is_active == True)  # noqa: E712
  ).first()
  if not membership:
    return set()
  perms = session.exec(
    select(RolePermission.permission_code)
    .where(RolePermission.role_id == membership.role_id)
  ).all()
  return set(perms)
```

Add `select` to the imports at the top of `auth.py` if not already present:
```python
from sqlmodel import Session, select
```

---

### New helper: `require_permission(code)` — a factory for permission-checking dependencies

Add to `backend/app/auth.py`:

```python
def require_permission(code: str):
  """
  Returns a FastAPI dependency that raises 403 if the user lacks the given permission.

  Usage:
      @router.delete("/{id}", dependencies=[Depends(require_permission("orders:write"))])
      def delete_order(...):
          ...
  """
  def _check(perms: Annotated[set[str], Depends(get_user_permissions)]) -> None:
    if code not in perms:
      raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="permission_denied",
      )
  return _check
```

---

### Apply permission checks to sensitive routes

For each route listed below, add `Depends(require_permission("..."))` to the route's `dependencies` list. Do not change the route handler signature or body.

**Pattern:**
```python
# Before
@router.delete("/{order_id}", status_code=204)
def delete_order(order_id: str, ...):

# After
@router.delete("/{order_id}", status_code=204, dependencies=[Depends(require_permission("orders:write"))])
def delete_order(order_id: str, ...):
```

**Routes to protect:**

| File | Method | Path | Permission |
|------|--------|------|------------|
| `orders.py` | POST | `/orders` | `orders:write` |
| `orders.py` | PUT | `/orders/{id}` | `orders:write` |
| `orders.py` | DELETE | `/orders/{id}` | `orders:write` |
| `collections.py` | POST | `/collections` | `collections:write` |
| `collections.py` | PUT | `/collections/{id}` | `collections:write` |
| `collections.py` | DELETE | `/collections/{id}` | `collections:write` |
| `customers.py` | POST | `/customers` | `customers:write` |
| `customers.py` | PUT | `/customers/{id}` | `customers:write` |
| `customers.py` | DELETE | `/customers/{id}` | `customers:write` |
| `expenses.py` | POST | `/expenses` | `expenses:write` |
| `expenses.py` | PUT | `/expenses/{id}` | `expenses:write` |
| `expenses.py` | DELETE | `/expenses/{id}` | `expenses:write` |
| `inventory.py` | POST | `/inventory/refills` | `inventory:write` |
| `inventory.py` | PUT | `/inventory/refills/{id}` | `inventory:write` |
| `inventory.py` | DELETE | `/inventory/refills/{id}` | `inventory:write` |
| `inventory.py` | POST | `/inventory/adjust` | `inventory:write` |
| `company.py` | POST | `/company/payments` | `company:write` |
| `company.py` | POST | `/company/buy-iron` | `company:write` |
| `prices.py` | POST/PUT | any write route | `prices:write` |

Read each file before editing to verify the exact path and method. Add only `Depends(require_permission(...))` to the `dependencies` list. Do not change the handler body.

**Important: do NOT add permission checks to GET routes in this ticket.** Read endpoints remain open to all authenticated members of the tenant. Permission enforcement on reads can be added in a future epic.

---

### Verification

```bash
cd backend && python -c "
from app.auth import get_user_permissions, require_permission
from app.routers.orders import router
print('E5-2 imports OK')
"
```

---

## Ticket E5-3 — Worker Invite Flow (Backend)

### Objective
Distributor can invite a worker by phone number. Backend creates an `Invite` record with a hashed OTP. Worker activates via a new `POST /invites/activate` endpoint. Seat limit enforced against `max_workers` entitlement.

### New router: `backend/app/routers/workers.py`

```python
"""Worker invite and management endpoints."""
router = APIRouter(prefix="/workers", tags=["workers"])
```

#### Endpoint 1 — List active workers

```
GET /workers
```

Returns all active `TenantMembership` rows for the current tenant, joined to `User` (phone) and `Role` (name).

Response: list of:
```json
{
  "membership_id": "...",
  "user_id": "...",
  "phone": "+49...",
  "role_name": "driver",
  "joined_at": "2026-04-01T00:00:00Z"
}
```

#### Endpoint 2 — Create invite

```
POST /workers/invite
```

Requires `Depends(require_permission("workers:manage"))`.

Body:
```json
{
  "phone": "+491234567890",
  "role_id": "..."
}
```

**Before creating:** check that active member count < plan entitlement `max_workers` (accounting for any `TenantPlanOverride` with `key="max_workers"`). If limit reached, return 422 with `detail="worker_seat_limit_reached"`.

Creates an `Invite` with:
- `code_hash = hash_password(otp)` (6-digit OTP, same as `ActivationChallenge`)
- `expires_at = now() + 48 hours`
- `status = "pending"`

In `DEBUG=true` mode, return the raw OTP in the response (`activation_code`). In production, the OTP would be sent via WhatsApp (not in scope for this ticket — leave a `# TODO: send WhatsApp OTP` comment).

Response:
```json
{
  "invite_id": "...",
  "phone": "+49...",
  "role_name": "driver",
  "expires_at": "...",
  "activation_code": "123456"  // only in DEBUG mode; omit in production
}
```

#### Endpoint 3 — Activate invite (no auth required)

```
POST /invites/activate
```

This endpoint does NOT use `protected_route_dependencies` — it is called by a worker who has no account yet. Register it with `app.include_router(invites_router)` (no dependency).

Body:
```json
{
  "invite_id": "...",
  "code": "123456",
  "password": "newpassword123"
}
```

Steps:
1. Fetch `Invite` by `invite_id`. Check `status == "pending"` and not expired.
2. Verify OTP: `verify_password(code, invite.code_hash)` → 400 if wrong.
3. Check if a `User` with that `phone` already exists.
   - If yes: link them to the tenant (create `TenantMembership`), set `is_active=True`, update `password_hash`.
   - If no: create a new `User` with the phone + hashed password + `tenant_id`, then create `TenantMembership`.
4. Mark `invite.status = "accepted"`, `invite.accepted_at = now()`.
5. Return the same `LoginResponse` as `POST /auth/login` (access token + refresh token).

Create a separate router `backend/app/routers/invites.py` for this endpoint since it has no auth dependency.

#### Endpoint 4 — List pending invites

```
GET /workers/invites
```

Returns all `Invite` rows for the current tenant where `status == "pending"` and `expires_at > now()`.

Response: list of:
```json
{
  "invite_id": "...",
  "phone": "+49...",
  "role_name": "driver",
  "created_at": "...",
  "expires_at": "..."
}
```

#### Endpoint 5 — Revoke invite

```
DELETE /workers/invites/{invite_id}
```

Requires `Depends(require_permission("workers:manage"))`.
Sets `invite.status = "cancelled"`. Returns 204.

#### Endpoint 6 — Revoke worker access

```
DELETE /workers/{membership_id}
```

Requires `Depends(require_permission("workers:manage"))`.
Sets `membership.is_active = False`, `membership.revoked_at = now()`. Returns 204.
Does not delete the `User` row.

---

### Register routers in `backend/app/main.py`

```python
from .routers import workers, invites

app.include_router(workers.router, dependencies=protected_route_dependencies)
app.include_router(invites.router)  # no auth — open for activation
```

---

### Verification

```bash
cd backend && python -c "
from app.routers.workers import router as workers_router
from app.routers.invites import router as invites_router
print('E5-3 imports OK')
"
```

---

## Ticket E5-4 — Frontend: Profile → Workers Screen

### Objective
Add a "Workers" section to the Account screen with a screen that shows active workers, pending invites, seat usage, and an invite button.

---

### New API functions: `frontend/lib/api/workers.ts`

```typescript
import { api } from "./client";
import { parse, parseArray } from "./client";
import { WorkerMemberSchema, PendingInviteSchema, WorkerInviteInputSchema } from "@/types/workers";

export async function listWorkers() {
  const { data } = await api.get("/workers");
  return parseArray(WorkerMemberSchema, data);
}

export async function listPendingInvites() {
  const { data } = await api.get("/workers/invites");
  return parseArray(PendingInviteSchema, data);
}

export async function createWorkerInvite(payload: { phone: string; role_id: string }) {
  const { data } = await api.post("/workers/invite", payload);
  return data;
}

export async function revokeInvite(inviteId: string) {
  await api.delete(`/workers/invites/${inviteId}`);
}

export async function revokeWorker(membershipId: string) {
  await api.delete(`/workers/${membershipId}`);
}
```

Add to `frontend/lib/api/index.ts`:
```typescript
export { listWorkers, listPendingInvites, createWorkerInvite, revokeInvite, revokeWorker } from "./workers";
```

---

### New types: `frontend/types/workers.ts`

```typescript
import { z } from "zod";

export const WorkerMemberSchema = z.object({
  membership_id: z.string(),
  user_id: z.string(),
  phone: z.string().nullable(),
  role_name: z.string(),
  joined_at: z.string(),
});

export const PendingInviteSchema = z.object({
  invite_id: z.string(),
  phone: z.string(),
  role_name: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
});

export type WorkerMember = z.infer<typeof WorkerMemberSchema>;
export type PendingInvite = z.infer<typeof PendingInviteSchema>;
```

---

### New hooks: `frontend/hooks/useWorkers.ts`

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listWorkers, listPendingInvites, createWorkerInvite, revokeInvite, revokeWorker } from "@/lib/api/workers";

export function useWorkers() {
  return useQuery({ queryKey: ["workers"], queryFn: listWorkers });
}

export function usePendingInvites() {
  return useQuery({ queryKey: ["workers", "invites"], queryFn: listPendingInvites });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkerInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers", "invites"] });
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers", "invites"] });
    },
  });
}

export function useRevokeWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeWorker,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
    },
  });
}
```

---

### New screen: `frontend/app/(tabs)/account/workers.tsx`

A screen showing two sections:

**Active Workers section:**
- Each row: phone number, role name badge, "Remove" button
- "Remove" triggers `Alert.alert("Remove worker?", ...)` confirmation before calling `useRevokeWorker`

**Pending Invites section:**
- Each row: phone number, role name, expiry date, "Cancel" button
- "Cancel" triggers confirmation before calling `useRevokeInvite`

**Invite button** (fixed at bottom or in header):
- Opens a simple modal / inline form with two fields: phone number + role selector (dropdown of available roles)
- On submit, calls `useCreateInvite`
- On success, shows the OTP if the backend returned one (DEBUG mode), otherwise shows "Invite sent"

Use the same `StyleSheet` pattern as `account/index.tsx`.

---

### Update `frontend/app/(tabs)/account/index.tsx`

Add a "Workers" row in a new "Team" section, between "Subscription" and "Security":

```tsx
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Team</Text>
  <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/workers")}>
    <Text style={styles.rowText}>Workers</Text>
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
1. Open Account → Workers → active workers list loads
2. Tap "Invite" → form opens with phone + role fields
3. Submit → invite created, appears in Pending Invites section
4. Tap "Cancel" on a pending invite → confirmation, then removed from list
5. Tap "Remove" on an active worker → confirmation, then removed from list

---

## Implementation Order

1. **E5-1** — Tables + migration + seeded roles/permissions (backend only)
2. **E5-2** — Permission dependency + apply to sensitive routes (backend only)
3. **E5-3** — Worker invite flow: `/workers` and `/invites` routers (backend only)
4. **E5-4** — Frontend Workers screen (frontend + relies on E5-3)

---

## Success Criteria

✓ 5 new tables exist: `roles`, `permissions`, `role_permissions`, `tenant_memberships`, `invites`
✓ 4 system roles seeded with correct permission sets
✓ Default tenant owner linked to `distributor_owner` role
✓ `require_permission("orders:write")` blocks users without that permission (403)
✓ `POST /workers/invite` rejects when `max_workers` limit is reached (422)
✓ `POST /invites/activate` creates a user + membership + returns a JWT
✓ Workers screen shows active workers and pending invites
✓ Invite flow works end-to-end on the UI
✓ `pytest tests/backend/ -q` → all tests pass
✓ `npm run build` → 0 TypeScript errors
