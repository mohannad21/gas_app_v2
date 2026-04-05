"""Worker invite and management endpoints."""
from __future__ import annotations

import random
import string
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.auth import get_current_user, get_tenant_id, require_permission
from app.config import get_settings
from app.db import get_session
from app.models import Invite, PlanEntitlement, Role, TenantMembership, TenantPlanOverride, TenantPlanSubscription, User
from app.schemas import PendingInviteOut, WorkerInviteCreate, WorkerInviteOut, WorkerMemberOut
from app.utils.password import hash_password


router = APIRouter(prefix="/workers", tags=["workers"])

ROLE_OWNER_ID = "00000000-0000-0000-role-000000000001"
_OTP_LENGTH = 6
_INVITE_EXPIRES_HOURS = 48


def _generate_otp() -> str:
  return "".join(random.choices(string.digits, k=_OTP_LENGTH))


def _active_subscription(session: Session, tenant_id: str) -> TenantPlanSubscription | None:
  return session.exec(
    select(TenantPlanSubscription)
    .where(TenantPlanSubscription.tenant_id == tenant_id)
    .where(TenantPlanSubscription.status != "cancelled")
    .order_by(TenantPlanSubscription.started_at.desc())
  ).first()


def _max_workers_limit(session: Session, tenant_id: str) -> int:
  override = session.exec(
    select(TenantPlanOverride)
    .where(TenantPlanOverride.tenant_id == tenant_id)
    .where(TenantPlanOverride.key == "max_workers")
    .order_by(TenantPlanOverride.created_at.desc())
  ).first()
  if override:
    try:
      return int(override.value)
    except ValueError as exc:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_max_workers") from exc

  subscription = _active_subscription(session, tenant_id)
  if subscription is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="subscription_not_found")

  entitlement = session.exec(
    select(PlanEntitlement)
    .where(PlanEntitlement.plan_id == subscription.plan_id)
    .where(PlanEntitlement.key == "max_workers")
    .order_by(PlanEntitlement.created_at.desc())
  ).first()
  if entitlement is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="max_workers_not_found")
  try:
    return int(entitlement.value)
  except ValueError as exc:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_max_workers") from exc


def _reserved_worker_seats(session: Session, tenant_id: str) -> int:
  now = datetime.now(timezone.utc)
  active_workers = session.exec(
    select(func.count(TenantMembership.id))
    .where(TenantMembership.tenant_id == tenant_id)
    .where(TenantMembership.is_active == True)  # noqa: E712
    .where(TenantMembership.role_id != ROLE_OWNER_ID)
  ).one()
  pending_invites = session.exec(
    select(func.count(Invite.id))
    .where(Invite.tenant_id == tenant_id)
    .where(Invite.status == "pending")
    .where(Invite.expires_at > now)
  ).one()
  return int(active_workers or 0) + int(pending_invites or 0)


def _assignable_role(session: Session, role_id: str) -> Role:
  role = session.get(Role, role_id)
  if role is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="role_not_found")
  if role.name == "distributor_owner" or role.id == ROLE_OWNER_ID:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_role")
  return role


@router.get("", response_model=list[WorkerMemberOut])
def list_workers(
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> list[WorkerMemberOut]:
  rows = session.exec(
    select(TenantMembership, User.phone, Role.name)
    .join(User, User.id == TenantMembership.user_id)
    .join(Role, Role.id == TenantMembership.role_id)
    .where(TenantMembership.tenant_id == tenant_id)
    .where(TenantMembership.is_active == True)  # noqa: E712
    .order_by(TenantMembership.joined_at.asc(), TenantMembership.created_at.asc())
  ).all()
  return [
    WorkerMemberOut(
      membership_id=membership.id,
      user_id=membership.user_id,
      phone=phone,
      role_name=role_name,
      joined_at=membership.joined_at,
    )
    for membership, phone, role_name in rows
  ]


@router.post(
  "/invite",
  response_model=WorkerInviteOut,
  response_model_exclude_none=True,
  status_code=status.HTTP_201_CREATED,
  dependencies=[Depends(require_permission("workers:manage"))],
)
def create_worker_invite(
  payload: WorkerInviteCreate,
  user_id: Annotated[str, Depends(get_current_user)],
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> WorkerInviteOut:
  settings = get_settings()
  otp = _generate_otp()
  expires_at = datetime.now(timezone.utc) + timedelta(hours=_INVITE_EXPIRES_HOURS)

  role = _assignable_role(session, payload.role_id)
  if _reserved_worker_seats(session, tenant_id) >= _max_workers_limit(session, tenant_id):
    raise HTTPException(
      status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
      detail="worker_limit_reached",
    )

  invite = Invite(
    tenant_id=tenant_id,
    phone=payload.phone,
    role_id=role.id,
    code_hash=hash_password(otp),
    status="pending",
    expires_at=expires_at,
    created_by=user_id,
  )
  session.add(invite)
  session.commit()
  session.refresh(invite)

  if not settings.debug:
    # TODO: send WhatsApp OTP
    pass

  return WorkerInviteOut(
    invite_id=invite.id,
    phone=invite.phone,
    role_name=role.name,
    expires_at=invite.expires_at,
    activation_code=otp if settings.debug else None,
  )


@router.get("/invites", response_model=list[PendingInviteOut])
def list_pending_invites(
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> list[PendingInviteOut]:
  now = datetime.now(timezone.utc)
  rows = session.exec(
    select(Invite, Role.name)
    .join(Role, Role.id == Invite.role_id)
    .where(Invite.tenant_id == tenant_id)
    .where(Invite.status == "pending")
    .where(Invite.expires_at > now)
    .order_by(Invite.created_at.desc())
  ).all()
  return [
    PendingInviteOut(
      invite_id=invite.id,
      phone=invite.phone,
      role_name=role_name,
      created_at=invite.created_at,
      expires_at=invite.expires_at,
    )
    for invite, role_name in rows
  ]


@router.delete(
  "/invites/{invite_id}",
  status_code=status.HTTP_204_NO_CONTENT,
  response_class=Response,
  dependencies=[Depends(require_permission("workers:manage"))],
)
def revoke_invite(
  invite_id: str,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> Response:
  invite = session.get(Invite, invite_id)
  if invite is None or invite.tenant_id != tenant_id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invite_not_found")
  if invite.status == "pending":
    invite.status = "cancelled"
    session.add(invite)
    session.commit()
  return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
  "/{membership_id}",
  status_code=status.HTTP_204_NO_CONTENT,
  response_class=Response,
  dependencies=[Depends(require_permission("workers:manage"))],
)
def revoke_worker_access(
  membership_id: str,
  session: Session = Depends(get_session),
  tenant_id: Annotated[str, Depends(get_tenant_id)] = "",
) -> Response:
  membership = session.get(TenantMembership, membership_id)
  if membership is None or membership.tenant_id != tenant_id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="membership_not_found")
  if membership.role_id == ROLE_OWNER_ID:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_role")
  if membership.is_active:
    membership.is_active = False
    membership.revoked_at = datetime.now(timezone.utc)
    session.add(membership)
    session.commit()
  return Response(status_code=status.HTTP_204_NO_CONTENT)
