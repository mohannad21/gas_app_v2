"""Clear all business/operational data for all tenants or a specific distributor.

Keeps intact:
  users, sessions, tenants, tenant_memberships, roles, permissions, plans,
  billing data, invites.

Deletes:
  ledger_entries, customer_transactions, company_transactions,
  inventory_adjustments, cash_adjustments, expenses, systems, customers,
  price_catalog, system_type_options, expense_categories.

Also resets system_settings.is_setup_completed → False so the distributor
goes through onboarding again.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db import engine  # noqa: E402


def prompt_yes_no(label: str, *, default: bool = False) -> bool:
    hint = "Y/n" if default else "y/N"
    while True:
        value = input(f"{label} [{hint}]: ").strip().lower()
        if not value:
            return default
        if value in {"y", "yes"}:
            return True
        if value in {"n", "no"}:
            return False
        print("Please answer yes or no.")


def prompt_text(label: str, *, optional: bool = False) -> str | None:
    while True:
        value = input(f"{label}: ").strip()
        if value:
            return value
        if optional:
            return None
        print("This value is required.")


def clear_for_tenant(conn, tenant_id: str) -> None:
    """Delete all business data rows that belong to tenant_id, in FK-safe order."""
    # 1. Ledger entries (references customers)
    conn.execute(text("DELETE FROM ledger_entries WHERE tenant_id = :tid"), {"tid": tenant_id})
    # 2. Customer transactions (references customers + systems)
    conn.execute(text("DELETE FROM customer_transactions WHERE tenant_id = :tid"), {"tid": tenant_id})
    # 3. Company transactions
    conn.execute(text("DELETE FROM company_transactions WHERE tenant_id = :tid"), {"tid": tenant_id})
    # 4. Inventory adjustments
    conn.execute(text("DELETE FROM inventory_adjustments WHERE tenant_id = :tid"), {"tid": tenant_id})
    # 5. Cash adjustments
    conn.execute(text("DELETE FROM cash_adjustments WHERE tenant_id = :tid"), {"tid": tenant_id})
    # 6. Expenses (includes bank deposits stored as kind='deposit')
    conn.execute(text("DELETE FROM expenses WHERE tenant_id = :tid"), {"tid": tenant_id})
    # 7. Systems (references customers — delete before customers)
    conn.execute(text("DELETE FROM systems WHERE tenant_id = :tid"), {"tid": tenant_id})
    # 8. Customers
    conn.execute(text("DELETE FROM customers WHERE tenant_id = :tid"), {"tid": tenant_id})
    # 9. Price catalog (no tenant FK — shared table, only clear if all tenants)
    # 10. System type options (shared — skip per-tenant)
    # 11. Expense categories (shared — skip per-tenant)
    # 12. Reset onboarding flag
    conn.execute(
        text("UPDATE system_settings SET is_setup_completed = false WHERE id = 'system'")
    )


def clear_shared_config(conn) -> None:
    """Clear shared config tables that are not tenant-scoped."""
    conn.execute(text("DELETE FROM price_catalog"))
    conn.execute(text("DELETE FROM system_type_options"))
    conn.execute(text("DELETE FROM expense_categories"))


def main() -> None:
    print("=" * 54)
    print("Clear business data")
    print("=" * 54)
    print("This removes all operational data (customers, orders,")
    print("collections, ledger, inventory, expenses, etc.).")
    print("User accounts and tenant records are preserved.")
    print()
    print("Options:")
    print("  1 — Clear ALL tenants")
    print("  2 — Clear a specific distributor (by phone)")
    print()

    while True:
        choice = input("Choice [1/2]: ").strip()
        if choice in {"1", "2"}:
            break
        print("Enter 1 or 2.")

    tenant_ids: list[str] = []
    clear_shared = False

    with engine.connect() as conn:
        if choice == "1":
            rows = conn.execute(text("SELECT id FROM tenants")).fetchall()
            tenant_ids = [r[0] for r in rows]
            clear_shared = True
            if not tenant_ids:
                print("No tenants found. Nothing to clear.")
                return
            print(f"\nFound {len(tenant_ids)} tenant(s).")
        else:
            phone = prompt_text("Distributor phone number")
            row = conn.execute(
                text("SELECT id FROM users WHERE phone = :phone"), {"phone": phone}
            ).fetchone()
            if row is None:
                print(f"No user found with phone '{phone}'.")
                sys.exit(1)
            user_id = row[0]
            tenant_row = conn.execute(
                text(
                    "SELECT tenant_id FROM tenant_memberships "
                    "WHERE user_id = :uid AND is_active = true LIMIT 1"
                ),
                {"uid": user_id},
            ).fetchone()
            if tenant_row is None:
                print(f"User '{phone}' has no active tenant membership.")
                sys.exit(1)
            tenant_ids = [tenant_row[0]]
            print(f"\nTenant found: {tenant_ids[0]}")

    print()
    if not prompt_yes_no("Proceed with clearing business data?", default=False):
        print("Cancelled.")
        return

    with engine.begin() as conn:
        for tid in tenant_ids:
            print(f"Clearing tenant {tid}...")
            clear_for_tenant(conn, tid)
        if clear_shared:
            print("Clearing shared config (price catalog, system types, expense categories)...")
            clear_shared_config(conn)

    print()
    print("Done. Business data cleared.")
    if choice == "1":
        print("Shared config (price catalog, system types) also cleared.")
    print("User accounts and tenant records are intact.")
    print("Run 'py scripts/create_distributor_account.py' to set up the distributor again.")


if __name__ == "__main__":
    main()
