from typing import Optional

from sqlmodel import Session

from .models import Activity
from .schemas import new_id


def add_activity(
  session: Session,
  entity_type: str,
  action: str,
  description: str,
  entity_id: Optional[str] = None,
  metadata: Optional[str] = None,
) -> None:
  session.add(
    Activity(
      id=new_id("a"),
      entity_type=entity_type,
      entity_id=entity_id,
      action=action,
      description=description,
      metadata_=metadata,
    )
  )
