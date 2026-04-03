import React, { createContext, useContext, useEffect, useState } from "react";

import {
  clearTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  storeTokens,
  subscribeToTokens,
} from "@/lib/auth-storage";

type AuthState = {
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    getStoredAccessToken().then((token) => {
      if (!isMounted) return;
      setAccessToken(token);
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
