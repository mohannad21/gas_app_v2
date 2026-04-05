from datetime import datetime

from sqlmodel import SQLModel


class ExpenseCategoryOut(SQLModel):
  id: str
  name: str
  is_active: bool
  created_at: datetime


class ExpenseCategoryCreate(SQLModel):
  name: str


class ExpenseCategoryToggle(SQLModel):
  is_active: bool
