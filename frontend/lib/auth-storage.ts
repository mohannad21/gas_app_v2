import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "auth_access_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";
const MUST_CHANGE_PASSWORD_KEY = "auth_must_change_password";

type TokenListener = (accessToken: string | null, refreshToken: string | null) => void;

const listeners = new Set<TokenListener>();

function notifyListeners(accessToken: string | null, refreshToken: string | null) {
  listeners.forEach((listener) => listener(accessToken, refreshToken));
}

export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  notifyListeners(accessToken, refreshToken);
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
  await SecureStore.deleteItemAsync(MUST_CHANGE_PASSWORD_KEY);
  notifyListeners(null, null);
}

export function subscribeToTokens(listener: TokenListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

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
