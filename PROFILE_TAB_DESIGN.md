# Profile Tab Design

## Context

This document covers the recommended structure and content for the Profile tab in the gas distributor app. The design is grounded in three sources:

1. **The proposal** — ledger-first, backend-authoritative, distributor-first operations system
2. **The audit** — authentication and authorization are top-priority concerns; settings surfaces need separation from operational screens
3. **The authentication/multi-tenant conversation** — invite-only, plan-based worker limits, manual billing, minimal developer console

---

## Core Design Principle

**Profile is a hub, not a form.**

It shows account status at a glance and routes to focused subpages. It does not host large forms, raw ledger toggles, or operational workflows. Day-to-day operations (reports, add activity, inventory, cash) stay in their own tabs.

---

## Two Clear Responsibilities of Profile

| Responsibility | What It Covers |
|----------------|----------------|
| **Account layer** | Plan, billing, business identity, team, security — who you are and what you can do |
| **Configuration layer** | Prices, systems, expense categories, business rules — how your daily operations are configured |

These must stay separate. Operational accounting logic belongs in the backend. Profile only exposes configuration that the distributor legitimately controls.

---

## Section Order and Content

### 1. Status Summary Block
**Position:** Top of screen, always visible, compact card

This is the first thing the distributor sees. It must immediately answer: "Can I use this app normally right now?"

**Show:**
- Business / distributor name
- Current plan name (e.g., "Pro")
- Billing status badge: Active · Grace Period · Overdue · Suspended
- Workers used / workers allowed (e.g., "3 / 5 workers")
- Account access: Active · Read-Only · Suspended
- Alerts (if any):
  - Payment overdue — tap to view
  - Trial ending on [date]
  - Worker seat limit reached
  - Account suspended: [reason]
  - Password not yet changed (security nudge)

**Why this comes first:** Plan/billing directly affects whether the distributor can add orders, invite workers, and export reports. They need to see this before anything else.

---

### 2. Plan & Billing
**Subpage:** `Profile → Plan & Billing`

Covers what the distributor is subscribed to and whether they have paid.

**Summary row shows:**
- Plan name
- Billing status
- Next due date (or overdue date)
- Worker seats: X used / Y allowed

**Detail page shows:**
- Current plan name and description
- Included features (worker limit, reports, exports, etc.)
- Current discount (if applied by developer)
- Trial / probation end date (if applicable)
- Outstanding balance
- Suspension reason (if applicable)
- Payment history (date, amount, note for each payment)

**Actions on this page:**
- View full payment history
- View plan feature details
- Contact support / request upgrade

**What is NOT here:**
- Ability to change plan (developer-controlled only)
- Ability to pay (payment is recorded by developer manually)

**Why:** Payment between developer and distributor is manual. The distributor sees a read-only billing ledger. The developer's admin console handles adding payments and changing plans.

---

### 3. Business Profile
**Subpage:** `Profile → Business Profile`

Master identity record for this distributor account.

**Show and allow editing:**
- Business name
- Owner / contact name
- Phone / WhatsApp number
- Address / location
- Optional: business registration number
- Optional: logo or profile image

**Actions:**
- Edit profile

**What is NOT here:**
- Billing, plan, workers — those have their own sections
- Accounting settings — those belong in Business Configuration

---

### 4. Team & Workers
**Subpage:** `Profile → Workers`

This section exists now but is minimal until the workers feature is implemented. The structure is ready.

**V1 (before workers feature):**
- Show: "Workers feature coming soon"
- Show distributor's own account info (name, role, WhatsApp)

**V1.5+ (after workers feature):**

Workers list shows:
- Name
- Role (Driver, Cashier, Accountant, etc.)
- Status: Active · Pending · Disabled
- Last active date

Seat usage bar:
- X active / Y allowed by plan
- If at limit: show warning and block new invites

**Actions:**
- + Invite worker (disabled if seat limit reached or plan doesn't allow)
- Resend invite
- Disable worker
- Assign / change role

**Roles & Permissions subpage** (accessible from Workers):
- Defines what each role can do
- Controlled by distributor within limits set by their plan
- Examples: can create order · can collect payment · can view reports · can edit prices

**Important rules (enforced on backend, not just UI):**
- Backend validates seat limits before every invite
- Workers can only access this distributor's data
- Role permissions are validated on every API request
- Frontend hides buttons, but backend always blocks unauthorized actions

---

### 5. Business Configuration
**Subpage:** `Profile → Configuration`

Operational settings that the distributor customizes. These affect how day-to-day activities are created and categorized. None of them change accounting logic — that stays in the backend.

#### A. Prices
**First item in configuration — highest operational impact**

**Subpage:** `Profile → Configuration → Prices`

**Show:**
- Current prices per gas type (12kg and 48kg):
  - Replacement price (price per cylinder delivered)
  - Sell Full price (sell_iron_price)
  - Buy Empty price (buy_iron_price)
  - Company buy price (what you pay the supplier per cylinder)
- Effective from date for each price
- Price history (previous prices with dates)

**Actions:**
- Edit / update price
- View price history

**Note:** Price changes take effect from the moment they're saved. Historical reports use the price that was active at the time of the transaction (the `price_catalog` table already handles this via `effective_from`).

---

#### B. Systems
**Subpage:** `Profile → Configuration → Systems`

This is where the distributor defines their installation type names (kitchen, bathroom, water heater, generator). These are **not gas types** — gas types (12kg, 48kg) are fixed by the platform.

**Show:**
- List of system types with name and status (active/inactive)
- Examples: "Main Kitchen", "Backup Kitchen", "Water Heater", "Generator"

**Actions:**
- + Add system type
- Edit name
- Deactivate / reactivate

**Why "Systems" not "Gas Types":** The proposal explicitly separates gas type (12kg / 48kg, fixed dimensions) from system (operational context label that the distributor defines per customer installation). Mixing them would break the domain model.

---

#### C. Expense Categories
**Subpage:** `Profile → Configuration → Expense Categories`

**Show:**
- List of expense categories with name and status
- Examples: Fuel, Food, Delivery, Maintenance, Rent, Utilities, Office

**Actions:**
- + Add category
- Edit name
- Deactivate / reactivate

**Why here:** Both the proposal and audit call for standardizing expense categories under Config / Settings. Letting distributors manage their own list keeps the app flexible without breaking the shared vocabulary rule — each distributor has their own authoritative list.

---

#### D. Business Rules
**Subpage:** `Profile → Configuration → Business Rules`

**Minimal and curated.** Only expose rules that are genuinely distributor-configurable. Do not expose accounting internals.

**Include:**
- Default security check interval for systems (e.g., every 12 months)
- Notifications preferences for overdue customer balances (later)
- Default payment collection prompts (later)

**Do NOT include:**
- Sign conventions for balances (backend-fixed)
- Ledger account definitions (backend-fixed)
- Reversal / edit semantics (backend-fixed)
- Any toggle that would change accounting meaning

**Why:** The proposal states the backend is authoritative for accounting truth. Business rules should be transparent operational policies the distributor genuinely controls — not workarounds for accounting edge cases.

---

### 6. Security
**Subpage:** `Profile → Security`

Given that the audit flags authentication and authorization as top-priority concerns, Security is a first-class section with its own dedicated space.

**Items:**

**Change Password**
- Requires current password or biometric re-auth
- New password policy: min 12 chars, allow 64+, no forced composition rules, block common/breached passwords, show strength meter
- After change: offer to log out all other devices

**Biometric / Passkey Login**
- Enable Face ID / fingerprint / device PIN via platform passkey (WebAuthn)
- List enrolled passkeys / devices
- Remove passkey
- Biometric data never leaves the device; public-key credential only

**Active Sessions & Devices**
- List: device name, platform, last active
- Actions: logout this device, logout all devices

**Verified Login Number**
- Shows current WhatsApp number used for recovery / one-time codes
- Change number is a sensitive action (may require developer support or fresh re-auth)

**Recovery**
- Recovery via WhatsApp OTP to verified number
- Admin-assisted recovery if number is lost

**What NOT in Security:**
- Billing or plan
- Workers
- Any operational data

---

### 7. App Preferences
**Subpage:** `Profile → Preferences`

Non-operational user preferences that affect the app experience but not accounting.

**Include:**
- Language (if multi-language is planned)
- Notifications (on/off; overdue alerts, inventory warnings, etc.)
- Theme (light/dark, if available)
- Date format preference (if regional differences matter)

**Do NOT include:**
- Currency — the app uses one currency defined at the backend level. Exposing this as a setting would break the ledger if changed without a full data migration. Currency is controlled by the developer, not the distributor.
- Money decimal places — same reason. Controlled by `system_settings` at the backend.

---

### 8. Support & About
**Subpage:** `Profile → Support & About`

**Include:**
- App version number
- Contact developer / support (opens message or link)
- Privacy policy
- Terms of service
- Logout (primary action, clearly visible)
- Optional: diagnostics / sync status for support use

**Logout** appears here as a deliberate final action. It is not buried in Security because it is a primary user action, not a security event.

---

## Recommended Final Order

```
Profile Tab
│
├── Status Summary Block (always visible, compact)
│     Business name · Plan · Billing status · Workers · Alerts
│
├── Plan & Billing
│     Plan details · Payment status · Payment history · Due date
│
├── Business Profile
│     Business name · Owner · Phone · Address
│
├── Team & Workers
│     Active workers · Pending invites · Seat usage · Invite
│     └── Roles & Permissions
│
├── Business Configuration
│     ├── Prices
│     ├── Systems (installation types)
│     ├── Expense Categories
│     └── Business Rules
│
├── Security
│     ├── Change Password
│     ├── Biometric / Passkey Login
│     ├── Active Sessions & Devices
│     └── Verified Login Number
│
├── App Preferences
│     Language · Notifications · Theme
│
└── Support & About
      Version · Contact support · Logout
```

---

## What Should NOT Be in Profile

| Item | Why It Doesn't Belong |
|------|----------------------|
| Current balances | Operational data — belongs in Reports |
| Daily activity feed | Operational data — belongs in Reports / Add |
| Inventory status | Operational — belongs in Inventory tab |
| Wallet/bank balance | Operational — belongs in Cash/Bank tab |
| Company balance | Operational — belongs in Company Activities |
| Customer list | Operational — belongs in Customers tab |
| Raw ledger browser | Technical — not a user-facing feature |
| Add/edit order forms | Operational workflows — belong in Add tab |

The proposal already defines separate operational homes for all of these. Mixing them into Profile would collapse the product structure and create an oversized screen — exactly the pattern the audit is trying to remove from the existing 3,000-line components.

---

## V1 Recommended Scope

**Ship in V1:**
- Status Summary Block
- Plan & Billing (read-only for distributor)
- Business Profile
- Prices
- Expense Categories
- Security
- App Preferences (Language at minimum)
- Support & About (with Logout)

**Ship when workers feature is implemented:**
- Team & Workers
- Roles & Permissions

**Ship when more configuration is needed:**
- Systems (if not already part of customer setup flow)
- Business Rules

---

## New Database Tables Needed (For Future Features)

The following tables do not yet exist and will be needed when these Profile features are implemented:

| Table | Purpose |
|-------|---------|
| `users` | Auth credentials, status, password_hash, last_login_at |
| `tenants` | One row per distributor workspace |
| `tenant_memberships` | Links user to tenant with role |
| `roles` | Named roles (driver, cashier, admin) |
| `permissions` | Fine-grained permission flags |
| `role_permissions` | Maps role → permission |
| `plans` | Plan definitions (name, max_workers, features) |
| `plan_entitlements` | Per-plan feature flags and limits |
| `tenant_plan_subscriptions` | Which plan a tenant is on |
| `tenant_plan_overrides` | Developer-applied discounts/seat overrides |
| `billing_ledger` | Manual payment and charge history per tenant |
| `invites` | Pending worker/distributor invitations |
| `passkey_credentials` | WebAuthn public key credentials per user |
| `sessions` | Active refresh tokens per device |
| `activation_challenges` | One-time codes for first login |
| `audit_events` | Platform-level admin action log |

These extend the current `system_settings` singleton model into a proper multi-tenant structure. The existing operational tables (`customer_transactions`, `company_transactions`, etc.) remain unchanged — they just get scoped to a `tenant_id` once multi-tenancy is introduced.

---

## Naming Fixes

| Your List | Recommended Label | Reason |
|-----------|------------------|--------|
| "manage gas types (main kitchen, ...)" | **Systems** | Those are system labels, not gas types |
| "manage expenses (fuel, food, ...)" | **Expense Categories** | Clearer, matches what's actually managed |
| "manage prices" | **Prices** | Direct, no "manage" prefix needed |
| "manage workers" | **Workers** | Direct |
| "manage rules" | Split → **Roles & Permissions** + **Business Rules** | Two different concepts |
| "password (security)" | **Security** | Broader — includes biometric, sessions |
| "currency" | Remove from distributor settings | Backend-controlled, not safe to expose |
| "settings" | Remove as a catch-all | Everything already has a proper home |
