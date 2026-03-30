#!/usr/bin/env python3
"""
Script to split backend/app/schemas.py into focused domain modules.
"""

import os
import re
from pathlib import Path

# Mapping of class names to target module
CLASS_MAPPING = {
    # Customer
    "CustomerCreate": "customer",
    "CustomerUpdate": "customer",
    "CustomerOut": "customer",
    "CustomerAdjustmentCreate": "customer",
    "CustomerAdjustmentOut": "customer",
    "CustomerBalanceOut": "customer",

    # Order & Collection
    "OrderCreate": "order",
    "OrderUpdate": "order",
    "OrderOut": "order",
    "CollectionCreate": "order",
    "CollectionUpdate": "order",
    "CollectionEvent": "order",

    # Inventory
    "InventoryAdjustCreate": "inventory",
    "InventoryAdjustUpdate": "inventory",
    "InventoryAdjustmentRow": "inventory",
    "InventorySnapshot": "inventory",
    "InventoryInitCreate": "inventory",
    "InventoryRefillCreate": "inventory",
    "InventoryRefillSummary": "inventory",
    "InventoryRefillUpdate": "inventory",
    "InventoryRefillDetails": "inventory",

    # Transaction (money, cash, expenses, bank, company)
    "CashAdjustCreate": "transaction",
    "CashAdjustUpdate": "transaction",
    "CashAdjustmentRow": "transaction",
    "ExpenseCategoryCreate": "transaction",
    "ExpenseCategoryOut": "transaction",
    "ExpenseCreate": "transaction",
    "ExpenseOut": "transaction",
    "ExpenseCreateLegacy": "transaction",
    "ExpenseUpdate": "transaction",
    "ExpenseOutLegacy": "transaction",
    "BankDepositCreate": "transaction",
    "BankDepositOut": "transaction",
    "CompanyPaymentCreate": "transaction",
    "CompanyPaymentOut": "transaction",
    "CompanyBuyIronCreate": "transaction",
    "CompanyBuyIronOut": "transaction",
    "CompanyCylinderSettleCreate": "transaction",
    "CompanyCylinderSettleOut": "transaction",
    "CompanyBalanceAdjustmentCreate": "transaction",
    "CompanyBalanceAdjustmentOut": "transaction",
    "CompanyBalancesOut": "transaction",

    # Price
    "PriceCreate": "price",
    "PriceOut": "price",

    # System/Settings
    "SystemCreate": "system",
    "SystemUpdate": "system",
    "SystemOut": "system",
    "SystemTypeOptionCreate": "system",
    "SystemTypeOptionUpdate": "system",
    "SystemTypeOptionOut": "system",
    "SystemSettingsOut": "system",
    "SystemInitialize": "system",
    "CustomerOpeningBalance": "system",
    "LedgerHealthIssue": "system",
    "SystemHealthCheckOut": "system",

    # Report
    "ReportInventoryTotals": "report",
    "ReportInventoryState": "report",
    "DailyAuditSummary": "report",
    "DailyReportV2CashMath": "report",
    "DailyReportV2MathCustomers": "report",
    "DailyReportV2MathCompany": "report",
    "DailyReportV2MathResult": "report",
    "DailyReportV2Math": "report",
    "BalanceTransition": "report",
    "DailyReportV2Card": "report",
    "Level3Counterparty": "report",
    "Level3System": "report",
    "Level3Hero": "report",
    "Level3Money": "report",
    "Level3SettlementComponents": "report",
    "Level3Settlement": "report",
    "Level3Action": "report",
    "ActivityNote": "report",
    "DailyReportV2Event": "report",
    "DailyReportV2Day": "report",
}

def read_schemas():
    """Read the original schemas.py file."""
    path = Path("backend/app/schemas.py")
    return path.read_text()

def extract_class(content: str, class_name: str) -> tuple[str, int]:
    """Extract a class definition from content. Returns (class_def, end_position)."""
    pattern = rf"^class {class_name}\(.*?\):"
    match = re.search(pattern, content, re.MULTILINE)

    if not match:
        raise ValueError(f"Class {class_name} not found")

    start = match.start()
    # Find the next class or end of file
    remaining = content[match.end():]
    next_class = re.search(r"^class ", remaining, re.MULTILINE)

    if next_class:
        end = match.end() + next_class.start()
    else:
        end = len(content)

    return content[start:end].rstrip() + "\n\n", end

def get_imports_and_helpers():
    """Return common imports and helper functions."""
    return '''from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional
from uuid import uuid4

from pydantic import field_validator
from sqlmodel import Field, SQLModel

GasType = Literal["12kg", "48kg"]
OrderMode = Literal["replacement", "sell_iron", "buy_iron"]
InventoryAdjustReason = Literal["count_correction", "shrinkage", "damage"]
TransferDirection = Literal["wallet_to_bank", "bank_to_wallet"]
MAX_LEDGER_INT = 2_147_483_647


def new_id(prefix: str = "") -> str:
  return f"{prefix}{uuid4()}"


def _non_negative(value: Optional[int], field_name: str) -> Optional[int]:
  if value is None:
    return value
  if value < 0:
    raise ValueError(f"{field_name}_must_be_non_negative")
  if value > MAX_LEDGER_INT:
    raise ValueError(f"{field_name}_must_be_within_ledger_range")
  return value


'''

def split_schemas():
    """Split schemas.py into focused modules."""
    content = read_schemas()
    modules = {}
    processed_classes = set()

    # Group classes by module
    for class_name, module in CLASS_MAPPING.items():
        if module not in modules:
            modules[module] = []
        modules[module].append(class_name)

    # Extract classes and create module files
    for module_name, class_names in modules.items():
        module_content = get_imports_and_helpers()

        for class_name in class_names:
            try:
                class_def, _ = extract_class(content, class_name)
                module_content += class_def
                processed_classes.add(class_name)
            except ValueError:
                print(f"Warning: Could not find class {class_name}")

        # Write module file
        module_path = Path(f"backend/app/schemas/{module_name}.py")
        module_path.parent.mkdir(parents=True, exist_ok=True)
        module_path.write_text(module_content)
        print(f"✓ Created backend/app/schemas/{module_name}.py")

    return processed_classes

def create_init_file(processed_classes):
    """Create __init__.py that re-exports all schemas."""
    modules = set(CLASS_MAPPING[cn] for cn in processed_classes if cn in CLASS_MAPPING)

    init_content = "# Re-export all schemas for backward compatibility\n\n"

    for module_name in sorted(modules):
        init_content += f"from .{module_name} import *\n"

    init_path = Path("backend/app/schemas/__init__.py")
    init_path.write_text(init_content)
    print(f"✓ Created backend/app/schemas/__init__.py")

if __name__ == "__main__":
    print("Splitting backend/app/schemas.py into focused modules...")
    processed = split_schemas()
    create_init_file(processed)
    print(f"\n✓ Successfully split {len(processed)} schema classes into {len(set(CLASS_MAPPING.get(c) for c in processed))} modules")
