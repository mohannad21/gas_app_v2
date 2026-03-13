from __future__ import annotations

import logging

from sqlalchemy import text
from sqlmodel import Session


logger = logging.getLogger(__name__)


def acquire_inventory_lock(session: Session, gas_type: str) -> None:
  """
  Acquire a transaction-scoped advisory lock for a gas type.
  Postgres-only; other engines are no-ops.
  """
  bind = session.get_bind()
  if bind is None or bind.dialect.name != "postgresql":
    return
  session.exec(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": gas_type})


def acquire_inventory_locks(session: Session, gas_types: list[str]) -> None:
  for gas_type in sorted(set(gas_types)):
    acquire_inventory_lock(session, gas_type)

