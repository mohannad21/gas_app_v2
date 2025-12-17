from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import InventoryVersion
from app.schemas import InventoryInit, InventorySnapshot

router = APIRouter(prefix="/inventory", tags=["inventory"])


def latest_snapshot(session: Session) -> Optional[InventorySnapshot]:
  rows = session.exec(
    select(InventoryVersion).order_by(InventoryVersion.effective_at.desc())
  ).all()
  if not rows:
    return None
  latest_12 = next((iv for iv in rows if iv.gas_type == "12kg"), None)
  latest_48 = next((iv for iv in rows if iv.gas_type == "48kg"), None)
  if not latest_12 and not latest_48:
    return None
  full12 = latest_12.full_count if latest_12 else 0
  empty12 = latest_12.empty_count if latest_12 else 0
  full48 = latest_48.full_count if latest_48 else 0
  empty48 = latest_48.empty_count if latest_48 else 0
  as_of_candidates = [iv.effective_at for iv in (latest_12, latest_48) if iv]
  as_of = max(as_of_candidates) if as_of_candidates else datetime.utcnow()
  reason = None
  if latest_12 and latest_48 and latest_12.reason == latest_48.reason:
    reason = latest_12.reason
  elif latest_12 and not latest_48:
    reason = latest_12.reason
  elif latest_48 and not latest_12:
    reason = latest_48.reason
  return InventorySnapshot(
    as_of=as_of,
    full12=full12,
    empty12=empty12,
    total12=full12 + empty12,
    full48=full48,
    empty48=empty48,
    total48=full48 + empty48,
    reason=reason,
  )


@router.get("/latest", response_model=Optional[InventorySnapshot])
def get_latest_inventory(session: Session = Depends(get_session)) -> Optional[InventorySnapshot]:
  return latest_snapshot(session)


@router.post("/init", response_model=InventorySnapshot, status_code=status.HTTP_201_CREATED)
def init_inventory(payload: InventoryInit, session: Session = Depends(get_session)) -> InventorySnapshot:
  now = datetime.utcnow()

  version_12 = InventoryVersion(
    gas_type="12kg",
    full_count=payload.full12,
    empty_count=payload.empty12,
    reason=payload.reason,
    event_type="init",
    effective_at=now,
    created_at=now,
  )
  version_48 = InventoryVersion(
    gas_type="48kg",
    full_count=payload.full48,
    empty_count=payload.empty48,
    reason=payload.reason,
    event_type="init",
    effective_at=now,
    created_at=now,
  )
  session.add(version_12)
  session.add(version_48)
  session.commit()

  snapshot = latest_snapshot(session)
  if not snapshot:
    raise HTTPException(status_code=500, detail="Failed to create inventory snapshot")
  return snapshot
