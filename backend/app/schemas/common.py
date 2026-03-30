from __future__ import annotations

from typing import Literal, Optional
from uuid import uuid4

GasType = Literal["12kg", "48kg"]
OrderMode = Literal["replacement", "sell_iron", "buy_iron"]
InventoryAdjustReason = Literal["count_correction", "shrinkage", "damage"]
TransferDirection = Literal["wallet_to_bank", "bank_to_wallet"]
MAX_LEDGER_INT = 2_147_483_647


def new_id(prefix: str = "") -> str:
  return f"{prefix}{uuid4()}"


def _non_negative(value: Optional[int], field_name: str) -> Optional[int]:
  if value is None:
    return value
  if value < 0:
    raise ValueError(f"{field_name}_must_be_non_negative")
  if value > MAX_LEDGER_INT:
    raise ValueError(f"{field_name}_must_be_within_ledger_range")
  return value
