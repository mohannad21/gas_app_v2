from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, echo=settings.debug, future=True)


def init_db() -> None:
  # Import models so metadata is populated before create_all or Alembic autogenerate.
  from . import models  # noqa: F401
  SQLModel.metadata.create_all(bind=engine)


def get_session() -> Generator[Session, None, None]:
  with Session(engine) as session:
    yield session
