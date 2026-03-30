from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel

from .common import GasType


class PriceCreate(SQLModel):
  gas_type: GasType
  selling_price: int
  buying_price: int = 0
  selling_iron_price: int = 0
  buying_iron_price: int = 0
  effective_from: Optional[datetime] = None


class PriceOut(SQLModel):
  id: str
  gas_type: GasType
  selling_price: int
  buying_price: int
  selling_iron_price: int
  buying_iron_price: int
  effective_from: datetime
  created_at: datetime
