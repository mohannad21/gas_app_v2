from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import LedgerEntry, PriceCatalog, SystemSettings
from app.schemas import SystemInitialize, SystemSettingsOut
from app.services.posting import derive_day

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/settings", response_model=SystemSettingsOut)
def get_system_settings(session: Session = Depends(get_session)) -> SystemSettingsOut:
  settings = session.get(SystemSettings, "system")
  if not settings:
    settings = SystemSettings(id="system", is_setup_completed=False, created_at=datetime.now(timezone.utc))
    session.add(settings)
    session.commit()
    session.refresh(settings)
  return SystemSettingsOut(
    id=settings.id,
    is_setup_completed=settings.is_setup_completed,
    currency_code=settings.currency_code,
    money_decimals=settings.money_decimals,
    created_at=settings.created_at,
  )


@router.post("/initialize", response_model=SystemSettingsOut, status_code=status.HTTP_201_CREATED)
def initialize_system(payload: SystemInitialize, session: Session = Depends(get_session)) -> SystemSettingsOut:
  settings = session.get(SystemSettings, "system")
  if settings and settings.is_setup_completed:
    raise HTTPException(status_code=400, detail="system_already_initialized")
  if not settings:
    settings = SystemSettings(id="system", is_setup_completed=False, created_at=datetime.now(timezone.utc))

  now = datetime.now(timezone.utc)
  day = derive_day(now)

  # Seed price catalog
  prices = [
    PriceCatalog(
      gas_type="12kg",
      sell_price=payload.sell_price_12,
      buy_price=payload.buy_price_12,
      effective_from=now,
      created_at=now,
    ),
    PriceCatalog(
      gas_type="48kg",
      sell_price=payload.sell_price_48,
      buy_price=payload.buy_price_48,
      effective_from=now,
      created_at=now,
    ),
  ]
  for setting in prices:
    session.add(setting)

  # Opening balances in ledger
  source_id = "system_init"
  entries = []
  def add_entry(account: str, amount: int, gas_type: str | None = None, state: str | None = None, unit: str = "money"):
    if amount == 0:
      return
    entries.append(
      LedgerEntry(
        source_type="system_init",
        source_id=source_id,
        happened_at=now,
        day=day,
        account=account,
        gas_type=gas_type,
        state=state,
        unit=unit,
        amount=amount,
      )
    )

  add_entry("inv", payload.full_12, gas_type="12kg", state="full", unit="count")
  add_entry("inv", payload.empty_12, gas_type="12kg", state="empty", unit="count")
  add_entry("inv", payload.full_48, gas_type="48kg", state="full", unit="count")
  add_entry("inv", payload.empty_48, gas_type="48kg", state="empty", unit="count")
  add_entry("cash", payload.cash_start, unit="money")
  add_entry("company_money_debts", payload.company_payable_money, unit="money")

  net_company_12 = payload.company_full_12kg - payload.company_empty_12kg
  net_company_48 = payload.company_full_48kg - payload.company_empty_48kg
  add_entry("company_cylinders_debts", net_company_12, gas_type="12kg", unit="count")
  add_entry("company_cylinders_debts", net_company_48, gas_type="48kg", unit="count")

  for entry in entries:
    session.add(entry)

  settings.is_setup_completed = True
  if payload.currency_code:
    settings.currency_code = payload.currency_code
  if payload.money_decimals is not None:
    settings.money_decimals = payload.money_decimals
  session.add(settings)
  session.commit()
  session.refresh(settings)

  return SystemSettingsOut(
    id=settings.id,
    is_setup_completed=settings.is_setup_completed,
    currency_code=settings.currency_code,
    money_decimals=settings.money_decimals,
    created_at=settings.created_at,
  )
