from datetime import datetime, timedelta
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError

from .config import get_settings


security = HTTPBearer(auto_error=False)


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
  settings = get_settings()
  expire = datetime.utcnow() + timedelta(minutes=expires_minutes or settings.access_token_expires_minutes)
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
