# Database Migration Plan

## Should You Fix the Database First?

**Yes — specifically the foundation layer. Here is why.**

The most expensive change to retrofit later is **multi-tenancy** (`tenant_id`). Every operational table (customer_transactions, company_transactions, expenses, inventory_adjustments, cash_adjustments, ledger_entries, customers, systems) needs a `tenant_id` column before new data accumulates without it.

If you build authentication, workers, and plans first without adding `tenant_id`, you will:
1. Have auth tables without tenant context
2. Have operational data with no tenant owner
3. Need a second migration pass to add `tenant_id` to everything retroactively
4. Risk data isolation bugs between distributors

**The right order:** Foundation → Non-breaking fixes → Soft-delete migration → Auth → Plans/Billing → Workers.

The existing operational tables (orders, refills, expenses, etc.) do not change their business logic at any phase. They only gain new columns.

---

## Current State Summary

| Aspect | Current |
|--------|---------|
| Database | PostgreSQL |
| Migrations | 7 alembic files in `alembic/versions_v2/` |
| Auth tables | None |
| `tenant_id` | Does not exist anywhere |
| `updated_at` | Does not exist anywhere |
| `deleted_at` | Does not exist (uses `is_reversed` + `reversed_id` instead) |
| `created_by` | Does not exist anywhere |
| `group_id` | Only in `customer_transactions` and `inventory_adjustments` |

---

## Target Architecture (All Tables, Final State)

### Identity & Auth Layer (All New)

#### `users`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `username` | String UNIQUE | Login identifier (no email) |
| `phone_whatsapp` | String | For OTP delivery and recovery |
| `status` | Enum | `invited` · `active` · `locked` · `disabled` |
| `password_hash` | String | Argon2id hash |
| `must_change_password` | Bool | True on first activation |
| `password_changed_at` | DateTime(TZ) | Last password change |
| `last_login_at` | DateTime(TZ) | Last successful login |
| `created_at` | DateTime(TZ) | System |
| `updated_at` | DateTime(TZ) | On every update |

#### `passkey_credentials`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `user_id` | UUID FK(users) | Owner |
| `credential_id` | String UNIQUE | WebAuthn credential ID |
| `public_key` | Bytes | Public key for verification |
| `sign_count` | Int | Replay attack prevention |
| `device_name` | String | User-visible label ("iPhone 15") |
| `created_at` | DateTime(TZ) | System |
| `last_used_at` | DateTime(TZ) | Last successful auth |

#### `sessions`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `user_id` | UUID FK(users) | Owner |
| `refresh_token_hash` | String UNIQUE | Hashed refresh token |
| `device_name` | String | User-visible label |
| `platform` | String | `ios` · `android` · `web` |
| `ip_address` | String | For display and audit |
| `created_at` | DateTime(TZ) | System |
| `last_used_at` | DateTime(TZ) | On every token refresh |
| `expires_at` | DateTime(TZ) | Hard expiry |
| `revoked_at` | DateTime(TZ) | Null = still valid |

#### `activation_challenges`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `user_id` | UUID FK(users) | Target user |
| `code_hash` | String | Hashed one-time code (never stored plain) |
| `expires_at` | DateTime(TZ) | Short expiry (15 min) |
| `used_at` | DateTime(TZ) | Null = not yet used |
| `attempts` | Int | Increment on each wrong try; lock at threshold |
| `created_at` | DateTime(TZ) | System |

---

### Tenant Layer (All New)

#### `tenants`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `name` | String | Business / distributor name |
| `status` | Enum | `active` · `warning` · `grace_period` · `read_only` · `suspended` · `disabled` |
| `owner_user_id` | UUID FK(users) | Distributor owner |
| `created_at` | DateTime(TZ) | System |
| `updated_at` | DateTime(TZ) | On every update |

#### `tenant_memberships`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `tenant_id` | UUID FK(tenants) | Which tenant |
| `user_id` | UUID FK(users) | Which user |
| `role_id` | UUID FK(roles) | Assigned role |
| `status` | Enum | `active` · `invited` · `disabled` |
| `invited_by` | UUID FK(users) | Who sent the invite |
| `accepted_at` | DateTime(TZ) | When user accepted |
| `created_at` | DateTime(TZ) | System |
| `updated_at` | DateTime(TZ) | On every update |

---

### Roles & Permissions Layer (All New)

#### `roles`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `tenant_id` | UUID FK(tenants) NULL | NULL = platform-wide system role |
| `name` | String | `distributor_owner` · `driver` · `cashier` · `accountant` |
| `is_system_role` | Bool | True = platform-defined, not editable |
| `created_at` | DateTime(TZ) | System |

#### `permissions`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `code` | String UNIQUE | `create_order` · `collect_payment` · `view_reports` · `manage_prices` · `invite_workers` · etc. |
| `description` | String | Human-readable |

#### `role_permissions`
| Column | Type | Purpose |
|--------|------|---------|
| `role_id` | UUID FK(roles) | Role |
| `permission_id` | UUID FK(permissions) | Permission |
| Composite PK | (role_id, permission_id) | No duplicates |

---

### Plans & Billing Layer (All New)

#### `plans`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `code` | String UNIQUE | `starter` · `pro` · `enterprise` |
| `name` | String | Display name |
| `pricing_model` | Enum | `fixed` · `usage_based` · `custom` |
| `base_price` | Int (cents) | Default monthly price |
| `is_active` | Bool | Whether new subscriptions allowed |
| `created_at` | DateTime(TZ) | System |
| `updated_at` | DateTime(TZ) | On every update |

#### `plan_entitlements`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `plan_id` | UUID FK(plans) | Which plan |
| `max_workers` | Int | Worker seat limit |
| `can_manage_workers` | Bool | Can invite/manage workers |
| `can_export_reports` | Bool | Can export data |
| `can_edit_prices` | Bool | Can change price catalog |
| `can_view_financials` | Bool | Can see company/cash balances |
| `can_use_passkeys` | Bool | Can register passkeys |
| `can_have_trial` | Bool | Trial allowed |

#### `tenant_plan_subscriptions`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `tenant_id` | UUID FK(tenants) | Which tenant |
| `plan_id` | UUID FK(plans) | Which plan |
| `status` | Enum | `trial` · `active` · `grace_period` · `expired` · `cancelled` |
| `started_at` | DateTime(TZ) | When subscription started |
| `trial_ends_at` | DateTime(TZ) | Null if not a trial |
| `current_period_ends_at` | DateTime(TZ) | Billing period end |
| `created_at` | DateTime(TZ) | System |

#### `tenant_plan_overrides`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `tenant_id` | UUID FK(tenants) | Which tenant |
| `override_max_workers` | Int NULL | Developer override for seat limit |
| `discount_type` | Enum NULL | `percent` · `fixed` |
| `discount_value` | Int NULL | Discount amount |
| `custom_price` | Int NULL | Override price |
| `probation_until` | DateTime(TZ) NULL | Trial/probation end |
| `grace_days` | Int NULL | How many days of grace after overdue |
| `notes` | String | Developer note explaining override |
| `applied_by` | String | Developer username |
| `created_at` | DateTime(TZ) | System |

#### `billing_events`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `tenant_id` | UUID FK(tenants) | Which tenant |
| `event_type` | Enum | `charge` · `payment` · `discount` · `credit` · `refund` |
| `amount` | Int (cents) | Positive = charge, negative = credit |
| `balance_after` | Int (cents) | Running balance snapshot after this event |
| `note` | String | Developer note |
| `due_date` | Date NULL | For charges only |
| `created_at` | DateTime(TZ) | System |
| `created_by` | String | Developer username |

---

### Invitations (New)

#### `invites`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `tenant_id` | UUID FK(tenants) | Which tenant |
| `inviter_id` | UUID FK(users) | Who created the invite |
| `invitee_phone` | String | WhatsApp number to send OTP to |
| `target_role_id` | UUID FK(roles) | Role the invitee will get |
| `code_hash` | String | Hashed one-time invite code |
| `status` | Enum | `pending` · `accepted` · `expired` · `cancelled` |
| `expires_at` | DateTime(TZ) | After which invite is invalid |
| `used_at` | DateTime(TZ) | When accepted |
| `created_at` | DateTime(TZ) | System |

---

### Audit Log (New)

#### `platform_audit_events`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Primary key |
| `actor_id` | UUID FK(users) NULL | Who performed the action (null = system) |
| `tenant_id` | UUID FK(tenants) NULL | Affected tenant |
| `action` | String | `account_created` · `plan_changed` · `worker_invited` · `password_changed` · `session_revoked` · etc. |
| `target_type` | String | `user` · `tenant` · `plan` · `billing_event` |
| `target_id` | UUID | ID of affected record |
| `old_value` | JSON NULL | Previous state (sensitive fields redacted) |
| `new_value` | JSON NULL | New state (sensitive fields redacted) |
| `metadata` | JSON NULL | Extra context |
| `created_at` | DateTime(TZ) | System (this table is append-only, never updated or deleted) |

---

### Existing Operational Tables — Changes Only

All 5 operational tables (`customer_transactions`, `company_transactions`, `expenses`, `inventory_adjustments`, `cash_adjustments`) and master records (`customers`, `systems`, `ledger_entries`) receive new columns. Their existing columns are unchanged.

#### Columns Added to ALL Operational Tables
| Column | Type | Why |
|--------|------|-----|
| `tenant_id` | UUID FK(tenants) NOT NULL | Tenant isolation — most critical addition |
| `created_by` | UUID FK(users) NULL | Who entered this activity |
| `updated_at` | DateTime(TZ) NULL | When was this last edited |
| `updated_by` | UUID FK(users) NULL | Who last edited this |
| `deleted_at` | DateTime(TZ) NULL | Replaces `is_reversed` for soft delete |
| `deleted_by` | UUID FK(users) NULL | Who deleted it |
| `reversal_source_id` | UUID NULL | If this row is a reversal, what it reverses |

#### Columns Added to `customers` and `systems` (Master Records)
| Column | Type | Why |
|--------|------|-----|
| `tenant_id` | UUID FK(tenants) NOT NULL | Tenant isolation |
| `updated_at` | DateTime(TZ) NULL | Track when name/address changed |
| `updated_by` | UUID FK(users) NULL | Who edited it |

#### Columns Added to `company_transactions`, `expenses`, `cash_adjustments`
| Column | Type | Why |
|--------|------|-----|
| `group_id` | UUID NULL | Consistent grouping (already in customer_transactions and inventory_adjustments) |

#### `is_reversed` and `reversed_id` — Migration Plan
These columns **stay** during the migration period and are eventually deprecated:
- Phase 3: Add `deleted_at` and `reversal_source_id`
- Phase 3: Backfill: `deleted_at = created_at WHERE is_reversed = TRUE`
- Phase 3: Update all queries to use `WHERE deleted_at IS NULL`
- Phase 4+: Drop `is_reversed` and `reversed_id` once all paths confirmed

---

## Migration Phases

### Phase 0 — Tenant Foundation ← **DO THIS FIRST**
**Why first:** Every new distributor record needs a `tenant_id`. Retrofitting this later after authentication exists is much harder. This phase is non-destructive — it adds columns to existing tables and creates one default tenant for the single distributor that currently exists.

**Alembic migration: `add_tenant_foundation`**
```
1. Create `tenants` table
2. Insert one default tenant row (id = known UUID, name = "Default")
3. ALTER TABLE customers ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<default_tenant_uuid>'
4. ALTER TABLE systems ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<default_tenant_uuid>'
5. ALTER TABLE customer_transactions ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<default_tenant_uuid>'
6. ALTER TABLE company_transactions ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<default_tenant_uuid>'
7. ALTER TABLE expenses ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<default_tenant_uuid>'
8. ALTER TABLE inventory_adjustments ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<default_tenant_uuid>'
9. ALTER TABLE cash_adjustments ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<default_tenant_uuid>'
10. ALTER TABLE ledger_entries ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<default_tenant_uuid>'
11. Add FK constraints: each tenant_id -> tenants.id
12. Add indexes on all tenant_id columns
13. Remove DEFAULT after backfill (make application always supply it)
```

**Application changes required:**
- Every query that writes to operational tables must include `tenant_id`
- Every query that reads must filter by `tenant_id` (enforced in backend middleware once auth exists)
- No user-facing change yet

---

### Phase 1 — Non-Breaking Column Additions
**Alembic migration: `add_audit_columns`**
```
1. ALTER TABLE customers ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE
2. ALTER TABLE systems ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE
3. ALTER TABLE customer_transactions ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE
4. ALTER TABLE company_transactions ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE
5. ALTER TABLE expenses ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE
6. ALTER TABLE inventory_adjustments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE
7. ALTER TABLE cash_adjustments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE
8. ALTER TABLE company_transactions ADD COLUMN group_id UUID
9. ALTER TABLE expenses ADD COLUMN group_id UUID
10. ALTER TABLE cash_adjustments ADD COLUMN group_id UUID
11. Add indexes on group_id columns
```

**Alembic migration: `add_db_constraints`**
```
1. ALTER TABLE customer_transactions ADD CONSTRAINT ck_kind
   CHECK (kind IN ('order','payment','return','payout','adjust'))
2. ALTER TABLE customer_transactions ADD CONSTRAINT ck_mode
   CHECK (mode IN ('replacement','sell_iron','buy_iron') OR mode IS NULL)
3. ALTER TABLE company_transactions ADD CONSTRAINT ck_kind
   CHECK (kind IN ('refill','buy_iron','payment','adjust'))
4. ALTER TABLE expenses ADD CONSTRAINT ck_kind
   CHECK (kind IN ('expense','deposit'))
5. ALTER TABLE expenses ADD CONSTRAINT ck_paid_from
   CHECK (paid_from IN ('cash','bank') OR paid_from IS NULL)
6. ALTER TABLE customer_transactions ADD CONSTRAINT ck_system_mode
   CHECK (
     (mode IN ('replacement','sell_iron') AND system_id IS NOT NULL)
     OR (mode IS NULL OR mode NOT IN ('replacement','sell_iron'))
   )
```

**Application changes required:** None. These only block invalid data that the app never sends anyway.

---

### Phase 2 — Authentication Foundation
**Alembic migration: `add_auth_tables`**
```
1. Create users table
2. Create passkey_credentials table
3. Create sessions table
4. Create activation_challenges table
5. Create invites table
6. Create platform_audit_events table
7. Add created_by UUID FK(users) NULLABLE to all operational tables
```

**Application changes required:**
- Implement auth middleware (JWT validation on every route)
- Implement invite + activation flow
- Implement password change on first login
- Implement passkey enrollment (optional initially)
- Add `created_by = current_user.id` to every transaction write
- All existing routes that are currently open become protected

---

### Phase 3 — Soft Delete Migration
**Alembic migration: `add_soft_delete_columns`**
```
1. ALTER each transaction table:
   ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE NULL
   ADD COLUMN deleted_by UUID FK(users) NULL
   ADD COLUMN reversal_source_id UUID NULL

2. Backfill:
   UPDATE customer_transactions
   SET deleted_at = created_at, reversal_source_id = reversed_id
   WHERE is_reversed = TRUE AND reversed_id IS NOT NULL

   (same for company_transactions, expenses, inventory_adjustments, cash_adjustments)

3. Add indexes on deleted_at (partial: WHERE deleted_at IS NOT NULL)
```

**Application changes required:**
- Change all queries from `WHERE is_reversed = FALSE` to `WHERE deleted_at IS NULL`
- Change delete logic from setting `is_reversed = TRUE` to setting `deleted_at = now()` + `deleted_by = user_id`
- Verify reports, ledger, and balance queries all use new filter

**Future migration (after full switch verified):**
```
DROP COLUMN is_reversed from all tables
DROP COLUMN reversed_id from all tables
```

---

### Phase 4 — Plans & Billing
**Alembic migration: `add_plans_billing`**
```
1. Create plans table
2. Create plan_entitlements table
3. Create tenant_plan_subscriptions table
4. Create tenant_plan_overrides table
5. Create billing_events table
6. Insert default plan (e.g., "Starter" or "Default")
7. Insert default subscription for existing tenant
```

**Application changes required:**
- Developer admin console reads/writes these tables
- Middleware checks `tenant_plan_subscriptions.status` before allowing writes
- Entitlement checks: worker invite → check `plan_entitlements.max_workers`

---

### Phase 5 — Workers, Roles & Permissions
**Alembic migration: `add_workers_roles`**
```
1. Create roles table
2. Create permissions table
3. Create role_permissions table
4. Create tenant_memberships table
5. Insert system roles (distributor_owner, driver, cashier, accountant)
6. Insert platform permissions (create_order, collect_payment, view_reports, etc.)
7. Insert role_permission defaults
8. Insert tenant_membership for existing owner (tie current user to their tenant)
```

**Application changes required:**
- Permission checks on every sensitive route
- Worker invite flow (distributor invites → invite record → WhatsApp OTP → activation)
- Role assignment on acceptance
- Frontend: hide buttons by permission, backend: validate on every request

---

## Complete Entity Relationship (Final State)

```
tenants
  └── customers (tenant_id)
  └── systems (tenant_id)
  └── customer_transactions (tenant_id)
  └── company_transactions (tenant_id)
  └── expenses (tenant_id)
  └── inventory_adjustments (tenant_id)
  └── cash_adjustments (tenant_id)
  └── ledger_entries (tenant_id)
  └── tenant_memberships (tenant_id)
  └── tenant_plan_subscriptions (tenant_id)
  └── tenant_plan_overrides (tenant_id)
  └── billing_events (tenant_id)
  └── invites (tenant_id)

users
  └── passkey_credentials (user_id)
  └── sessions (user_id)
  └── activation_challenges (user_id)
  └── tenant_memberships (user_id)
  └── invites (inviter_id)
  └── platform_audit_events (actor_id)
  └── [all operational tables].created_by (user_id)

plans
  └── plan_entitlements (plan_id)
  └── tenant_plan_subscriptions (plan_id)

roles
  └── role_permissions (role_id)
  └── tenant_memberships (role_id)

permissions
  └── role_permissions (permission_id)
```

---

## Decision Table: What to Fix vs What to Leave

| Issue | Decision | When | Why |
|-------|----------|------|-----|
| Missing `tenant_id` | **Fix** | Phase 0 | Most expensive to retrofit, must come first |
| Missing `updated_at` | **Fix** | Phase 1 | Non-breaking, cheap, needed for audit trail |
| Missing `group_id` on 3 tables | **Fix** | Phase 1 | Non-breaking, needed for grouping feature |
| No DB enum constraints | **Fix** | Phase 1 | Non-breaking, protects data integrity |
| No business rule constraints | **Fix** | Phase 1 | Non-breaking, catches bugs |
| Ambiguous `is_reversed` pattern | **Fix** | Phase 3 | Requires migration, do after auth is in |
| `day` column redundancy | **Leave** | — | It is indexed and performs well; removing it risks queries; not worth the migration cost |
| Dual source of truth (debt fields) | **Leave for now** | — | Debt fields are a display cache; ledger is authoritative; removing requires careful query migration and they cause no active bugs |
| Five separate transaction tables | **Leave** | — | Unifying them is high-risk, high-effort, no operational benefit right now; a unified `activity_log` VIEW (not table) can be added later |
| `price_catalog.effective_from` naming | **Leave** | — | It works, renaming it would break queries for no benefit |
| Integer money | **Leave** | — | Correct pattern for this app (cents); switching to DECIMAL would require updating all calculations |

---

## Application Code Impact Per Phase

| Phase | Backend Changes | Frontend Changes |
|-------|----------------|-----------------|
| Phase 0 (tenant) | Add `tenant_id` to all write paths; no user-facing change | None |
| Phase 1 (columns/constraints) | Set `updated_at` on every UPDATE; add group_id where needed | None |
| Phase 2 (auth) | Add auth middleware; protect all routes; add `created_by` to writes | Login screen; token storage; session management |
| Phase 3 (soft delete) | Swap all `is_reversed = FALSE` filters to `deleted_at IS NULL` | None |
| Phase 4 (plans) | Plan enforcement middleware; billing API for dev console | Profile → Plan & Billing section |
| Phase 5 (workers) | Permission checks on all sensitive routes | Profile → Workers section; role-aware UI |

---

## What NOT to Do

- **Do not skip Phase 0.** Every distributor account added after auth exists needs a `tenant_id`. Retrofitting later means writing a migration that must correctly assign historical data to the right tenant.
- **Do not combine Phase 0 and Phase 2.** Adding tenant columns and adding auth in one migration makes rollback much harder if something breaks.
- **Do not migrate `is_reversed` before auth.** You need `deleted_by` to be a real user ID. Without auth, `deleted_by` is always null, making the migration half-done.
- **Do not expose `currency_code` or `money_decimals` to distributors.** These are in `system_settings` as developer-controlled global config. Changing them without a data migration corrupts the ledger.
- **Do not hard-delete any records.** Soft delete only. Audit trails are permanent.
