# Ticket: Distributor Provisioning Script + Forced Password Change

## Branch
Create a new branch from the current branch (not from main):
```
git checkout fix/consolidate-screens
git checkout -b fix/dist-onboarding
```

---

## Rules for Codex — Read These First

- **Read every file before modifying it.**
- **Do not change any business logic** beyond exactly what is described in each step.
- **Do not rename, refactor, or reformat** anything outside the scope of each step.
- **Do not add features** not listed here.
- Run `cd frontend && npm run build` at the end and confirm 0 TypeScript errors.
- Run `cd backend && python -m py_compile scripts/create_distributor_account.py && echo OK` to verify the script.

---

## Overview

Three things to fix:

1. **Simplify the provisioning script** — ask only phone + password + reset-onboarding. Nothing else.
2. **Script sets `must_change_password=True`** — distributor must change the temporary password on first login.
3. **Enforce `must_change_password` end-to-end** — backend returns the flag at login, frontend stores it and redirects to a forced change-password screen before the user can access anything else.

---

## Step 1 — Rewrite the provisioning script

**File:** `backend/scripts/create_distributor_account.py`

Replace the entire file with:

```python
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
        tenant = session.get(Tenant, DEFAULT_TENANT_ID)
        if tenant is None:
            print(f"ERROR: default tenant {DEFAULT_TENANT_ID} not found. Run migrations first.")
            sys.exit(1)

        existing_user = session.exec(
            select(User).where(User.phone == phone)
        ).first()

        with session.begin():
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
        print(f"  Onboarding reset — distributor will see the welcome setup flow.")


if __name__ == "__main__":
    main()
```

---

## Step 2 — Return `must_change_password` from the login endpoint

### 2a — Schema

**File:** `backend/app/schemas/auth.py`

Read the file. In `LoginResponse`, after `token_type: str = "bearer"`, add:
```python
  must_change_password: bool = False
```

### 2b — Login endpoint

**File:** `backend/app/routers/auth.py`

Read the file. In the `login` function, find the `return LoginResponse(...)` call (around line 141). Change it to:
```python
  return LoginResponse(
    access_token=access_token,
    refresh_token=db_session.id,
    must_change_password=user.must_change_password,
  )
```

---

## Step 3 — Store and expose `must_change_password` in the frontend

### 3a — auth-storage.ts

**File:** `frontend/lib/auth-storage.ts`

Read the file. Add a new storage key and three functions at the end of the file:

```ts
const MUST_CHANGE_PASSWORD_KEY = "auth_must_change_password";

export async function storeMustChangePassword(value: boolean): Promise<void> {
  await SecureStore.setItemAsync(MUST_CHANGE_PASSWORD_KEY, value ? "1" : "0");
}

export async function getMustChangePassword(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(MUST_CHANGE_PASSWORD_KEY);
  return val === "1";
}

export async function clearMustChangePassword(): Promise<void> {
  await SecureStore.deleteItemAsync(MUST_CHANGE_PASSWORD_KEY);
}
```

Also update `clearTokens` to also clear the must-change flag. Find:
```ts
export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  notifyListeners(null, null);
}
```

Replace with:
```ts
export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(MUST_CHANGE_PASSWORD_KEY);
  notifyListeners(null, null);
}
```

### 3b — AuthContext.tsx

**File:** `frontend/context/AuthContext.tsx`

Read the file.

Add the new storage functions to the import:
```ts
import {
  clearTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  storeTokens,
  subscribeToTokens,
  storeMustChangePassword,
  getMustChangePassword,
  clearMustChangePassword,
} from "@/lib/auth-storage";
```

In `AuthState` type, add:
```ts
  mustChangePassword: boolean;
  clearMustChangePassword: () => Promise<void>;
```

In the component body, add a new state variable after `isLoading`:
```ts
const [mustChangePassword, setMustChangePassword] = useState(false);
```

In the `useEffect` that loads the stored token on mount, after `setAccessToken(token)`, add:
```ts
      getMustChangePassword().then((flag) => {
        if (isMounted) setMustChangePassword(flag);
      });
```

In the `login` function, after `await storeTokens(data.access_token, data.refresh_token)`, add:
```ts
    const mustChange = data.must_change_password ?? false;
    await storeMustChangePassword(mustChange);
    setMustChangePassword(mustChange);
```

Add a new function inside the component:
```ts
  async function handleClearMustChangePassword(): Promise<void> {
    await clearMustChangePassword();
    setMustChangePassword(false);
  }
```

In the `AuthContext.Provider value={...}` object, add:
```ts
        mustChangePassword,
        clearMustChangePassword: handleClearMustChangePassword,
```

---

## Step 4 — Enforce forced password change in navigation

### 4a — Update InitializationGuard in _layout.tsx

**File:** `frontend/app/_layout.tsx`

Read the file.

In `AuthenticatedInitializationGuard`, find the `useSystemSettings` call. Add `useAuth` to the imports from `@/context/AuthContext` if it isn't already imported there. Then inside `AuthenticatedInitializationGuard`, add `const { mustChangePassword } = useAuth();` after the existing hook calls.

Find the `useEffect` inside `AuthenticatedInitializationGuard`. Add this check at the very top of the effect body, before the existing `if (settingsLoading || !data) return;` line:

```ts
    if (mustChangePassword) {
      if (segments[0] !== "force-change-password") {
        router.replace("/force-change-password");
      }
      return;
    }
```

### 4b — Create the forced change-password screen

**Create:** `frontend/app/force-change-password.tsx`

```tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { api } from "@/lib/api/client";
import { useAuth } from "@/context/AuthContext";
import { showToast } from "@/lib/toast";

export default function ForceChangePasswordScreen() {
  const router = useRouter();
  const { clearMustChangePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current password.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      await clearMustChangePassword();
      showToast("Password updated. Welcome!");
      router.replace("/");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (detail === "wrong_password") {
        setError("Current password is incorrect.");
      } else {
        setError("Failed to change password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set Your Password</Text>
      <Text style={styles.subtitle}>
        You are using a temporary password. Please set a new password before continuing.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Temporary password"
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="New password (min. 8 characters)"
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!isLoading}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Set Password & Continue</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#f7f7f8",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontFamily: "NunitoSans-Bold",
    marginBottom: 10,
    color: "#111",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    fontFamily: "NunitoSans-Regular",
    marginBottom: 28,
    lineHeight: 20,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "NunitoSans-Bold" },
  errorText: { color: "#dc2626", fontSize: 14, marginBottom: 8 },
});
```

---

## Verification

```bash
# Backend
cd backend && python -m py_compile scripts/create_distributor_account.py && echo "Script OK"

# Frontend
cd frontend && npm run build
```

Expected: 0 TypeScript errors, script compiles cleanly.

Manual test flow:
1. `cd backend && python scripts/create_distributor_account.py`
   - Enter a phone number and password
   - Answer Y to reset onboarding
2. Open the app → log in with that phone and password
3. App should redirect to the "Set Your Password" screen immediately — not to the welcome wizard
4. Enter the temporary password + a new password
5. After submit: toast appears, app navigates to welcome wizard (because setup is not complete)
6. Kill and reopen the app → log in with the new password → goes straight to welcome wizard (no forced password screen)
7. Complete onboarding → lands on dashboard
