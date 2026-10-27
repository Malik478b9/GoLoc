import { Platform } from "react-native";

/**
 * Small key-value store for tokens and the cached profile.
 * Phones: the OS keychain/keystore (expo-secure-store).
 * Desktop browser: localStorage (secure-store has no web implementation).
 */
const web = Platform.OS === "web";
// Required only on phones: expo-secure-store has no web build and throws when loaded in a browser.
const SecureStore: typeof import("expo-secure-store") | null = web ? null : require("expo-secure-store");

export const storage = {
  async get(key: string): Promise<string | null> {
    if (web) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore!.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (web) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // private mode / storage blocked: the session just won't survive a reload
      }
      return;
    }
    await SecureStore!.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (web) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    await SecureStore!.deleteItemAsync(key);
  },
};
