from __future__ import annotations

from sqlmodel import SQLModel


class DeveloperCreateUserRequest(SQLModel):
  phone: str
  name: str  # stored on the tenant, not the user


class DeveloperCreateUserResponse(SQLModel):
  user_id: str
  activation_code: str  # returned directly - debug mode only


class ActivateRequest(SQLModel):
  user_id: str
  code: str
  password: str


class LoginRequest(SQLModel):
  phone: str
  password: str


class LoginResponse(SQLModel):
  access_token: str
  refresh_token: str
  token_type: str = "bearer"


class RefreshRequest(SQLModel):
  refresh_token: str


class RefreshResponse(SQLModel):
  access_token: str
  token_type: str = "bearer"


class ChangePasswordRequest(SQLModel):
  current_password: str
  new_password: str
