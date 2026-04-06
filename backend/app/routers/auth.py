import random
import string
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.auth import create_access_token, get_current_user
from app.config import DEFAULT_TENANT_ID, get_settings
from app.db import get_session
from app.models import ActivationChallenge, Session as DbSession, Tenant, User
from app.schemas import (
  ActivateRequest,
  ChangePasswordRequest,
  DeveloperCreateUserRequest,
  DeveloperCreateUserResponse,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
)
from app.utils.password import hash_password, verify_password


router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_TOKEN_EXPIRES_DAYS = 30
_OTP_EXPIRES_MINUTES = 30
_OTP_LENGTH = 6


def _generate_otp() -> str:
  return "".join(random.choices(string.digits, k=_OTP_LENGTH))


@router.get("/dev-token")
def get_dev_token() -> dict[str, str]:
  settings = get_settings()
  if not settings.debug:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
  return {"access_token": create_access_token("dev-user")}


@router.post("/developer/create-user", response_model=DeveloperCreateUserResponse)
def developer_create_user(
  payload: DeveloperCreateUserRequest,
  session: Session = Depends(get_session),
) -> DeveloperCreateUserResponse:
  settings = get_settings()
  if not settings.debug:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

  with session.begin():
    user = User(
      tenant_id=DEFAULT_TENANT_ID,
      phone=payload.phone,
    )
    session.add(user)
    session.flush()

    tenant = session.get(Tenant, DEFAULT_TENANT_ID)
    if tenant:
      tenant.name = payload.name
      tenant.owner_user_id = user.id
      session.add(tenant)

    code = _generate_otp()
    challenge = ActivationChallenge(
      user_id=user.id,
      code_hash=hash_password(code),
      expires_at=datetime.now(timezone.utc) + timedelta(minutes=_OTP_EXPIRES_MINUTES),
    )
    session.add(challenge)

  return DeveloperCreateUserResponse(user_id=user.id, activation_code=code)


@router.post("/activate", status_code=status.HTTP_200_OK)
def activate_user(
  payload: ActivateRequest,
  session: Session = Depends(get_session),
) -> dict[str, str]:
  with session.begin():
    user = session.get(User, payload.user_id)
    if not user:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_user")
    if user.is_active:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="already_active")

    challenge = session.exec(
      select(ActivationChallenge)
      .where(ActivationChallenge.user_id == payload.user_id)
      .where(ActivationChallenge.used_at == None)  # noqa: E711
      .order_by(ActivationChallenge.created_at.desc())
    ).first()

    if not challenge:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_challenge")
    if datetime.now(timezone.utc) > challenge.expires_at:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code_expired")
    if not verify_password(payload.code, challenge.code_hash):
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_code")

    challenge.used_at = datetime.now(timezone.utc)
    user.password_hash = hash_password(payload.password)
    user.is_active = True
    session.add(challenge)
    session.add(user)

  return {"status": "activated"}


@router.post("/login", response_model=LoginResponse)
def login(
  payload: LoginRequest,
  request: Request,
  session: Session = Depends(get_session),
) -> LoginResponse:
  with session.begin():
    user = session.exec(
      select(User).where(User.phone == payload.phone)
    ).first()

    if not user or not user.password_hash:
      raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    if not user.is_active:
      raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="account_inactive")
    if not verify_password(payload.password, user.password_hash):
      raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

    db_session = DbSession(
      user_id=user.id,
      expires_at=datetime.now(timezone.utc) + timedelta(days=_REFRESH_TOKEN_EXPIRES_DAYS),
      user_agent=request.headers.get("user-agent"),
    )
    session.add(db_session)
    session.flush()

    access_token = create_access_token(subject=user.id)

  return LoginResponse(
    access_token=access_token,
    refresh_token=db_session.id,
    must_change_password=user.must_change_password,
  )


@router.post("/refresh", response_model=RefreshResponse)
def refresh_token(
  payload: RefreshRequest,
  session: Session = Depends(get_session),
) -> RefreshResponse:
  db_session = session.get(DbSession, payload.refresh_token)
  if not db_session:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_refresh_token")
  if db_session.revoked_at is not None:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session_revoked")
  if datetime.now(timezone.utc) > db_session.expires_at:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session_expired")

  access_token = create_access_token(subject=db_session.user_id)
  return RefreshResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
  payload: RefreshRequest,
  session: Session = Depends(get_session),
) -> None:
  with session.begin():
    db_session = session.get(DbSession, payload.refresh_token)
    if db_session and db_session.revoked_at is None:
      db_session.revoked_at = datetime.now(timezone.utc)
      session.add(db_session)


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
  payload: ChangePasswordRequest,
  user_id: Annotated[str, Depends(get_current_user)],
  session: Session = Depends(get_session),
) -> dict[str, str]:
  with session.begin():
    user = session.get(User, user_id)
    if not user or not user.is_active:
      raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    if not user.password_hash or not verify_password(payload.current_password, user.password_hash):
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="wrong_password")

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)

  return {"status": "password_changed"}
