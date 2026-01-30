from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import (
  cash,
  collections,
  company,
  customer_adjustments,
  customers,
  expenses,
  health,
  inventory,
  orders,
  prices,
  reports,
  system,
  system_types,
  systems,
)

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
  CORSMiddleware,
  allow_origins=settings.cors_origins,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(customers.router)
app.include_router(customer_adjustments.router)
app.include_router(systems.router)
app.include_router(system.router)
app.include_router(system_types.router)
app.include_router(prices.router)
app.include_router(orders.router)
app.include_router(collections.router)
app.include_router(inventory.router)
app.include_router(company.router)
app.include_router(cash.router)
app.include_router(expenses.router)
app.include_router(reports.router)
