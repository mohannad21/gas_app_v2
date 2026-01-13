from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import CashDelta, PriceSetting, SystemSettings
from app.schemas import SystemInitialize, SystemSettingsOut, new_id
from app.services.cash import add_cash_delta, recompute_cash_summaries
from app.services.company import add_company_delta
from app.services.inventory import add_inventory_delta, recompute_daily_summaries
from app.utils.time import business_date_from_utc, business_date_start_utc

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/settings", response_model=SystemSettingsOut)
def get_system_settings(session: Session = Depends(get_session)) -> SystemSettings:
  settings = session.get(SystemSettings, "system")
  if not settings:
    settings = SystemSettings(id="system", is_initialized=False, created_at=datetime.now(timezone.utc))
    session.add(settings)
    session.commit()
    session.refresh(settings)
  return settings


@router.post("/initialize", response_model=SystemSettingsOut, status_code=status.HTTP_201_CREATED)
def initialize_system(payload: SystemInitialize, session: Session = Depends(get_session)) -> SystemSettings:
  settings = session.get(SystemSettings, "system")
  if settings and settings.is_initialized:
    raise HTTPException(status_code=400, detail="system_already_initialized")
  if not settings:
    settings = SystemSettings(id="system", is_initialized=False, created_at=datetime.now(timezone.utc))

  now = datetime.now(timezone.utc)
  day = business_date_from_utc(now)
  day_start = business_date_start_utc(day)

  existing_cash = session.exec(
    select(CashDelta)
    .where(CashDelta.source_type == "cash_init")
    .where(CashDelta.is_deleted == False)  # noqa: E712
    .where(CashDelta.effective_at >= day_start)
    .where(CashDelta.effective_at < day_start + timedelta(days=1))
  ).first()
  if existing_cash:
    raise HTTPException(status_code=400, detail="cash_init_exists")

  prices = [
    PriceSetting(
      id=new_id("p"),
      gas_type="12kg",
      customer_type="any",
      selling_price=payload.sell_price_12,
      buying_price=payload.buy_price_12,
      effective_from=now,
      created_at=now,
    ),
    PriceSetting(
      id=new_id("p"),
      gas_type="48kg",
      customer_type="any",
      selling_price=payload.sell_price_48,
      buying_price=payload.buy_price_48,
      effective_from=now,
      created_at=now,
    ),
  ]
  for setting in prices:
    session.add(setting)

  add_inventory_delta(
    session,
    gas_type="12kg",
    delta_full=payload.full_12,
    delta_empty=payload.empty_12,
    effective_at=day_start,
    source_type="init",
    reason="system_initialize",
  )
  add_inventory_delta(
    session,
    gas_type="48kg",
    delta_full=payload.full_48,
    delta_empty=payload.empty_48,
    effective_at=day_start,
    source_type="init",
    reason="system_initialize",
  )

  if payload.company_payable_money:
    add_company_delta(
      session,
      effective_at=day_start,
      source_type="init_balance",
      source_id=None,
      delta_payable=payload.company_payable_money,
      reason="system_initialize",
    )

  if payload.company_full_12kg:
    add_company_delta(
      session,
      effective_at=day_start,
      source_type="init_credit",
      source_id=None,
      delta_payable=0,
      delta_12kg=-payload.company_full_12kg,
      reason="system_initialize",
    )
  if payload.company_full_48kg:
    add_company_delta(
      session,
      effective_at=day_start,
      source_type="init_credit",
      source_id=None,
      delta_payable=0,
      delta_48kg=-payload.company_full_48kg,
      reason="system_initialize",
    )
  if payload.company_empty_12kg:
    add_company_delta(
      session,
      effective_at=day_start,
      source_type="init_return",
      source_id=None,
      delta_payable=0,
      delta_12kg=payload.company_empty_12kg,
      reason="system_initialize",
    )
  if payload.company_empty_48kg:
    add_company_delta(
      session,
      effective_at=day_start,
      source_type="init_return",
      source_id=None,
      delta_payable=0,
      delta_48kg=payload.company_empty_48kg,
      reason="system_initialize",
    )

  add_cash_delta(
    session,
    effective_at=day_start,
    source_type="cash_init",
    source_id=None,
    delta_cash=payload.cash_start,
    reason="system_initialize",
  )
  recompute_cash_summaries(session, day, business_date_from_utc(now))

  end_date = business_date_from_utc(now)
  recompute_daily_summaries(session, "12kg", day, end_date, allow_negative=True)
  recompute_daily_summaries(session, "48kg", day, end_date, allow_negative=True)

  settings.is_initialized = True
  settings.updated_at = now
  session.add(settings)
  session.commit()
  session.refresh(settings)
  return settings
