# Implementation Introduction

## Current Status

**Epics 1–5 are complete and merged to `main`.** Epic 6 is in progress (migration written, screens pending).

| Epic | Status | Migration |
|------|--------|-----------|
| 1 — DB Foundation | ✅ Complete | g1, g2, g3 |
| 2 — Authentication | ✅ Complete | h1 |
| 3 — Tenant Isolation | ✅ Complete | — |
| 4 — Plans & Billing | ✅ Complete | i1 |
| 5 — Workers & Roles | ✅ Complete | j1 |
| 6 — Profile Tab | 🔄 In Progress | k1 (uncommitted) |

---

## What This App Is

A distributor-first operations system for managing an LPG gas cylinder business. The core workflow covers customer orders, cylinder exchanges, company refills, inventory, cash flow, and daily reporting. The accounting model is ledger-first: every business action posts canonical ledger entries, and all balances are derived from that ledger. The backend is the authoritative source of truth.

The app is in production with one distributor. The infrastructure now has full authentication, tenant isolation, plans/billing, and worker roles. Epic 6 completes the Profile tab.

---

## Why We Are Doing This

The app needs to grow from a single-user prototype into a production-grade platform. Specifically:

1. **Anyone can currently call the API.** There is no authentication. Any request reaches the backend without identifying who made it. This needs to be fixed before the app handles real money and customer data.

2. **The database has no tenant boundaries.** All data belongs to nobody in particular. The moment a second distributor is onboarded, their customers, orders, and balances would be mixed with the first distributor's data with no separation. This is the most dangerous structural gap.

3. **There is no audit trail.** Records have a `created_at` but no `updated_at`, no `created_by`, and no record of who changed what. Soft deletes use an `is_reversed` flag pattern that is ambiguous and hard to query correctly.

4. **The Profile tab is empty.** Business configuration (prices, system types, expense categories), account management, and security settings have no home in the app yet.

5. **Workers, roles, and plans do not exist.** The distributor cannot add workers with different permissions. There is no plan structure to control what each distributor can do or how many workers they can have.

These are not independent problems — they are layers. Fixing authentication without tenant isolation first means auth has no context to enforce. Building workers without auth means workers have no identity. Building plans without a billing ledger means suspension cannot be enforced. The work must happen in a specific order.

---

## What the End State Looks Like

**For the distributor (Epics 1–5 complete, Epic 6 in progress):**
- ✅ Logs in with phone + password; persistent session (no login required on reopen)
- ✅ Can change their password from Account → Security
- ✅ Can invite workers and assign them roles (driver, cashier, accountant)
- ✅ Each worker has their own login and only sees what their role allows (enforced backend + frontend)
- ✅ Account tab shows: plan status, billing history (Plan & Billing), active workers/invites (Workers), password change (Security)
- ✅ Suspended or overdue accounts cannot write new data (402 on all writes)
- 🔄 Business Profile, Prices, System Types, Expense Categories — Epic 6 in progress
- ⬜ Face ID / passkey enrollment — not yet built (future epic)

**For the developer:**
- ✅ Can create distributor accounts via the developer API
- ✅ Can assign plans, record payments, apply discounts, suspend/reactivate accounts
- ⬜ Admin console UI — not yet built (backend API supports it when needed)

**For the codebase:**
- ✅ Every API route is protected with JWT and tenant-scoped
- ✅ Every sensitive write route enforces role-based permissions (`require_permission`)
- ✅ Every record has `tenant_id`; audit columns (`created_by`, `updated_at`, `updated_by`) are in place
- ✅ Soft deletes are clean: `deleted_at IS NULL` = active, `deleted_at IS NOT NULL` = deleted
- ✅ Database constraints enforce enum fields and business rules at the DB level
- ✅ Schema supports multiple distributors, multiple workers per distributor, and multiple plans

---

## What We Are Not Building Yet

- A developer admin console UI (the backend API will support it; the UI comes later)
- Automated billing or invoice generation (payments are recorded manually by the developer)
- Multi-currency support
- Complex plan pricing engines (plans are defined manually for now)
- Worker reporting dashboards or analytics beyond what already exists

---

## The Six Epics

### Epic 1 — Database & Infrastructure Foundation ✅ COMPLETE

- ✅ `tenant_id` on every operational table; default tenant seeded; all existing data assigned
- ✅ `updated_at`, `updated_by`, `created_by` on all records
- ✅ `group_id` added to company transactions, expenses, cash adjustments
- ✅ Database-level CHECK constraints for enum fields and business rules
- ✅ `deleted_at` / `deleted_by` soft-delete replaces `is_reversed`; backfilled; all queries updated

---

### Epic 2 — Authentication & Security ✅ COMPLETE

- ✅ `users`, `sessions`, `activation_challenges` tables
- ✅ JWT middleware on all routes; anonymous requests rejected (401)
- ✅ Login/logout flow; persistent sessions; app does not require login on every open
- ✅ Password change from Account → Security → Change Password
- ⬜ Passkey / Face ID enrollment — not yet built

---

### Epic 3 — Tenant Isolation Enforcement ✅ COMPLETE

- ✅ All routes scope reads/writes to the authenticated user's `tenant_id`
- ✅ `require_write_access` blocks writes for grace_period/suspended tenants (402)
- ✅ Developer API: create tenant, suspend/reactivate

---

### Epic 4 — Plans, Billing & Subscription ✅ COMPLETE

- ✅ `plans`, `plan_entitlements`, `tenant_plan_subscriptions`, `tenant_plan_overrides`, `billing_events` tables
- ✅ Default plan seeded and linked to existing tenant
- ✅ Plan enforcement middleware: reads only in grace_period, all writes blocked when suspended
- ✅ Developer API: record payment, add charge, apply discount, change plan, set trial
- ✅ Account → Plan & Billing screen (read-only view of plan, status, payment history)

---

### Epic 5 — Workers, Roles & Permissions ✅ COMPLETE

- ✅ `roles`, `permissions`, `role_permissions`, `tenant_memberships`, `invites` tables
- ✅ 4 system roles seeded: distributor_owner, driver, cashier, accountant with permission sets
- ✅ Invite flow: owner creates invite → OTP → worker activates → role assigned
- ✅ Seat limit enforced against `max_workers` plan entitlement before every invite
- ✅ `require_permission(code)` enforced on all write routes (backend always validates)
- ✅ Account → Workers screen: active workers, pending invites, seat usage, invite modal
- ⬜ Frontend permission-based button hiding (not yet implemented — backend enforcement is in place)

---

### Epic 6 — Profile Tab Completion 🔄 IN PROGRESS

- ✅ `k1` migration written (adds `business_name`, `owner_name`, `phone`, `address` to `tenants`) — not yet committed
- ✅ `GET /profile` + `PATCH /profile` endpoints written (E6-1 ticket) — not yet committed
- ⬜ Business Profile screen (E6-2)
- ⬜ Configuration screens: Prices, System Types, Expense Categories (E6-3)
- ⬜ App Preferences, Support & About sections

---

## Constraints and Principles

**The backend is always authoritative.** The frontend may hide buttons, but the backend validates every request independently. A worker who manipulates the app directly must still be blocked by the API.

**No hard deletes.** Every record uses soft delete. Audit trails are permanent.

**Tenant isolation is non-negotiable.** A distributor must never be able to read or affect another distributor's data, even through direct API calls.

**Migrations are additive and reversible.** Each migration adds columns or tables. No existing columns are removed until all code paths have been verified against the new pattern.

**Codex implements, not improvises.** Each ticket defines exactly which files change, what the change is, and what the verification step is. Nothing outside the ticket scope is touched.

---

## Dependency Order

```
Epic 1 — Database Foundation          ✅ DONE
    └── Epic 2 — Authentication        ✅ DONE
            └── Epic 3 — Tenant Enforcement  ✅ DONE
                    ├── Epic 4 — Plans & Billing     ✅ DONE
                    │       └── Epic 5 — Workers & Roles  ✅ DONE
                    └── Epic 6 — Profile Tab         🔄 IN PROGRESS
```
