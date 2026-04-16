"""Developer-only management endpoints. Only available when DEBUG=true."""
from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.config import get_settings
from app.db import get_session
from app.models import BillingEvent, CustomerTransaction, Plan, Tenant, TenantPlanSubscription
from app.services.ledger import sum_customer_cylinders, sum_customer_money


router = APIRouter(prefix="/developer", tags=["developer"])


def _require_debug(settings=Depends(get_settings)) -> None:
  if not settings.debug:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")


_debug_dep = [Depends(_require_debug)]

_SUBSCRIPTION_STATUSES = {"active", "grace_period", "suspended", "trial", "cancelled"}


class BillingAmountRequest(BaseModel):
  amount: int
  note: Optional[str] = None
  effective_at: Optional[datetime] = None


class SubscriptionStatusRequest(BaseModel):
  status: str
  grace_period_end: Optional[date] = None


class PlanChangeRequest(BaseModel):
  plan_id: str


def _latest_subscription(session: Session, tenant_id: str) -> Optional[TenantPlanSubscription]:
  return session.exec(
    select(TenantPlanSubscription)
    .where(TenantPlanSubscription.tenant_id == tenant_id)
    .order_by(TenantPlanSubscription.started_at.desc())
  ).first()


def _require_tenant(session: Session, tenant_id: str) -> Tenant:
  tenant = session.get(Tenant, tenant_id)
  if tenant is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="tenant_not_found")
  return tenant


def _require_subscription(session: Session, tenant_id: str) -> TenantPlanSubscription:
  subscription = _latest_subscription(session, tenant_id)
  if subscription is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subscription_not_found")
  return subscription


def _outstanding_balance(session: Session, tenant_id: str) -> int:
  rows = session.exec(
    select(BillingEvent)
    .where(BillingEvent.tenant_id == tenant_id)
  ).all()
  return sum(row.amount for row in rows)


def _effective_at_or_now(value: Optional[datetime]) -> datetime:
  return value or datetime.now(timezone.utc)


@router.get("/tenants", dependencies=_debug_dep)
def list_tenants(session: Annotated[Session, Depends(get_session)]) -> list[dict[str, object]]:
  tenants = session.exec(select(Tenant).order_by(Tenant.created_at.asc())).all()
  items: list[dict[str, object]] = []
  for tenant in tenants:
    subscription = _latest_subscription(session, tenant.id)
    plan = session.get(Plan, subscription.plan_id) if subscription else None
    items.append(
      {
        "tenant_id": tenant.id,
        "name": tenant.name,
        "status": tenant.status,
        "subscription_status": subscription.status if subscription else None,
        "plan_name": plan.name if plan else None,
        "outstanding_balance": _outstanding_balance(session, tenant.id),
      }
    )
  return items


@router.post("/tenants/{tenant_id}/billing/payment", dependencies=_debug_dep)
def record_payment(
  tenant_id: str,
  payload: BillingAmountRequest,
  session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
  if payload.amount <= 0:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount_must_be_positive")

  with session.begin():
    _require_tenant(session, tenant_id)
    subscription = _require_subscription(session, tenant_id)
    event = BillingEvent(
      tenant_id=tenant_id,
      kind="payment",
      amount=payload.amount,
      note=payload.note,
      effective_at=_effective_at_or_now(payload.effective_at),
    )
    session.add(event)
    session.flush()

    if subscription.status == "grace_period" and _outstanding_balance(session, tenant_id) <= 0:
      subscription.status = "active"
      subscription.grace_period_end = None
      subscription.updated_at = datetime.now(timezone.utc)
      session.add(subscription)

  session.refresh(event)
  return {
    "id": event.id,
    "tenant_id": event.tenant_id,
    "kind": event.kind,
    "amount": event.amount,
    "note": event.note,
    "effective_at": event.effective_at,
    "created_at": event.created_at,
    "created_by": event.created_by,
  }


@router.post("/tenants/{tenant_id}/billing/charge", dependencies=_debug_dep)
def apply_charge(
  tenant_id: str,
  payload: BillingAmountRequest,
  session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
  if payload.amount <= 0:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount_must_be_positive")

  with session.begin():
    _require_tenant(session, tenant_id)
    event = BillingEvent(
      tenant_id=tenant_id,
      kind="charge",
      amount=-payload.amount,
      note=payload.note,
      effective_at=_effective_at_or_now(payload.effective_at),
    )
    session.add(event)

  session.refresh(event)
  return {
    "id": event.id,
    "tenant_id": event.tenant_id,
    "kind": event.kind,
    "amount": event.amount,
    "note": event.note,
    "effective_at": event.effective_at,
    "created_at": event.created_at,
    "created_by": event.created_by,
  }


@router.post("/tenants/{tenant_id}/billing/discount", dependencies=_debug_dep)
def apply_discount(
  tenant_id: str,
  payload: BillingAmountRequest,
  session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
  if payload.amount <= 0:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount_must_be_positive")

  with session.begin():
    _require_tenant(session, tenant_id)
    event = BillingEvent(
      tenant_id=tenant_id,
      kind="discount",
      amount=payload.amount,
      note=payload.note,
      effective_at=_effective_at_or_now(payload.effective_at),
    )
    session.add(event)

  session.refresh(event)
  return {
    "id": event.id,
    "tenant_id": event.tenant_id,
    "kind": event.kind,
    "amount": event.amount,
    "note": event.note,
    "effective_at": event.effective_at,
    "created_at": event.created_at,
    "created_by": event.created_by,
  }


@router.post("/tenants/{tenant_id}/subscription/status", dependencies=_debug_dep)
def change_subscription_status(
  tenant_id: str,
  payload: SubscriptionStatusRequest,
  session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
  if payload.status not in _SUBSCRIPTION_STATUSES:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_subscription_status")
  if payload.status == "grace_period" and payload.grace_period_end is None:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="grace_period_end_required")

  with session.begin():
    _require_tenant(session, tenant_id)
    subscription = _require_subscription(session, tenant_id)
    subscription.status = payload.status
    subscription.grace_period_end = payload.grace_period_end if payload.status == "grace_period" else None
    subscription.cancelled_at = datetime.now(timezone.utc) if payload.status == "cancelled" else None
    subscription.updated_at = datetime.now(timezone.utc)
    session.add(subscription)

  return {
    "id": subscription.id,
    "tenant_id": subscription.tenant_id,
    "plan_id": subscription.plan_id,
    "status": subscription.status,
    "started_at": subscription.started_at,
    "current_period_start": subscription.current_period_start,
    "current_period_end": subscription.current_period_end,
    "grace_period_end": subscription.grace_period_end,
    "cancelled_at": subscription.cancelled_at,
    "created_at": subscription.created_at,
    "updated_at": subscription.updated_at,
  }


@router.post("/tenants/{tenant_id}/subscription/plan", dependencies=_debug_dep)
def change_plan(
  tenant_id: str,
  payload: PlanChangeRequest,
  session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
  with session.begin():
    _require_tenant(session, tenant_id)
    subscription = _require_subscription(session, tenant_id)
    old_plan_id = subscription.plan_id
    plan = session.get(Plan, payload.plan_id)
    if plan is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="plan_not_found")

    old_plan = session.get(Plan, old_plan_id)
    subscription.plan_id = plan.id
    subscription.updated_at = datetime.now(timezone.utc)
    session.add(subscription)

    event = BillingEvent(
      tenant_id=tenant_id,
      kind="plan_change",
      amount=0,
      note=f"Plan changed from {old_plan.name if old_plan else old_plan_id} to {plan.name}",
      effective_at=datetime.now(timezone.utc),
    )
    session.add(event)

  session.refresh(subscription)
  return {
    "id": subscription.id,
    "tenant_id": subscription.tenant_id,
    "plan_id": subscription.plan_id,
    "status": subscription.status,
    "started_at": subscription.started_at,
    "current_period_start": subscription.current_period_start,
    "current_period_end": subscription.current_period_end,
    "grace_period_end": subscription.grace_period_end,
    "cancelled_at": subscription.cancelled_at,
    "created_at": subscription.created_at,
    "updated_at": subscription.updated_at,
  }


@router.get("/tenants/{tenant_id}/billing", dependencies=_debug_dep)
def get_billing_history(
  tenant_id: str,
  session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
  _require_tenant(session, tenant_id)
  events = session.exec(
    select(BillingEvent)
    .where(BillingEvent.tenant_id == tenant_id)
    .order_by(BillingEvent.effective_at.desc(), BillingEvent.created_at.desc())
  ).all()
  return {
    "events": [
      {
        "id": event.id,
        "tenant_id": event.tenant_id,
        "kind": event.kind,
        "amount": event.amount,
        "note": event.note,
        "effective_at": event.effective_at,
        "created_at": event.created_at,
        "created_by": event.created_by,
      }
      for event in events
    ],
    "outstanding_balance": sum(event.amount for event in events),
  }


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
