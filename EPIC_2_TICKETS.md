# Epic 2 — Authentication & Security

## Branch
Both tickets work on the same branch: `epic/2-authentication`
Create it from `main` (after Epic 1 is merged) before starting Ticket 1. Do not merge to main until both tickets are done and all tests pass.

## Rules for Codex (Apply to All Tickets in This Epic)

- **Do not touch any existing business logic.** Orders, collections, inventory, reports — none of these routers change.
- **Do not change any existing API response shapes.** All existing endpoints keep their current output.
- **Do not add features outside the ticket scope.** If something seems missing, leave a comment and move on.
- **Do not remove the `/auth/dev-token` endpoint.** It stays for the entire epic — it allows the frontend to work during development before the login screen is fully wired.
- **Read every file before modifying it.** Understand existing imports and patterns first.
- **Run the verification command at the end of each ticket before declaring it done.**
- **One migration file per ticket.** The migration file name prefix is `h1_` for Ticket E2-1.

---

## Ticket E2-1 — Backend Auth Tables and Login API

### Objective
Create `users`, `sessions`, and `activation_challenges` tables. Add password hashing. Implement login, activation, token refresh, logout, and change-password endpoints. The developer can create a distributor user via a debug-only endpoint, which returns the activation OTP directly in the response.

### Context
`app/auth.py` already has `create_access_token` and `get_current_user` — keep both unchanged. `get_current_user` returns the `sub` string from the JWT and is used as a dependency on all protected routes. In this epic, the `sub` will be a real user UUID. The existing dev-token endpoint (`GET /auth/dev-token`) keeps working as before — do not modify it.

All protected routes in `main.py` already use `Depends(get_current_user)` — no changes to `main.py` needed.

---

### Step 1 — Add `argon2-cffi` to `backend/pyproject.toml`

In the `[tool.poetry.dependencies]` section, add:

```toml
argon2-cffi = "^23.1.0"
```

Then run `poetry lock --no-update && poetry install` to update the lockfile.

---

### Step 2 — Create `backend/app/utils/password.py`

Create a new file with these two functions:

```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False
```

---

### Step 3 — Add auth models to `backend/app/models.py`

Add the three classes below. Place them **after** the `Tenant` class and **before** the `Customer` class.

```python
class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=_uuid, primary_key=True, index=True)
    tenant_id: Optional[str] = Field(default=None, foreign_key="tenants.id", nullable=True, index=True)
    phone: Optional[str] = Field(default=None, nullable=True, index=True)
    password_hash: Optional[str] = Field(default=None, nullable=True)
    is_active: bool = Field(default=False)
    must_change_password: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
    )


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    id: str = Field(default_factory=_uuid, primary_key=True, index=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
    )
    expires_at: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
    )
    revoked_at: Optional[datetime] = Field(
        default=None,
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
    )
    user_agent: Optional[str] = Field(default=None, nullable=True)


class ActivationChallenge(SQLModel, table=True):
    __tablename__ = "activation_challenges"

    id: str = Field(default_factory=_uuid, primary_key=True, index=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    code_hash: str
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
    )
    expires_at: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False),
    )
    used_at: Optional[datetime] = Field(
        default=None,
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True),
    )
```

Also update the `Tenant` model's `owner_user_id` to have a foreign key now that `User` exists:

Find the `owner_user_id` field in `Tenant` and change it to:

```python
owner_user_id: Optional[str] = Field(default=None, foreign_key="users.id", nullable=True)
```

> Note: Because `User` is now defined before `Customer` but `Tenant` is defined before `User`, you will need to reorder the class definitions so that `User` comes **before** `Tenant`, or use SQLAlchemy's string-based forward references. The simplest solution: move the `User` class **before** `Tenant`. Then update `Tenant.owner_user_id` with `foreign_key="users.id"`.

---

### Step 4 — Create `backend/app/schemas/auth.py`

Create a new file with these request/response schemas:

```python
from __future__ import annotations

from typing import Optional
from sqlmodel import SQLModel


class DeveloperCreateUserRequest(SQLModel):
    phone: str
    name: str  # stored on the tenant, not the user


class DeveloperCreateUserResponse(SQLModel):
    user_id: str
    activation_code: str  # returned directly — debug mode only


class ActivateRequest(SQLModel):
    user_id: str
    code: str
    password: str


class LoginRequest(SQLModel):
    phone: str
    password: str


class LoginResponse(SQLModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(SQLModel):
    refresh_token: str


class RefreshResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(SQLModel):
    current_password: str
    new_password: str
```

Export these from `backend/app/schemas/__init__.py` by adding the following import line to the existing `__init__.py`:

```python
from .auth import (
    DeveloperCreateUserRequest,
    DeveloperCreateUserResponse,
    ActivateRequest,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RefreshResponse,
    ChangePasswordRequest,
)
```

---

### Step 5 — Write Alembic migration

Create file: `backend/alembic/versions_v2/h1_add_auth_tables.py`

**upgrade():**

```sql
-- 1. Create users table (before tenants so FK from tenants → users can be added)
CREATE TABLE users (
    id VARCHAR PRIMARY KEY,
    tenant_id VARCHAR REFERENCES tenants(id),
    phone VARCHAR,
    password_hash VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX ix_users_tenant_id ON users (tenant_id);
CREATE INDEX ix_users_phone ON users (phone);

-- 2. Add FK on tenants.owner_user_id → users.id (column already exists, just add FK)
ALTER TABLE tenants
    ADD CONSTRAINT fk_tenants_owner_user_id
    FOREIGN KEY (owner_user_id) REFERENCES users(id);

-- 3. Create sessions table
CREATE TABLE sessions (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    user_agent VARCHAR
);
CREATE INDEX ix_sessions_user_id ON sessions (user_id);

-- 4. Create activation_challenges table
CREATE TABLE activation_challenges (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(id),
    code_hash VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX ix_activation_challenges_user_id ON activation_challenges (user_id);
```

**downgrade():**

```sql
DROP TABLE IF EXISTS activation_challenges;
DROP TABLE IF EXISTS sessions;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS fk_tenants_owner_user_id;
DROP TABLE IF EXISTS users;
```

---

### Step 6 — Implement auth endpoints in `backend/app/routers/auth.py`

Replace the entire file content with the following. Keep the existing `GET /auth/dev-token` endpoint exactly as it is — add all new endpoints below it.

```python
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.auth import create_access_token, get_current_user
from app.config import DEFAULT_TENANT_ID, get_settings
from app.db import get_session
from app.models import ActivationChallenge, Tenant, User, Session as DbSession
from app.schemas import (
    ActivateRequest,
    ChangePasswordRequest,
    DeveloperCreateUserRequest,
    DeveloperCreateUserResponse,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RefreshResponse,
)
from app.utils.password import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_TOKEN_EXPIRES_DAYS = 30
_OTP_EXPIRES_MINUTES = 30
_OTP_LENGTH = 6


def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=_OTP_LENGTH))


@router.get("/dev-token")
def get_dev_token() -> dict[str, str]:
    settings = get_settings()
    if not settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return {"access_token": create_access_token("dev-user")}


@router.post("/developer/create-user", response_model=DeveloperCreateUserResponse)
def developer_create_user(
    payload: DeveloperCreateUserRequest,
    session: Session = Depends(get_session),
) -> DeveloperCreateUserResponse:
    settings = get_settings()
    if not settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    with session.begin():
        # Create user linked to default tenant
        user = User(tenant_id=DEFAULT_TENANT_ID)
        user.phone = payload.phone
        session.add(user)
        session.flush()

        # Update tenant name and owner
        tenant = session.get(Tenant, DEFAULT_TENANT_ID)
        if tenant:
            tenant.name = payload.name
            tenant.owner_user_id = user.id
            session.add(tenant)

        # Create activation challenge
        code = _generate_otp()
        challenge = ActivationChallenge(
            user_id=user.id,
            code_hash=hash_password(code),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=_OTP_EXPIRES_MINUTES),
        )
        session.add(challenge)

    return DeveloperCreateUserResponse(user_id=user.id, activation_code=code)


@router.post("/activate", status_code=status.HTTP_200_OK)
def activate_user(
    payload: ActivateRequest,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    with session.begin():
        user = session.get(User, payload.user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_user")
        if user.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="already_active")

        challenge = session.exec(
            select(ActivationChallenge)
            .where(ActivationChallenge.user_id == payload.user_id)
            .where(ActivationChallenge.used_at == None)  # noqa: E711
            .order_by(ActivationChallenge.created_at.desc())
        ).first()

        if not challenge:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_challenge")
        if datetime.now(timezone.utc) > challenge.expires_at:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code_expired")
        if not verify_password(payload.code, challenge.code_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_code")

        challenge.used_at = datetime.now(timezone.utc)
        user.password_hash = hash_password(payload.password)
        user.is_active = True
        session.add(challenge)
        session.add(user)

    return {"status": "activated"}


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> LoginResponse:
    user = session.exec(
        select(User).where(User.phone == payload.phone)
    ).first()

    if not user or not user.password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="account_inactive")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

    with session.begin():
        db_session = DbSession(
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=_REFRESH_TOKEN_EXPIRES_DAYS),
            user_agent=request.headers.get("user-agent"),
        )
        session.add(db_session)

    access_token = create_access_token(subject=user.id)
    return LoginResponse(access_token=access_token, refresh_token=db_session.id)


@router.post("/refresh", response_model=RefreshResponse)
def refresh_token(
    payload: RefreshRequest,
    session: Session = Depends(get_session),
) -> RefreshResponse:
    db_session = session.get(DbSession, payload.refresh_token)
    if not db_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_refresh_token")
    if db_session.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session_revoked")
    if datetime.now(timezone.utc) > db_session.expires_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="session_expired")

    access_token = create_access_token(subject=db_session.user_id)
    return RefreshResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    payload: RefreshRequest,
    session: Session = Depends(get_session),
) -> None:
    with session.begin():
        db_session = session.get(DbSession, payload.refresh_token)
        if db_session and db_session.revoked_at is None:
            db_session.revoked_at = datetime.now(timezone.utc)
            session.add(db_session)


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    payload: ChangePasswordRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    session: Session = Depends(get_session),
) -> dict[str, str]:
    with session.begin():
        user = session.get(User, user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
        if not user.password_hash or not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="wrong_password")

        user.password_hash = hash_password(payload.new_password)
        user.must_change_password = False
        user.updated_at = datetime.now(timezone.utc)
        session.add(user)

    return {"status": "password_changed"}
```

> Note on `Session` import name collision: Python's `Session` from `sqlmodel` and the `Session` model from `app.models` will conflict. Import the model as `DbSession` in this file as shown above.

---

### What NOT to do in this ticket

- Do not change `get_current_user` in `app/auth.py` — it stays as is
- Do not change `main.py` — all protected routes already have `Depends(get_current_user)`
- Do not add `is_active` checks to existing business-logic routes (orders, inventory, etc.)
- Do not touch any frontend file
- Do not touch any existing router except `auth.py`
- Do not change any existing endpoint response shapes

---

### Verification

```bash
cd backend
poetry install
python -c "from app.models import User, Session, ActivationChallenge; print('Models OK')"
python -c "from app.utils.password import hash_password, verify_password; h = hash_password('test'); print('Password OK:', verify_password('test', h))"
python -c "from app.schemas import LoginRequest, LoginResponse, ActivateRequest; print('Schemas OK')"
alembic upgrade head
python -m pytest tests/ -v
```

Expected: models import without error, password hashing works, migration runs clean, all tests pass.

---

---

## Ticket E2-2 — Frontend Auth Flow and Persistent Sessions

### Objective
Add persistent token storage, a login screen, an auth guard, and a change-password screen. After this ticket, the app requires a real login (phone + password) to access any screen. The dev-token flow is disabled when `EXPO_PUBLIC_API_DEBUG_AUTH=false` is set — and that env var can be set to force real auth even in development.

### Context
`frontend/lib/api/client.ts` currently fetches a dev-token automatically and stores it in memory. This ticket adds `expo-secure-store` for persistent token storage, adds token refresh logic to the Axios interceptor, and routes unauthenticated users to a login screen. The `InitializationGuard` in `_layout.tsx` is extended (not replaced) to also guard against unauthenticated state.

---

### Step 1 — Install `expo-secure-store`

In the `frontend/` directory, run:

```bash
npx expo install expo-secure-store
```

This adds `expo-secure-store` to `package.json` and installs it.

---

### Step 2 — Create `frontend/lib/auth-storage.ts`

```typescript
import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "auth_access_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";

export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function getStoredAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
```

---

### Step 3 — Create `frontend/context/AuthContext.tsx`

```typescript
import React, { createContext, useContext, useEffect, useState } from "react";
import { clearTokens, getStoredAccessToken, getStoredRefreshToken, storeTokens } from "@/lib/auth-storage";

type AuthState = {
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getStoredAccessToken().then((token) => {
      setAccessToken(token);
      setIsLoading(false);
    });
  }, []);

  async function login(phone: string, password: string): Promise<void> {
    const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.detail || "login_failed");
    }
    const data = await response.json();
    await storeTokens(data.access_token, data.refresh_token);
    setAccessToken(data.access_token);
  }

  async function logout(): Promise<void> {
    const refreshToken = await getStoredRefreshToken();
    if (refreshToken) {
      const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
      const token = accessToken;
      fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }
    await clearTokens();
    setAccessToken(null);
  }

  async function setTokens(newAccessToken: string, refreshToken: string): Promise<void> {
    await storeTokens(newAccessToken, refreshToken);
    setAccessToken(newAccessToken);
  }

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken,
        isLoading,
        login,
        logout,
        setTokens,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
```

---

### Step 4 — Update `frontend/lib/api/client.ts`

Replace the token-fetching logic so that:
1. The request interceptor reads the token from `SecureStore` directly (via `getStoredAccessToken`)
2. The response interceptor handles 401 by attempting a token refresh
3. The dev-token fetch logic is **kept** but only runs when `EXPO_PUBLIC_API_DEBUG_AUTH` is not set to `"false"` (backward compatible)

The new interceptors section (replace lines 28–91):

```typescript
import { clearTokens, getStoredAccessToken, getStoredRefreshToken, storeTokens } from "@/lib/auth-storage";

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeToRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function notifyRefreshSubscribers(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await authClient.post("/auth/refresh", { refresh_token: refreshToken });
    const { access_token } = response.data;
    await storeTokens(access_token, refreshToken);
    return access_token;
  } catch {
    await clearTokens();
    return null;
  }
}

api.interceptors.request.use(async (config) => {
  (config as any).metadata = { start: Date.now() };
  void ensureBackendHealthy();
  const url = config.url ?? "";
  if (!url.startsWith("/health") && !url.startsWith("/auth/")) {
    let token = await getStoredAccessToken();
    if (!token && process.env.EXPO_PUBLIC_API_DEBUG_AUTH !== "false") {
      token = await getAccessToken(); // fallback to dev-token in debug mode
    }
    if (token) {
      const headers = (config.headers ?? {}) as Record<string, string>;
      if (!headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
      }
      config.headers = headers;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeToRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      const newToken = await attemptTokenRefresh();
      isRefreshing = false;
      if (newToken) {
        notifyRefreshSubscribers(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);
```

> Important: Keep the existing `devAccessToken`, `devAccessTokenPromise`, `ensureBackendHealthy`, `getAccessToken`, `healthClient`, and `authClient` declarations in the file — the fallback to dev-token is still used in debug mode. Only the interceptor section changes.

---

### Step 5 — Wrap `RootLayout` with `AuthProvider` in `frontend/app/_layout.tsx`

Import `AuthProvider` and `useAuth` from `@/context/AuthContext`. Wrap the entire `QueryClientProvider` tree with `AuthProvider`. Then update `InitializationGuard` to also guard against unauthenticated state.

The updated `_layout.tsx`:

```typescript
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Toast } from "@/components/Toast";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { AuthProvider, useAuth } from "@/context/AuthContext";

const queryClient = new QueryClient();
const GLOBAL_ACCESSORY_ID = "globalDoneAccessory";

if (Platform.OS === "ios") {
  TextInput.defaultProps = {
    ...(TextInput.defaultProps ?? {}),
    inputAccessoryViewID: GLOBAL_ACCESSORY_ID,
  };
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "NunitoSans-Regular": require("../assets/fonts/NunitoSans-Regular.ttf"),
    "NunitoSans-SemiBold": require("../assets/fonts/NunitoSans-SemiBold.ttf"),
    "NunitoSans-Bold": require("../assets/fonts/NunitoSans-Bold.ttf"),
    "NunitoSans-ExtraBold": require("../assets/fonts/NunitoSans-ExtraBold.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
            <InitializationGuard />
            <Stack screenOptions={{ headerShown: false }} />
            <Toast />
            {Platform.OS === "ios" && (
              <InputAccessoryView nativeID={GLOBAL_ACCESSORY_ID}>
                <View style={styles.accessoryRow}>
                  <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
                    <Text style={styles.accessoryText}>Done</Text>
                  </Pressable>
                </View>
              </InputAccessoryView>
            )}
          </SafeAreaView>
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function InitializationGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data, isLoading: settingsLoading } = useSystemSettings();

  useEffect(() => {
    if (authLoading) return;

    const inAuth = segments[0] === "login";

    // Not authenticated → go to login screen
    if (!isAuthenticated) {
      if (!inAuth) router.replace("/login");
      return;
    }

    // Authenticated but system settings still loading
    if (settingsLoading || !data) return;

    const inWelcome = segments[0] === "welcome";
    const isSetupCompleted = data.is_setup_completed;

    if (!isSetupCompleted && !inWelcome) {
      router.replace("/welcome");
      return;
    }
    if (isSetupCompleted && (inWelcome || inAuth)) {
      router.replace("/(tabs)/dashboard");
    }
  }, [isAuthenticated, authLoading, data?.is_setup_completed, settingsLoading, router, segments]);

  return null;
}

const styles = StyleSheet.create({
  accessoryRow: {
    backgroundColor: "#f1f5f9",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5f5",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  accessoryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  accessoryText: {
    color: "#fff",
    fontWeight: "700",
  },
});
```

---

### Step 6 — Create `frontend/app/login.tsx`

Create a login screen at this path. Use `react-hook-form` for the form (already installed).

```typescript
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!phone.trim() || !password.trim()) {
      setError("Phone and password are required");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await login(phone.trim(), password);
      router.replace("/(tabs)/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "login_failed";
      if (message === "invalid_credentials") {
        setError("Incorrect phone number or password");
      } else if (message === "account_inactive") {
        setError("Account not yet activated. Use your activation code first.");
      } else {
        setError("Could not connect. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      <TextInput
        style={styles.input}
        placeholder="Phone number"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={phone}
        onChangeText={setPhone}
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
        editable={!isLoading}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleLogin} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f7f7f8" },
  title: { fontSize: 28, fontFamily: "NunitoSans-Bold", marginBottom: 4 },
  subtitle: { fontSize: 16, color: "#666", marginBottom: 32 },
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
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "NunitoSans-Bold" },
  errorText: { color: "#dc2626", fontSize: 14, marginBottom: 8 },
});
```

---

### Step 7 — Update `frontend/app/(tabs)/account/index.tsx` with security options

Replace the placeholder account screen with one that shows a logout button and a link to change password.

```typescript
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function AccountScreen() {
  const { logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/change-password")}>
          <Text style={styles.rowText}>Change Password</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f7f7f8" },
  title: { fontSize: 26, fontFamily: "NunitoSans-Bold", marginBottom: 24 },
  section: { backgroundColor: "#fff", borderRadius: 12, marginBottom: 16, overflow: "hidden" },
  sectionTitle: { fontSize: 12, fontFamily: "NunitoSans-SemiBold", color: "#888", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#eee" },
  rowText: { fontSize: 16, color: "#111" },
  rowChevron: { fontSize: 20, color: "#aaa" },
  logoutButton: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#fca5a5" },
  logoutText: { fontSize: 16, color: "#dc2626", fontFamily: "NunitoSans-SemiBold" },
});
```

---

### Step 8 — Create `frontend/app/(tabs)/account/change-password.tsx`

```typescript
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/lib/api/client";
import { showToast } from "@/components/Toast";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      showToast("Password changed successfully");
      router.back();
    } catch (err: unknown) {
      const detail = (err as any)?.response?.data?.detail;
      if (detail === "wrong_password") {
        setError("Current password is incorrect");
      } else {
        setError("Failed to change password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Change Password</Text>

      <TextInput
        style={styles.input}
        placeholder="Current password"
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="New password"
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

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleSubmit} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Update Password</Text>}
      </Pressable>

      <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={isLoading}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#f7f7f8" },
  title: { fontSize: 24, fontFamily: "NunitoSans-Bold", marginBottom: 24 },
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
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "NunitoSans-Bold" },
  errorText: { color: "#dc2626", fontSize: 14, marginBottom: 8 },
  cancelButton: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  cancelText: { fontSize: 16, color: "#666" },
});
```

---

### What NOT to do in this ticket

- Do not remove the dev-token fetch fallback from `client.ts` — keep it for debug mode
- Do not change any existing query hooks or API functions
- Do not touch any order, inventory, collection, or report screens
- Do not add passkey/biometric enrollment — that is out of scope
- Do not implement session listing or revocation in the UI — just the change-password screen
- Do not change any backend files

---

### Verification

```bash
cd frontend
npm run build
```

Expected: 0 TypeScript errors.

Manual smoke test:
1. Set `EXPO_PUBLIC_API_DEBUG_AUTH=false` in `.env`
2. Open app — should redirect to `/login` screen
3. Enter valid phone + password (created via `POST /auth/developer/create-user`) → should log in and reach dashboard
4. Go to Account tab → tap Change Password → change password → confirm toast appears
5. Tap Sign Out → should return to login screen

---

## Merge Criteria

Merge `epic/2-authentication` to `main` only when:
- [ ] Both tickets are implemented
- [ ] `alembic upgrade head` runs clean
- [ ] `python -m pytest tests/ -v` passes with 0 failures
- [ ] `cd frontend && npm run build` passes with 0 TypeScript errors
- [ ] `POST /auth/developer/create-user` (debug mode) returns an activation code
- [ ] `POST /auth/activate` with that code + a password activates the account
- [ ] `POST /auth/login` returns access_token + refresh_token
- [ ] `POST /auth/refresh` returns a new access_token
- [ ] `POST /auth/logout` returns 204
- [ ] Frontend login screen appears when `EXPO_PUBLIC_API_DEBUG_AUTH=false`
- [ ] Successful login stores token and navigates to dashboard
- [ ] Change password screen works end-to-end
- [ ] Sign out clears tokens and returns to login screen
