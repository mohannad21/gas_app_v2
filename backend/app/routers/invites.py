"""Open invite activation endpoints."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.auth import create_access_token
from app.db import get_session
from app.models import Invite, Role, Session as DbSession, TenantMembership, User
from app.schemas import InviteActivateRequest, LoginResponse
from app.utils.password import hash_password, verify_password


router = APIRouter(prefix="/invites", tags=["invites"])

ROLE_OWNER_ID = "00000000-0000-0000-role-000000000001"
_REFRESH_TOKEN_EXPIRES_DAYS = 30


def _membership_for_user(session: Session, tenant_id: str, user_id: str) -> TenantMembership | None:
  return session.exec(
    select(TenantMembership)
    .where(TenantMembership.tenant_id == tenant_id)
    .where(TenantMembership.user_id == user_id)
    .order_by(TenantMembership.created_at.desc())
  ).first()


@router.post("/activate", response_model=LoginResponse)
def activate_invite(
  payload: InviteActivateRequest,
  request: Request,
  session: Session = Depends(get_session),
) -> LoginResponse:
  now = datetime.now(timezone.utc)
  with session.begin():
    invite = session.get(Invite, payload.invite_id)
    if invite is None or invite.status != "pending":
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_invite")
    if invite.expires_at <= now:
      invite.status = "expired"
      session.add(invite)
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code_expired")
    if invite.role_id == ROLE_OWNER_ID:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_role")
    if not verify_password(payload.code, invite.code_hash):
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_code")

    role = session.get(Role, invite.role_id)
    if role is None or role.id == ROLE_OWNER_ID or role.name == "distributor_owner":
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_role")

    user = session.exec(select(User).where(User.phone == invite.phone)).first()
    if user and user.tenant_id and user.tenant_id != invite.tenant_id:
      raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="user_belongs_to_other_tenant")

    password_hash = hash_password(payload.password)
    if user is None:
      user = User(
        tenant_id=invite.tenant_id,
        phone=invite.phone,
        password_hash=password_hash,
        is_active=True,
      )
      session.add(user)
      session.flush()
    else:
      user.tenant_id = invite.tenant_id
      user.password_hash = password_hash
      user.is_active = True
      user.must_change_password = False
      user.updated_at = now
      session.add(user)
      session.flush()

    membership = _membership_for_user(session, invite.tenant_id, user.id)
    if membership is None:
      membership = TenantMembership(
        tenant_id=invite.tenant_id,
        user_id=user.id,
        role_id=invite.role_id,
        is_active=True,
      )
      session.add(membership)
    else:
      membership.role_id = invite.role_id
      membership.is_active = True
      membership.revoked_at = None
      session.add(membership)

    invite.status = "accepted"
    invite.accepted_at = now
    session.add(invite)

    db_session = DbSession(
      user_id=user.id,
      expires_at=now + timedelta(days=_REFRESH_TOKEN_EXPIRES_DAYS),
      user_agent=request.headers.get("user-agent"),
    )
    session.add(db_session)
    session.flush()

    access_token = create_access_token(subject=user.id)

  return LoginResponse(access_token=access_token, refresh_token=db_session.id)
