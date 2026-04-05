from typing import Optional

from sqlmodel import SQLModel


class TenantProfileOut(SQLModel):
  id: str
  name: str
  business_name: Optional[str]
  owner_name: Optional[str]
  phone: Optional[str]
  address: Optional[str]


class TenantProfileUpdate(SQLModel):
  business_name: Optional[str] = None
  owner_name: Optional[str] = None
  phone: Optional[str] = None
  address: Optional[str] = None
