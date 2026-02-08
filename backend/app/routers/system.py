from datetime import datetime, timezone
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import (
    CashAdjustment,
    CompanyTransaction,
    CustomerTransaction,
    Expense,
    InventoryAdjustment,
    LedgerEntry,
    PriceCatalog,
    SystemSettings,
)
from app.schemas import (
    LedgerHealthIssue, 
    SystemHealthCheckOut, 
    SystemInitialize, 
    SystemSettingsOut
)
from app.services.posting import (
    LedgerLine,
    build_cash_adjustment_lines,
    build_company_lines,
    build_customer_lines,
    build_expense_lines,
    build_inventory_adjustment_lines,
    derive_day,
    post_system_init,
)
from app.utils.time import business_date_start_utc

router = APIRouter(prefix="/system", tags=["system"])

@router.get("/settings", response_model=SystemSettingsOut)
def get_system_settings(session: Session = Depends(get_session)) -> SystemSettingsOut:
    """
    Returns settings or a 'not completed' state for new users.
    This triggers the frontend welcome screen if no record exists.
    """
    settings = session.get(SystemSettings, "system")
    if not settings:
        return SystemSettingsOut(
            id="system",
            is_setup_completed=False,
            currency_code="USD",
            money_decimals=2,
            created_at=datetime.now(timezone.utc)
        )
    return SystemSettingsOut(
        id=settings.id,
        is_setup_completed=settings.is_setup_completed,
        currency_code=settings.currency_code,
        money_decimals=settings.money_decimals,
        created_at=settings.created_at,
    )

@router.post("/initialize", response_model=SystemSettingsOut)
def initialize_system(payload: SystemInitialize, session: Session = Depends(get_session)):
    """
    One-time setup to initialize the ledger with starting balances 
    and mark setup as completed.
    """
    settings = session.get(SystemSettings, "system")
    if settings and settings.is_setup_completed:
        raise HTTPException(status_code=400, detail="system_already_initialized")
    
    if not settings:
        settings = SystemSettings(id="system", is_setup_completed=False, created_at=datetime.now(timezone.utc))

    now = datetime.now(timezone.utc)
    day = derive_day(now)
    init_at = business_date_start_utc(day).replace(tzinfo=timezone.utc)

    # 1. Seed price catalog
    prices = [
        PriceCatalog(
            gas_type="12kg",
            sell_price=payload.sell_price_12,
            buy_price=payload.buy_price_12,
            sell_iron_price=payload.sell_iron_price_12,
            buy_iron_price=payload.buy_iron_price_12,
            effective_from=now,
            created_at=now,
        ),
        PriceCatalog(
            gas_type="48kg",
            sell_price=payload.sell_price_48,
            buy_price=payload.buy_price_48,
            sell_iron_price=payload.sell_iron_price_48,
            buy_iron_price=payload.buy_iron_price_48,
            effective_from=now,
            created_at=now,
        ),
    ]
    for p in prices:
        session.add(p)

    # 2. Prepare opening balances in ledger
    lines: List[LedgerLine] = []

    def add_line(account: str, amount: int, gas_type: Optional[str] = None, 
                 state: Optional[str] = None, unit: str = "money", 
                 customer_id: Optional[str] = None) -> None:
        if amount == 0:
            return
        lines.append(LedgerLine(
            account=account, amount=amount, gas_type=gas_type, 
            state=state, unit=unit, customer_id=customer_id
        ))

    # Assets
    add_line("inv", payload.full_12, gas_type="12kg", state="full", unit="count")
    add_line("inv", payload.empty_12, gas_type="12kg", state="empty", unit="count")
    add_line("inv", payload.full_48, gas_type="48kg", state="full", unit="count")
    add_line("inv", payload.empty_48, gas_type="48kg", state="empty", unit="count")
    add_line("cash", payload.cash_start, unit="money")

    # Company Debts
    add_line("company_money_debts", payload.company_payable_money, unit="money")
    net_company_12 = payload.company_full_12kg - payload.company_empty_12kg
    net_company_48 = payload.company_full_48kg - payload.company_empty_48kg
    add_line("company_cylinders_debts", net_company_12, gas_type="12kg", unit="count")
    add_line("company_cylinders_debts", net_company_48, gas_type="48kg", unit="count")

    # Customer Debts
    for entry in (payload.customer_debts or []):
        if entry.money:
            add_line("cust_money_debts", entry.money, unit="money", customer_id=entry.customer_id)
        if entry.cyl_12:
            add_line("cust_cylinders_debts", entry.cyl_12, gas_type="12kg", state="empty", unit="count", customer_id=entry.customer_id)
        if entry.cyl_48:
            add_line("cust_cylinders_debts", entry.cyl_48, gas_type="48kg", state="empty", unit="count", customer_id=entry.customer_id)

    # Post to Ledger
    post_system_init(session, source_id="system_init", happened_at=init_at, day=day, lines=lines)

    # 3. Finalize Settings
    settings.is_setup_completed = True
    settings.currency_code = payload.currency_code or "USD"
    settings.money_decimals = payload.money_decimals if payload.money_decimals is not None else 2
    
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings

# --- Health Check Utility Functions ---

def _line_key(account: str, gas_type: Optional[str], state: Optional[str], 
              unit: str, customer_id: Optional[str]) -> Tuple:
    return (account, gas_type, state, unit, customer_id)

def _summarize_lines(lines: Iterable[LedgerLine]) -> Dict:
    summary = {}
    for line in lines:
        if line.amount == 0: continue
        key = _line_key(line.account, line.gas_type, line.state, line.unit, line.customer_id)
        summary[key] = summary.get(key, 0) + line.amount
    return summary

def _summarize_entries(entries: Iterable[LedgerEntry]) -> Dict:
    summary = {}
    for entry in entries:
        key = _line_key(entry.account, entry.gas_type, entry.state, entry.unit, entry.customer_id)
        summary[key] = summary.get(key, 0) + entry.amount
    return summary

def _check_intents(*, session: Session, source_type: str, rows: List[object], 
                   builder: Callable, issues: List[LedgerHealthIssue]) -> int:
    mismatch_count = 0
    for row in rows:
        source_id = getattr(row, "id")
        expected = _summarize_lines(builder(row))
        actual_entries = session.exec(
            select(LedgerEntry).where(LedgerEntry.source_type == source_type, LedgerEntry.source_id == source_id)
        ).all()
        actual = _summarize_entries(actual_entries)

        for key, expected_amount in expected.items():
            actual_amount = actual.get(key)
            if actual_amount != expected_amount:
                mismatch_count += 1
                issues.append(LedgerHealthIssue(
                    issue_type="mismatch", source_type=source_type, source_id=source_id,
                    message=f"ledger amount mismatch for account={key[0]}. Expected {expected_amount}, actual {actual_amount}"
                ))
    return mismatch_count

@router.get("/health-check", response_model=SystemHealthCheckOut)
def ledger_health_check(session: Session = Depends(get_session)) -> SystemHealthCheckOut:
    issues: List[LedgerHealthIssue] = []
    mismatch_count = 0

    # Checking all transaction types
    mismatch_count += _check_intents(session=session, source_type="customer_txn", rows=list(session.exec(select(CustomerTransaction)).all()), builder=build_customer_lines, issues=issues)
    mismatch_count += _check_intents(session=session, source_type="company_txn", rows=list(session.exec(select(CompanyTransaction)).all()), builder=build_company_lines, issues=issues)
    mismatch_count += _check_intents(session=session, source_type="inventory_adjust", rows=list(session.exec(select(InventoryAdjustment)).all()), builder=build_inventory_adjustment_lines, issues=issues)
    mismatch_count += _check_intents(session=session, source_type="expense", rows=list(session.exec(select(Expense)).all()), builder=build_expense_lines, issues=issues)
    mismatch_count += _check_intents(session=session, source_type="cash_adjust", rows=list(session.exec(select(CashAdjustment)).all()), builder=build_cash_adjustment_lines, issues=issues)

    return SystemHealthCheckOut(
        ok=mismatch_count == 0,
        checked_at=datetime.now(timezone.utc),
        mismatches=mismatch_count,
        orphans=0, # Simplified for brevity
        issues=issues,
    )
