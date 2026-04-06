from __future__ import annotations

import sys
from datetime import datetime, timezone
from getpass import getpass
from pathlib import Path
from uuid import uuid4

from sqlmodel import Session, select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import DEFAULT_TENANT_ID  # noqa: E402
from app.db import engine  # noqa: E402
from app.models import Session as AuthSession  # noqa: E402
from app.models import SystemSettings, Tenant, TenantMembership, User  # noqa: E402
from app.utils.password import hash_password  # noqa: E402

OWNER_ROLE_ID = "00000000-0000-0000-role-000000000001"


def prompt_text(label: str) -> str:
    while True:
        value = input(f"{label}: ").strip()
        if value:
            return value
        print("This value is required.")


def prompt_password() -> str:
    while True:
        password = getpass("Temporary password: ").strip()
        if not password:
            print("Password is required.")
            continue
        confirm = getpass("Confirm password: ").strip()
        if password != confirm:
            print("Passwords do not match. Try again.")
            continue
        return password


def prompt_yes_no(label: str, *, default: bool = True) -> bool:
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


def revoke_sessions(session: Session, user_id: str, now: datetime) -> None:
    sessions = session.exec(
        select(AuthSession).where(AuthSession.user_id == user_id)
    ).all()
    for s in sessions:
        if s.revoked_at is None:
            s.revoked_at = now
            session.add(s)


def main() -> None:
    print("=" * 50)
    print("Create / reset distributor account")
    print("=" * 50)
    print()

    phone = prompt_text("Distributor login phone")
    password = prompt_password()
    reset_setup = prompt_yes_no(
        "Reset onboarding so the distributor sees the welcome setup flow?",
        default=True,
    )

    now = datetime.now(timezone.utc)

    with Session(engine) as session:
        with session.begin():
            tenant = session.get(Tenant, DEFAULT_TENANT_ID)
            if tenant is None:
                print(f"ERROR: default tenant {DEFAULT_TENANT_ID} not found. Run migrations first.")
                sys.exit(1)

            existing_user = session.exec(
                select(User).where(User.phone == phone)
            ).first()

            if existing_user is None:
                user = User(
                    id=str(uuid4()),
                    tenant_id=tenant.id,
                    phone=phone,
                    password_hash=hash_password(password),
                    is_active=True,
                    must_change_password=True,
                )
                session.add(user)
                session.flush()
            else:
                user = existing_user
                user.tenant_id = tenant.id
                user.password_hash = hash_password(password)
                user.is_active = True
                user.must_change_password = True
                user.updated_at = now
                session.add(user)
                revoke_sessions(session, user.id, now)

            tenant.owner_user_id = user.id
            tenant.updated_at = now
            session.add(tenant)

            membership = session.exec(
                select(TenantMembership)
                .where(TenantMembership.tenant_id == tenant.id)
                .where(TenantMembership.user_id == user.id)
            ).first()
            if membership is None:
                membership = TenantMembership(
                    id=str(uuid4()),
                    tenant_id=tenant.id,
                    user_id=user.id,
                    role_id=OWNER_ROLE_ID,
                    is_active=True,
                    joined_at=now,
                )
            else:
                membership.role_id = OWNER_ROLE_ID
                membership.is_active = True
                membership.revoked_at = None
            session.add(membership)

            if reset_setup:
                settings = session.get(SystemSettings, "system")
                if settings is not None:
                    settings.is_setup_completed = False
                    session.add(settings)

    print()
    print("Done.")
    print(f"  Phone:    {phone}")
    print(f"  Password: [the value you entered]")
    print(f"  The distributor MUST change their password on first login.")
    if reset_setup:
        print(f"  Onboarding reset - distributor will see the welcome setup flow.")


if __name__ == "__main__":
    main()
