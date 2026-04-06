import React, { createContext, useContext, useEffect, useState } from "react";

import {
  clearTokens,
  clearMustChangePassword,
  getMustChangePassword,
  getStoredAccessToken,
  getStoredRefreshToken,
  storeMustChangePassword,
  storeTokens,
  subscribeToTokens,
} from "@/lib/auth-storage";

type AuthState = {
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  clearMustChangePassword: () => Promise<void>;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getStoredAccessToken().then(async (token) => {
      if (!isMounted) return;
      setAccessToken(token);
      const flag = await getMustChangePassword();
      if (!isMounted) return;
      setMustChangePassword(flag);
      setIsLoading(false);
    });

    const unsubscribe = subscribeToTokens((nextAccessToken) => {
      setAccessToken(nextAccessToken);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  async function login(phone: string, password: string): Promise<void> {
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
    const mustChange = data.must_change_password ?? false;
    await storeMustChangePassword(mustChange);
    setMustChangePassword(mustChange);
    setAccessToken(data.access_token);
  }

  async function logout(): Promise<void> {
    const refreshToken = await getStoredRefreshToken();
    if (refreshToken) {
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
    setMustChangePassword(false);
  }

  async function setTokens(newAccessToken: string, refreshToken: string): Promise<void> {
    await storeTokens(newAccessToken, refreshToken);
    setAccessToken(newAccessToken);
  }

  async function handleClearMustChangePassword(): Promise<void> {
    await clearMustChangePassword();
    setMustChangePassword(false);
  }

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken,
        isLoading,
        mustChangePassword,
        clearMustChangePassword: handleClearMustChangePassword,
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
