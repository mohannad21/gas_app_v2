"""Completely remove a distributor user account.

Deletes (in FK-safe order):
  sessions, activation_challenges, tenant_memberships, invites (created_by),
  then the user row itself.

If the user is the tenant owner, tenant.owner_user_id is cleared first.
The tenant record itself is NOT deleted — use reset_database.py for a full wipe.

WARNING: This does NOT delete business data. Run clear_business_data.py first
if you also want to remove that distributor's operational data.
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


def main() -> None:
    print("=" * 54)
    print("Delete distributor account")
    print("=" * 54)
    print("This removes the user login account and all membership")
    print("records. Business data is NOT removed automatically.")
    print("Run clear_business_data.py first if needed.")
    print()

    with engine.connect() as conn:
        all_users = conn.execute(
            text(
                "SELECT u.id, u.phone, t.name, t.business_name, t.owner_name "
                "FROM users u "
                "LEFT JOIN tenants t ON t.id = u.tenant_id "
                "ORDER BY u.created_at"
            )
        ).fetchall()

    if not all_users:
        print("No distributor accounts found.")
        return

    print("Registered distributors:")
    print(f"  {'#':<4} {'Phone':<20} {'Tenant':<20} {'Business':<20} {'Owner'}")
    print("  " + "-" * 80)
    for i, row in enumerate(all_users, start=1):
        uid, phone, tenant_name, business_name, owner_name = row
        print(
            f"  {i:<4} {phone or '(none)':<20} "
            f"{(tenant_name or ''):<20} "
            f"{(business_name or ''):<20} "
            f"{owner_name or ''}"
        )
    print()

    while True:
        phone = input("Enter phone number of distributor to delete: ").strip()
        if phone:
            break
        print("Phone number is required.")

    user_row = next((r for r in all_users if r[1] == phone), None)

    if user_row is None:
        print(f"No user found with phone '{phone}'.")
        sys.exit(1)

    user_id, _, tenant_name, business_name, owner_name = user_row

    with engine.connect() as conn:
        full_row = conn.execute(
            text("SELECT id, tenant_id FROM users WHERE phone = :phone"), {"phone": phone}
        ).fetchone()

    tenant_id = full_row[1] if full_row else None

    print(f"\nUser to delete:")
    print(f"  Phone:    {phone}")
    print(f"  Business: {business_name or '(none)'}")
    print(f"  Owner:    {owner_name or '(none)'}")
    print()

    if not prompt_yes_no("Permanently delete this user account?", default=False):
        print("Cancelled.")
        return

    with engine.begin() as conn:
        # 1. Clear tenant.owner_user_id if this user is the owner
        if tenant_id:
            conn.execute(
                text(
                    "UPDATE tenants SET owner_user_id = null "
                    "WHERE id = :tid AND owner_user_id = :uid"
                ),
                {"tid": tenant_id, "uid": user_id},
            )

        # 2. Revoke / delete active sessions
        conn.execute(
            text("DELETE FROM sessions WHERE user_id = :uid"), {"uid": user_id}
        )

        # 3. Delete activation challenges
        conn.execute(
            text("DELETE FROM activation_challenges WHERE user_id = :uid"), {"uid": user_id}
        )

        # 4. Delete tenant memberships
        conn.execute(
            text("DELETE FROM tenant_memberships WHERE user_id = :uid"), {"uid": user_id}
        )

        # 5. Nullify invite created_by references (invites themselves stay for audit)
        conn.execute(
            text("UPDATE invites SET created_by = null WHERE created_by = :uid"), {"uid": user_id}
        )

        # 6. Delete the user
        conn.execute(
            text("DELETE FROM users WHERE id = :uid"), {"uid": user_id}
        )

    print()
    print(f"Done. User '{phone}' has been deleted.")
    print("Run 'py scripts/create_distributor_account.py' to create a new account.")


if __name__ == "__main__":
    main()
