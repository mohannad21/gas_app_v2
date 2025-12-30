from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.db import engine
from app.models import InventoryDelta, InventoryVersion
from app.services.inventory import recompute_daily_summaries
from app.utils.time import business_date_from_utc


logger = logging.getLogger(__name__)


def backfill_inventory_deltas() -> None:
  with Session(engine) as session:
    gas_types = session.exec(select(InventoryVersion.gas_type).distinct()).all()
    if not gas_types:
      logger.info("No inventory_versions rows found; nothing to backfill.")
      return

    for gas_type in gas_types:
      versions = session.exec(
        select(InventoryVersion)
        .where(InventoryVersion.gas_type == gas_type)
        .order_by(InventoryVersion.effective_at, InventoryVersion.created_at, InventoryVersion.id)
      ).all()
      if not versions:
        continue

      existing = session.exec(
        select(InventoryDelta.source_type, InventoryDelta.source_id)
        .where(InventoryDelta.gas_type == gas_type)
        .where(InventoryDelta.source_id.is_not(None))
      ).all()
      existing_keys = {(row[0], row[1]) for row in existing}

      prev: InventoryVersion | None = None
      for idx, version in enumerate(versions):
        if idx == 0:
          source_type = "init"
          delta_full = version.full_count
          delta_empty = version.empty_count
        else:
          source_type = "legacy"
          delta_full = version.full_count - (prev.full_count if prev else 0)
          delta_empty = version.empty_count - (prev.empty_count if prev else 0)
        source_id = version.id
        key = (source_type, source_id)
        if source_id and key in existing_keys:
          prev = version
          continue
        session.add(
          InventoryDelta(
            gas_type=gas_type,
            delta_full=delta_full,
            delta_empty=delta_empty,
            effective_at=version.effective_at,
            source_type=source_type,
            source_id=source_id,
            reason=version.reason,
            created_at=version.created_at,
            created_by=version.created_by,
          )
        )
        if source_id:
          existing_keys.add(key)
        prev = version

      session.commit()
      start_date = business_date_from_utc(versions[0].effective_at)
      end_date = business_date_from_utc(datetime.now(timezone.utc))
      recompute_daily_summaries(
        session,
        gas_type,
        start_date,
        end_date,
        allow_negative=True,
      )
      session.commit()
      logger.info("Backfilled inventory_deltas for gas=%s", gas_type)


def main() -> None:
  logging.basicConfig(level=logging.INFO)
  backfill_inventory_deltas()


if __name__ == "__main__":
  main()
