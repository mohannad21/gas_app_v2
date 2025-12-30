import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import get_current_user
from .config import get_settings
from .db import init_db
from .logging_config import configure_logging
from .routers import activities, cash, company, customer_adjustments, customers, expenses, health, inventory, orders, prices, reports, systems
from .utils.time import effective_business_tz_name

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
  settings = get_settings()
  configure_logging()

  app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    version="0.1.0",
  )
  logger.info(
    "business_tz_startup requested=%s effective=%s",
    settings.business_tz,
    effective_business_tz_name(),
  )

  # Ensure database schema exists for dev setups (SQLite fallback)
  if settings.database_url.startswith("sqlite:///"):
    init_db()

  app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
  )

  # Routers
  app.include_router(health.router)
  app.include_router(customers.router)
  app.include_router(customer_adjustments.router)
  app.include_router(systems.router)
  app.include_router(orders.router)
  app.include_router(inventory.router)
  app.include_router(prices.router)
  app.include_router(reports.router)
  app.include_router(activities.router)
  app.include_router(expenses.router)
  app.include_router(cash.router)
  app.include_router(company.router)

  @app.get("/me")
  async def read_me(user_id: str = Depends(get_current_user)) -> dict[str, str]:
    return {"user_id": user_id}

  return app


app = create_app()
