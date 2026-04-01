/**
 * Shared HTTP client infrastructure.
 *
 * Axios instances, interceptors, authentication, health checks, and parsing utilities.
 */

import axios from "axios";
import { z } from "zod";
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

api.interceptors.request.use(async (config) => {
  (config as any).metadata = { start: Date.now() };
  void ensureBackendHealthy();
  const url = config.url ?? "";
  if (!url.startsWith("/health") && !url.startsWith("/auth/")) {
    const token = await getAccessToken();
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
  (error) => Promise.reject(error)
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
