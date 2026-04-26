/**
 * Thin wrapper around AsyncStorage with an in-memory cache so
 * token / userId reads can stay synchronous (identical to web's localStorage pattern).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

let cachedToken: string | null = null;
let cachedUserId: string | null = null;

/** Call once at app boot (before any API call). */
export async function initStorage(): Promise<void> {
  const [token, userId] = await AsyncStorage.multiGet(["token", "userId"]);
  cachedToken = token[1];
  cachedUserId = userId[1];
}

export function getToken(): string | null {
  return cachedToken;
}

export function getUserId(): string | null {
  return cachedUserId;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  await AsyncStorage.setItem("token", token);
}

export async function setUserId(userId: string): Promise<void> {
  cachedUserId = userId;
  await AsyncStorage.setItem("userId", userId);
}

export async function clearAuth(): Promise<void> {
  cachedToken = null;
  cachedUserId = null;
  await AsyncStorage.multiRemove(["token", "userId"]);
}
