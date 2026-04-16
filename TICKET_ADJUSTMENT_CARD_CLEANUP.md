# Ticket: Adjustment Card — Remove Redundant Hero Text + Backfill Historical Snapshots

## Branch
Stay on the current branch — do NOT create a new branch.

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic, form behavior, or UI layout** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.

---

## Background

Customer adjustment cards have two problems visible in the customer view activity list:

**Problem A — Redundant delta text**
The hero text line shows `Money +80 | 12kg -2 | 48kg +3` (the raw delta values). This is redundant
because the pills already show the full before→after transition. The reason/note (if any) is
already shown in the card's subtitle line.

**Problem B — Backwards direction on old records**
Records created before the backend snapshot fix have `debt_cash=0`, `debt_cylinders_12=0`,
`debt_cylinders_48=0` stored in the database. The frontend adapter computes
`before = after - delta = 0 - 80 = -80`, which shows `credit 80 → 0` instead of `0 → debts 80`.
A one-time backfill endpoint will recompute and write the correct snapshots for all existing
`kind="adjust"` transactions using the ledger (which was always written correctly).

---

## Step 1 — Remove redundant hero text from `customerAdjustmentToEvent`

**File:** `frontend/lib/activityAdapter.ts`

Read the file first.

Find `customerAdjustmentToEvent` (around line 236). Inside it, find these lines that build and use `parts`:

```ts
  const parts: string[] = [];
  if (money !== 0) parts.push(`Money ${money > 0 ? "+" : ""}${money.toFixed(0)}`);
  if (qty12 !== 0) parts.push(`12kg ${qty12 > 0 ? "+" : ""}${qty12}`);
  if (qty48 !== 0) parts.push(`48kg ${qty48 > 0 ? "+" : ""}${qty48}`);
```

And further down in the return object:

```ts
    hero_text: parts.length > 0 ? parts.join(" | ") : "Manual adjustment",
```

Remove the three `parts.push(...)` lines and the `parts` array declaration. Then replace the `hero_text` line with:

```ts
    hero_text: null,
```

**Why:** The pills already show Money balance, 12kg balance, 48kg balance with before→after values.
The reason already appears in the card's subtitle via `event.reason`. A separate delta summary
adds no new information.

**Do not change anything else in this file.**

---

## Step 2 — Add backfill endpoint in `developer.py`

**File:** `backend/app/routers/developer.py`

Read the file first.

### 2a — Add imports

Find the existing import block at the top of the file. Add `CustomerTransaction` to the models import and add the ledger functions:

Find:
```python
from app.models import BillingEvent, Plan, Tenant, TenantPlanSubscription
```

Replace with:
```python
from app.models import BillingEvent, CustomerTransaction, Plan, Tenant, TenantPlanSubscription
from app.services.ledger import sum_customer_cylinders, sum_customer_money
```

### 2b — Add the endpoint

Add the following function at the end of the file, after the last existing `@router` handler:

```python
@router.post("/tenants/{tenant_id}/backfill-adjustment-snapshots", dependencies=_debug_dep)
def backfill_adjustment_snapshots(
  tenant_id: str,
  session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
  """
  One-time fix: recompute and write debt_cash / debt_cylinders_12 / debt_cylinders_48
  for all non-deleted kind='adjust' CustomerTransaction rows for this tenant.
  Uses the ledger (always correct) to compute the after-balance at each transaction's
  happened_at timestamp.
  """
  _require_tenant(session, tenant_id)

  rows = session.exec(
    select(CustomerTransaction)
    .where(CustomerTransaction.tenant_id == tenant_id)
    .where(CustomerTransaction.kind == "adjust")
    .where(CustomerTransaction.deleted_at == None)  # noqa: E711
    .order_by(
      CustomerTransaction.happened_at,
      CustomerTransaction.created_at,
      CustomerTransaction.id,
    )
  ).all()

  # Group by customer + group_id so each adjustment group is processed together
  groups: dict[str, list[CustomerTransaction]] = {}
  for row in rows:
    key = f"{row.customer_id}:{row.group_id or row.id}"
    groups.setdefault(key, []).append(row)

  updated = 0
  for txns in groups.values():
    latest = max(txns, key=lambda t: (t.happened_at, t.created_at, t.id))
    after_money = sum_customer_money(
      session, customer_id=latest.customer_id, up_to=latest.happened_at
    )
    after_12 = sum_customer_cylinders(
      session, customer_id=latest.customer_id, gas_type="12kg", up_to=latest.happened_at
    )
    after_48 = sum_customer_cylinders(
      session, customer_id=latest.customer_id, gas_type="48kg", up_to=latest.happened_at
    )
    for txn in txns:
      txn.debt_cash = after_money
      txn.debt_cylinders_12 = after_12
      txn.debt_cylinders_48 = after_48
      session.add(txn)
      updated += 1

  session.commit()
  return {"tenant_id": tenant_id, "groups_processed": len(groups), "rows_updated": updated}
```

**Do not change anything else in this file.**

---

## Verification

### Backend
```bash
cd backend && python -c "from app.routers.developer import router; print('OK')"
```
Expected: prints `OK`.

### Frontend
```bash
cd frontend && npm run build
```
Expected: 0 TypeScript errors.

### Running the backfill

Call the endpoint once per tenant to fix historical data:

```
POST /developer/tenants/{tenant_id}/backfill-adjustment-snapshots
```

(Requires `DEBUG=true` in the backend environment.)

Expected response:
```json
{ "tenant_id": "...", "groups_processed": 3, "rows_updated": 4 }
```

### Manual checks

1. Open a customer whose opening-balance adjustment was created before the fix.
2. Before backfill: card shows `credit 80 → 0` (backwards).
3. After calling the backfill endpoint: reload the customer view.
4. Card now shows `0 → debts 80 $` (correct direction).
5. The `Money +80 | 12kg -2 | 48kg +3` text line is **gone** from the card.
6. If the adjustment had a reason/note, it still appears in the card's subtitle line.
