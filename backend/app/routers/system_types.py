from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import SystemTypeOption
from app.schemas import SystemTypeOptionCreate, SystemTypeOptionOut, SystemTypeOptionUpdate

router = APIRouter(prefix="/system/types", tags=["system-types"])


@router.get("", response_model=list[SystemTypeOptionOut])
def list_system_types(session: Session = Depends(get_session)) -> list[SystemTypeOptionOut]:
  rows = session.exec(select(SystemTypeOption).order_by(SystemTypeOption.created_at.desc())).all()
  return [
    SystemTypeOptionOut(
      id=row.id,
      name=row.name,
      is_active=row.is_active,
      created_at=row.created_at,
    )
    for row in rows
  ]


@router.post("", response_model=SystemTypeOptionOut, status_code=status.HTTP_201_CREATED)
def create_system_type(payload: SystemTypeOptionCreate, session: Session = Depends(get_session)) -> SystemTypeOptionOut:
  name = payload.name.strip()
  if not name:
    raise HTTPException(status_code=400, detail="name_required")
  existing = session.exec(select(SystemTypeOption).where(SystemTypeOption.name == name)).first()
  if existing:
    raise HTTPException(status_code=409, detail="system_type_exists")
  row = SystemTypeOption(name=name, created_at=datetime.now(timezone.utc))
  session.add(row)
  session.commit()
  session.refresh(row)
  return SystemTypeOptionOut(id=row.id, name=row.name, is_active=row.is_active, created_at=row.created_at)


@router.put("/{type_id}", response_model=SystemTypeOptionOut)
def update_system_type(
  type_id: str,
  payload: SystemTypeOptionUpdate,
  session: Session = Depends(get_session),
) -> SystemTypeOptionOut:
  row = session.get(SystemTypeOption, type_id)
  if not row:
    raise HTTPException(status_code=404, detail="system_type_not_found")
  data = payload.model_dump(exclude_unset=True)
  if "name" in data:
    name = data["name"].strip()
    if not name:
      raise HTTPException(status_code=400, detail="name_required")
    existing = session.exec(
      select(SystemTypeOption).where(SystemTypeOption.name == name, SystemTypeOption.id != type_id)
    ).first()
    if existing:
      raise HTTPException(status_code=409, detail="system_type_exists")
    data["name"] = name
  for field, value in data.items():
    setattr(row, field, value)
  session.add(row)
  session.commit()
  session.refresh(row)
  return SystemTypeOptionOut(id=row.id, name=row.name, is_active=row.is_active, created_at=row.created_at)

