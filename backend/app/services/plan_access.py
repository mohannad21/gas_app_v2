"""Plan access enforcement."""
from datetime import date
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.auth import get_tenant_id
from app.db import get_session
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
    if is_write:
      raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail="account_grace_period",
      )
    if sub.grace_period_end and date.today() > sub.grace_period_end:
      if is_write:
        raise HTTPException(
          status_code=status.HTTP_402_PAYMENT_REQUIRED,
          detail="grace_period_expired",
        )

  return tenant_id
