from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings

settings = get_settings()

engine = create_engine(
  settings.database_url,
  echo=settings.debug and settings.sql_echo,
  future=True,
  pool_pre_ping=True,  # Checks if connection is alive before using it
  pool_size=10,        # How many permanent connections to keep
  max_overflow=20,     # How many extra connections to allow during spikes
  pool_timeout=30,     # How long to wait for a connection before failing
)


def init_db() -> None:
  """
  Initializes the database.
  Note: In production with Postgres, we usually rely on Alembic migrations.
  """
  from . import models  # noqa: F401
  SQLModel.metadata.create_all(bind=engine)


def get_session() -> Generator[Session, None, None]:
  """
  Dependency to get a database session for FastAPI routes.
  """
  with Session(engine) as session:
    yield session

