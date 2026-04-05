from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from sqlmodel import Session, select

from .config import get_settings
from .db import get_session


security = HTTPBearer(auto_error=False)


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
  settings = get_settings()
  expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes or settings.access_token_expires_minutes)
  to_encode = {"sub": subject, "exp": expire}
  return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)]) -> str:
  """
  Minimal auth stub: validates JWT and returns user id (sub).
  Raises 401 if token missing/invalid.
  """
  if creds is None:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
  settings = get_settings()
  token = creds.credentials
  try:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
  except JWTError:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
  sub = payload.get("sub")
  if not sub:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
  return sub


def get_optional_user(
  creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)]
) -> Optional[str]:
  """
  Returns user id if a valid JWT is provided, otherwise None.
  Raises 401 if a token is provided but invalid.
  """
  if creds is None:
    return None
  settings = get_settings()
  token = creds.credentials
  try:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
  except JWTError:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
  sub = payload.get("sub")
  if not sub:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
  return sub


def get_tenant_id(
  user_id: Annotated[str, Depends(get_current_user)],
  session: Annotated[Session, Depends(get_session)],
) -> str:
  from app.models import User
  user = session.get(User, user_id)
  if not user or not user.tenant_id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="tenant_not_found")
  return user.tenant_id


def get_user_permissions(
  user_id: Annotated[str, Depends(get_current_user)],
  session: Annotated[Session, Depends(get_session)],
) -> set[str]:
  """
  Returns the set of permission codes for the current user.
  If the user has no membership (e.g. developer test user), returns an empty set.
  """
  from app.models import TenantMembership, RolePermission
  membership = session.exec(
    select(TenantMembership)
    .where(TenantMembership.user_id == user_id)
    .where(TenantMembership.is_active == True)  # noqa: E712
  ).first()
  if not membership:
    return set()
  perms = session.exec(
    select(RolePermission.permission_code)
    .where(RolePermission.role_id == membership.role_id)
  ).all()
  return set(perms)


def require_permission(code: str):
  """
  Returns a FastAPI dependency that raises 403 if the user lacks the given permission.

  Usage:
      @router.delete("/{id}", dependencies=[Depends(require_permission("orders:write"))])
      def delete_order(...):
          ...
  """
  def _check(perms: Annotated[set[str], Depends(get_user_permissions)]) -> None:
    if code not in perms:
      raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="permission_denied",
      )
  return _check

