from fastapi import APIRouter, HTTPException, status

from app.auth import create_access_token
from app.config import get_settings


router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/dev-token")
def get_dev_token() -> dict[str, str]:
  settings = get_settings()
  if not settings.debug:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
  return {"access_token": create_access_token("dev-user")}
