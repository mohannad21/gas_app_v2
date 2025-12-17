from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.models import Activity


router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("")
def list_activities(session: Session = Depends(get_session)) -> list[Activity]:
  stmt = select(Activity).order_by(Activity.created_at.desc())
  return session.exec(stmt).all()
