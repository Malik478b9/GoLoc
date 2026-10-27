import { create } from "zustand";

import { api, clearTokens, configureClient, getRefreshToken, loadTokens, Role, saveTokens } from "./api/client";
import type { User } from "./api/types";
import { queryClient } from "./query";
import { storage } from "./storage";

type Status = "loading" | "signedOut" | "signedIn";

type AuthState = {
  role: Role;
  status: Status;
  user: User | null;
  init: (role: Role) => Promise<void>;
  /** signin: the number must have an account. signup: name is collected first. */
  requestOtp: (phone: string, intent?: "signin" | "signup") => Promise<{ phone_number: string; resend_in: number; is_new?: boolean; dev_code?: string }>;
  verifyOtp: (phone: string, code: string, fullName?: string) => Promise<{ created: boolean }>;
  refreshMe: () => Promise<void>;
  setUser: (u: User) => void;
  logout: () => Promise<void>;
  /** Last number signed in with on this device, so signing back in is just "send code". */
  lastPhone: () => Promise<string | null>;
};

const userKey = (role: Role) => `goloc.${role}.user`;
const lastPhoneKey = (role: Role) => `goloc.${role}.lastPhone`;

export const useAuth = create<AuthState>((set, get) => ({
  role: "traveler",
  status: "loading",
  user: null,

  init: async (role) => {
    configureClient(role, () => {
      queryClient.clear();
      set({ status: "signedOut", user: null });
    });
    set({ role });
    const hasToken = await loadTokens();
    if (!hasToken) return set({ status: "signedOut" });
    // Render instantly from the cached profile; refresh it in the background.
    const cached = await storage.get(userKey(role));
    if (cached) set({ status: "signedIn", user: JSON.parse(cached) });
    try {
      await get().refreshMe();
      set({ status: "signedIn" });
    } catch (e: any) {
      if (!cached || e?.status === 401) set({ status: "signedOut", user: null });
    }
  },

  requestOtp: (phone, intent) => api.post("/auth/otp/request/", { phone_number: phone, role: get().role, intent }),

  verifyOtp: async (phone, code, fullName) => {
    const data = await api.post<{ access: string; refresh: string; user: User; created: boolean }>("/auth/otp/verify/", {
      phone_number: phone,
      code,
      role: get().role,
      full_name: fullName || undefined,
    });
    await saveTokens(data.access, data.refresh);
    await storage.set(userKey(get().role), JSON.stringify(data.user));
    await storage.set(lastPhoneKey(get().role), phone.slice(-10));
    set({ status: "signedIn", user: data.user });
    return { created: data.created };
  },

  refreshMe: async () => {
    const me = await api.get<User>("/auth/me/");
    await storage.set(userKey(get().role), JSON.stringify(me));
    set({ user: me });
  },

  setUser: (u) => {
    storage.set(userKey(get().role), JSON.stringify(u));
    set({ user: u });
  },

  lastPhone: () => storage.get(lastPhoneKey(get().role)),

  logout: async () => {
    const refresh = await getRefreshToken();
    if (refresh) api.post("/auth/logout/", { refresh }).catch(() => {});
    await clearTokens();
    await storage.remove(userKey(get().role));
    queryClient.clear();
    set({ status: "signedOut", user: null });
  },
}));
