/**
 * Shared HTTP client infrastructure.
 *
 * Axios instances, interceptors, authentication, health checks, and parsing utilities.
 */

import axios from "axios";
import { z } from "zod";

import { clearTokens, getStoredAccessToken, getStoredRefreshToken, storeTokens } from "@/lib/auth-storage";
import { fromMinorUnits } from "@/lib/money";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
});

const healthClient = axios.create({
  baseURL: BASE_URL,
  timeout: 2000,
});

const authClient = axios.create({
  baseURL: BASE_URL,
  timeout: 2000,
});

let lastHealthCheckAt = 0;
let lastHealthOk = true;
let devAccessToken: string | null = process.env.EXPO_PUBLIC_API_TOKEN || null;
let devAccessTokenPromise: Promise<string | null> | null = null;

async function ensureBackendHealthy() {
  const now = Date.now();
  if (now - lastHealthCheckAt < 5000) {
    return lastHealthOk;
  }
  lastHealthCheckAt = now;
  try {
    await healthClient.get("/health");
    lastHealthOk = true;
  } catch {
    lastHealthOk = false;
  }
  return lastHealthOk;
}

async function getAccessToken(): Promise<string | null> {
  if (devAccessToken) {
    return devAccessToken;
  }
  if (process.env.EXPO_PUBLIC_API_DEBUG_AUTH === "false") {
    return null;
  }
  if (!devAccessTokenPromise) {
    devAccessTokenPromise = authClient
      .get("/auth/dev-token")
      .then((response) => {
        const token = typeof response?.data?.access_token === "string" ? response.data.access_token : null;
        devAccessToken = token;
        return token;
      })
      .catch(() => null)
      .finally(() => {
        devAccessTokenPromise = null;
      });
  }
  return devAccessTokenPromise;
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function subscribeToRefresh(cb: (token: string | null) => void) {
  refreshSubscribers.push(cb);
}

function notifyRefreshSubscribers(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function isPublicAuthPath(url: string): boolean {
  return (
    url.startsWith("/auth/login") ||
    url.startsWith("/auth/refresh") ||
    url.startsWith("/auth/activate") ||
    url.startsWith("/auth/dev-token") ||
    url.startsWith("/auth/developer/")
  );
}

async function attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await authClient.post("/auth/refresh", { refresh_token: refreshToken });
    const { access_token } = response.data as { access_token?: string };
    if (typeof access_token !== "string" || !access_token) {
      await clearTokens();
      return null;
    }
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
  const needsAuthHeader = !url.startsWith("/health") && (!url.startsWith("/auth/") || !isPublicAuthPath(url));

  if (needsAuthHeader) {
    let token = await getStoredAccessToken();
    if (!token && process.env.EXPO_PUBLIC_API_DEBUG_AUTH !== "false") {
      token = await getAccessToken();
    }
    if (token) {
      const headers = axios.AxiosHeaders.from(config.headers);
      if (!headers.Authorization) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      config.headers = headers;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as
      | (typeof error.config & { _retry?: boolean; headers?: unknown })
      | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isPublicAuthPath(originalRequest.url ?? "")
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeToRefresh((token) => {
            if (!token) {
              reject(error);
              return;
            }
            const headers = axios.AxiosHeaders.from(originalRequest.headers);
            headers.set("Authorization", `Bearer ${token}`);
            originalRequest.headers = headers;
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
        const headers = axios.AxiosHeaders.from(originalRequest.headers);
        headers.set("Authorization", `Bearer ${newToken}`);
        originalRequest.headers = headers;
        return api(originalRequest);
      }

      notifyRefreshSubscribers(null);
    }

    return Promise.reject(error);
  }
);

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function parseArray<T>(schema: z.ZodType<T>, data: unknown): T[] {
  return schema.array().parse(data);
}

export function mapBalanceTransitionAmounts<T extends { component: string; before: number; after: number }>(items: T[] | null | undefined) {
  if (!Array.isArray(items)) return items;
  return items.map((item) =>
    item.component === "money"
      ? {
          ...item,
          before: fromMinorUnits(item.before),
          after: fromMinorUnits(item.after),
        }
      : item
  );
}
