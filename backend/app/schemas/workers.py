from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel


class WorkerMemberOut(SQLModel):
  membership_id: str
  user_id: str
  phone: Optional[str] = None
  role_name: str
  joined_at: datetime


class WorkerInviteCreate(SQLModel):
  phone: str
  role_id: str


class WorkerInviteOut(SQLModel):
  invite_id: str
  phone: str
  role_name: str
  expires_at: datetime
  activation_code: Optional[str] = None


class PendingInviteOut(SQLModel):
  invite_id: str
  phone: str
  role_name: str
  created_at: datetime
  expires_at: datetime


class InviteActivateRequest(SQLModel):
  invite_id: str
  code: str
  password: str
