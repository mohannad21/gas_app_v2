from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Session, select

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

from app.db import engine
from app.models import InventoryDailySummary, InventoryVersion
from app.utils.time import business_date_from_utc


logger = logging.getLogger(__name__)


def validate_inventory_migration() -> None:
  with Session(engine) as session:
    gas_types = session.exec(select(InventoryVersion.gas_type).distinct()).all()
    if not gas_types:
      logger.info("No inventory_versions rows found; nothing to validate.")
      return

    today = business_date_from_utc(datetime.now(timezone.utc))

    for gas_type in gas_types:
      legacy = session.exec(
        select(InventoryVersion)
        .where(InventoryVersion.gas_type == gas_type)
        .order_by(InventoryVersion.effective_at.desc(), InventoryVersion.created_at.desc(), InventoryVersion.id.desc())
      ).first()
      summary = session.exec(
        select(InventoryDailySummary)
        .where(InventoryDailySummary.gas_type == gas_type)
        .where(InventoryDailySummary.business_date <= today)
        .order_by(InventoryDailySummary.business_date.desc())
      ).first()

      if not legacy and not summary:
        continue
      if not legacy or not summary:
        logger.warning(
          "Mismatch gas=%s legacy=%s summary=%s",
          gas_type,
          "missing" if not legacy else "present",
          "missing" if not summary else "present",
        )
        continue

      if legacy.full_count != summary.day_end_full or legacy.empty_count != summary.day_end_empty:
        logger.warning(
          "Inventory mismatch gas=%s legacy_full=%s legacy_empty=%s summary_full=%s summary_empty=%s",
          gas_type,
          legacy.full_count,
          legacy.empty_count,
          summary.day_end_full,
          summary.day_end_empty,
        )
      else:
        logger.info("Inventory match gas=%s full=%s empty=%s", gas_type, legacy.full_count, legacy.empty_count)


def main() -> None:
  logging.basicConfig(level=logging.INFO)
  validate_inventory_migration()


if __name__ == "__main__":
  main()
