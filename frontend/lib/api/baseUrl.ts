import Constants, { ExecutionEnvironment } from "expo-constants";

function parseUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function getExpoDevHost() {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split("/")[0]?.split(":")[0]?.trim();
  return host || null;
}

function normalizePathname(pathname?: string | null) {
  if (!pathname || pathname === "/") return "";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function getApiBaseUrl() {
  const envValue = process.env.EXPO_PUBLIC_API_URL?.trim();
  const parsedEnv = parseUrl(envValue);
  const expoDevHost =
    __DEV__ && Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      ? getExpoDevHost()
      : null;

  if (expoDevHost) {
    const protocol = parsedEnv?.protocol ?? "http:";
    const port = parsedEnv?.port || "8000";
    const pathname = normalizePathname(parsedEnv?.pathname);
    return `${protocol}//${expoDevHost}:${port}${pathname}`;
  }

  return envValue || "http://localhost:8000";
}

export const API_BASE_URL = getApiBaseUrl();
