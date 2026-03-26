from __future__ import annotations

import logging

from sqlalchemy import text
from sqlmodel import Session


logger = logging.getLogger(__name__)


def acquire_advisory_lock(session: Session, key: str) -> None:
  """
  Acquire a transaction-scoped advisory lock.
  Postgres-only; other engines are no-ops.
  """
  bind = session.get_bind()
  if bind is None or bind.dialect.name != "postgresql":
    return
  execute = getattr(session, "execute", None)
  if callable(execute):
    execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": key})
    return
  session.exec(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": key})


def acquire_inventory_lock(session: Session, gas_type: str) -> None:
  """
  Acquire a transaction-scoped advisory lock for a gas type.
  Postgres-only; other engines are no-ops.
  """
  acquire_advisory_lock(session, f"inventory:{gas_type}")


def acquire_inventory_locks(session: Session, gas_types: list[str]) -> None:
  for gas_type in sorted(set(gas_types)):
    acquire_inventory_lock(session, gas_type)


def acquire_customer_lock(session: Session, customer_id: str) -> None:
  acquire_advisory_lock(session, f"customer:{customer_id}")


def acquire_customer_locks(session: Session, customer_ids: list[str]) -> None:
  for customer_id in sorted({customer_id for customer_id in customer_ids if customer_id}):
    acquire_customer_lock(session, customer_id)


def acquire_company_lock(session: Session) -> None:
  acquire_advisory_lock(session, "company")

