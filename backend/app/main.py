from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import get_current_user
from .config import get_settings
from .services.plan_access import require_write_access
from .routers import (
  auth,
  cash,
  collections,
  company,
  customer_adjustments,
  customers,
  developer,
  expenses,
  health,
  inventory,
  orders,
  prices,
  reports,
  tenant,
  system_global,
  system_type_options,
  systems,
)

settings = get_settings()
protected_route_dependencies = [Depends(get_current_user), Depends(require_write_access)]

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
  CORSMiddleware,
  allow_origins=settings.cors_origins,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(developer.router)
app.include_router(customers.router, dependencies=protected_route_dependencies)
app.include_router(customer_adjustments.router, dependencies=protected_route_dependencies)
app.include_router(systems.router, dependencies=protected_route_dependencies)
app.include_router(system_global.router, dependencies=protected_route_dependencies)
app.include_router(system_type_options.router, dependencies=protected_route_dependencies)
app.include_router(prices.router, dependencies=protected_route_dependencies)
app.include_router(orders.router, dependencies=protected_route_dependencies)
app.include_router(collections.router, dependencies=protected_route_dependencies)
app.include_router(inventory.router, dependencies=protected_route_dependencies)
app.include_router(company.router, dependencies=protected_route_dependencies)
app.include_router(cash.router, dependencies=protected_route_dependencies)
app.include_router(expenses.router, dependencies=protected_route_dependencies)
app.include_router(tenant.router, dependencies=protected_route_dependencies)
app.include_router(reports.router, dependencies=protected_route_dependencies)

