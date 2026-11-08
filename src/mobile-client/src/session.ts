import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import type { MobileSession } from "./types";
type BrowserStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
const browser = globalThis as unknown as {
  localStorage: BrowserStorage;
  sessionStorage: BrowserStorage;
};
const SESSION_KEY = "fithub.mobile.session";
export async function deviceId() {
  const key = "fithub.mobile.device";
  let value =
    Platform.OS === "web"
      ? browser.localStorage.getItem(key)
      : await SecureStore.getItemAsync(key);
  if (!value) {
    value = Crypto.randomUUID();
    if (Platform.OS === "web") browser.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  }
  return value;
}
export async function saveSession(baseUrl: string, session: MobileSession) {
  const value = JSON.stringify({
    baseUrl,
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
  });
  if (Platform.OS === "web") browser.sessionStorage.setItem(SESSION_KEY, value);
  else await SecureStore.setItemAsync(SESSION_KEY, value);
}
export async function loadSession(): Promise<{
  baseUrl: string;
  accessToken: string;
  expiresAt: string;
} | null> {
  const raw =
    Platform.OS === "web"
      ? browser.sessionStorage.getItem(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      typeof value.accessToken !== "string" ||
      typeof value.baseUrl !== "string" ||
      !Number.isFinite(Date.parse(value.expiresAt))
    )
      throw Error();
    return value;
  } catch {
    await clearSession();
    return null;
  }
}
export async function clearSession() {
  if (Platform.OS === "web") browser.sessionStorage.removeItem(SESSION_KEY);
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}
