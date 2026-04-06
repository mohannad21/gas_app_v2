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


def prompt_text(label: str, *, required: bool = True, default: str | None = None) -> str:
  while True:
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    if value:
      return value
    if default is not None:
      return default
    if not required:
      return ""
    print("This value is required.")


def prompt_yes_no(label: str, *, default: bool = True) -> bool:
  default_hint = "Y/n" if default else "y/N"
  while True:
    value = input(f"{label} [{default_hint}]: ").strip().lower()
    if not value:
      return default
    if value in {"y", "yes"}:
      return True
    if value in {"n", "no"}:
      return False
    print("Please answer yes or no.")


def prompt_password() -> str:
  while True:
    password = getpass("Password: ").strip()
    if not password:
      print("Password is required.")
      continue
    confirm = getpass("Confirm password: ").strip()
    if password != confirm:
      print("Passwords do not match.")
      continue
    return password


def summarize_existing_tenant(session: Session, tenant_id: str) -> tuple[Tenant, list[User], list[TenantMembership]]:
  tenant = session.get(Tenant, tenant_id)
  if tenant is None:
    raise RuntimeError(f"default tenant {tenant_id} not found")
  users = session.exec(select(User).where(User.tenant_id == tenant_id)).all()
  memberships = session.exec(select(TenantMembership).where(TenantMembership.tenant_id == tenant_id)).all()
  return tenant, users, memberships


def revoke_sessions_for_user(session: Session, user_id: str, now: datetime) -> None:
  sessions = session.exec(select(AuthSession).where(AuthSession.user_id == user_id)).all()
  for auth_session in sessions:
    if auth_session.revoked_at is None:
      auth_session.revoked_at = now
      session.add(auth_session)


def main() -> None:
  print("Create distributor owner account")
  print("This script configures the existing default tenant for a fresh distributor owner.")
  print("It does not create a second isolated tenant.")
  print("")

  with Session(engine) as session:
    tenant, existing_users, existing_memberships = summarize_existing_tenant(session, DEFAULT_TENANT_ID)

    print(f"Tenant id: {tenant.id}")
    print(f"Current tenant name: {tenant.name}")
    print(f"Existing users on this tenant: {len(existing_users)}")
    print(f"Existing memberships on this tenant: {len(existing_memberships)}")
    print("")

    business_name = prompt_text("Business / distributor name", default=tenant.business_name or tenant.name)
    owner_name = prompt_text("Owner name", default=tenant.owner_name or "")
    login_phone = prompt_text("Owner login phone")
    password = prompt_password()
    business_phone_default = tenant.phone or login_phone
    business_phone = prompt_text("Business phone", required=False, default=business_phone_default)
    address = prompt_text("Business address", required=False, default=tenant.address or "")
    reset_setup = prompt_yes_no("Reset onboarding so the distributor sees the welcome setup flow?", default=True)
    disable_other_users = False
    if existing_users:
      disable_other_users = prompt_yes_no(
        "Disable all other users on the default tenant and revoke their sessions?",
        default=True,
      )

    existing_user = session.exec(select(User).where(User.phone == login_phone)).first()
    if existing_user is not None:
      print("")
      print(f"A user with phone {login_phone} already exists: {existing_user.id}")
      if not prompt_yes_no("Update this existing user instead of creating a new one?", default=True):
        print("Cancelled.")
        return

    now = datetime.now(timezone.utc)

    with session.begin():
      if existing_user is None:
        user = User(
          id=str(uuid4()),
          tenant_id=tenant.id,
          phone=login_phone,
          password_hash=hash_password(password),
          is_active=True,
          must_change_password=False,
        )
        session.add(user)
        session.flush()
      else:
        user = existing_user
        user.tenant_id = tenant.id
        user.phone = login_phone
        user.password_hash = hash_password(password)
        user.is_active = True
        user.must_change_password = False
        user.updated_at = now
        session.add(user)
        revoke_sessions_for_user(session, user.id, now)

      tenant.name = business_name
      tenant.owner_user_id = user.id
      tenant.business_name = business_name
      tenant.owner_name = owner_name or None
      tenant.phone = business_phone or None
      tenant.address = address or None
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

      if disable_other_users:
        other_users = session.exec(
          select(User).where(User.tenant_id == tenant.id).where(User.id != user.id)
        ).all()
        for other_user in other_users:
          other_user.is_active = False
          other_user.updated_at = now
          session.add(other_user)
          revoke_sessions_for_user(session, other_user.id, now)

        other_memberships = session.exec(
          select(TenantMembership)
          .where(TenantMembership.tenant_id == tenant.id)
          .where(TenantMembership.user_id != user.id)
        ).all()
        for other_membership in other_memberships:
          other_membership.is_active = False
          other_membership.revoked_at = now
          session.add(other_membership)

      settings = session.get(SystemSettings, "system")
      if settings is not None and reset_setup:
        settings.is_setup_completed = False
        session.add(settings)

    print("")
    print("Distributor owner account is ready.")
    print(f"Tenant: {tenant.name}")
    print(f"Login phone: {login_phone}")
    print("Password: [the value you entered]")
    if reset_setup:
      print("On first login, the distributor will see the welcome setup flow.")


if __name__ == "__main__":
  main()
