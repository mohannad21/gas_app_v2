from datetime import date, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_tenant_id
from app.db import get_session
from app.models import BillingEvent, Plan, TenantPlanSubscription


router = APIRouter(prefix="/tenant", tags=["tenant"])


class TenantBillingEventOut(BaseModel):
  kind: str
  amount: int
  note: Optional[str] = None
  effective_at: datetime


class TenantBillingStatusOut(BaseModel):
  plan_name: str
  subscription_status: str
  current_period_end: Optional[date] = None
  grace_period_end: Optional[date] = None
  outstanding_balance: int
  recent_events: list[TenantBillingEventOut]


@router.get("/billing/status", response_model=TenantBillingStatusOut)
def get_tenant_billing_status(
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> TenantBillingStatusOut:
  subscription = session.exec(
    select(TenantPlanSubscription)
    .where(TenantPlanSubscription.tenant_id == tenant_id)
    .order_by(TenantPlanSubscription.started_at.desc())
  ).first()
  if subscription is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subscription_not_found")

  plan = session.get(Plan, subscription.plan_id)
  if plan is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="plan_not_found")

  recent_events = session.exec(
    select(BillingEvent)
    .where(BillingEvent.tenant_id == tenant_id)
    .order_by(BillingEvent.effective_at.desc(), BillingEvent.created_at.desc())
    .limit(10)
  ).all()
  outstanding_balance = sum(
    event.amount
    for event in session.exec(select(BillingEvent).where(BillingEvent.tenant_id == tenant_id)).all()
  )

  return TenantBillingStatusOut(
    plan_name=plan.name,
    subscription_status=subscription.status,
    current_period_end=subscription.current_period_end,
    grace_period_end=subscription.grace_period_end,
    outstanding_balance=outstanding_balance,
    recent_events=[
      TenantBillingEventOut(
        kind=event.kind,
        amount=event.amount,
        note=event.note,
        effective_at=event.effective_at,
      )
      for event in recent_events
    ],
  )
