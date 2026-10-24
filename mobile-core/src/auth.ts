import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import { api, clearTokens, configureClient, getRefreshToken, loadTokens, Role, saveTokens } from "./api/client";
import type { User } from "./api/types";
import { queryClient } from "./query";

type Status = "loading" | "signedOut" | "signedIn";

type AuthState = {
  role: Role;
  status: Status;
  user: User | null;
  init: (role: Role) => Promise<void>;
  requestOtp: (phone: string) => Promise<{ phone_number: string; resend_in: number; dev_code?: string }>;
  verifyOtp: (phone: string, code: string, fullName?: string) => Promise<{ created: boolean }>;
  refreshMe: () => Promise<void>;
  setUser: (u: User) => void;
  logout: () => Promise<void>;
};

const userKey = (role: Role) => `goloc.${role}.user`;

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
    const cached = await SecureStore.getItemAsync(userKey(role));
    if (cached) set({ status: "signedIn", user: JSON.parse(cached) });
    try {
      await get().refreshMe();
      set({ status: "signedIn" });
    } catch (e: any) {
      if (!cached || e?.status === 401) set({ status: "signedOut", user: null });
    }
  },

  requestOtp: (phone) => api.post("/auth/otp/request/", { phone_number: phone, role: get().role }),

  verifyOtp: async (phone, code, fullName) => {
    const data = await api.post<{ access: string; refresh: string; user: User; created: boolean }>("/auth/otp/verify/", {
      phone_number: phone,
      code,
      role: get().role,
      full_name: fullName || undefined,
    });
    await saveTokens(data.access, data.refresh);
    await SecureStore.setItemAsync(userKey(get().role), JSON.stringify(data.user));
    set({ status: "signedIn", user: data.user });
    return { created: data.created };
  },

  refreshMe: async () => {
    const me = await api.get<User>("/auth/me/");
    await SecureStore.setItemAsync(userKey(get().role), JSON.stringify(me));
    set({ user: me });
  },

  setUser: (u) => {
    SecureStore.setItemAsync(userKey(get().role), JSON.stringify(u));
    set({ user: u });
  },

  logout: async () => {
    const refresh = await getRefreshToken();
    if (refresh) api.post("/auth/logout/", { refresh }).catch(() => {});
    await clearTokens();
    await SecureStore.deleteItemAsync(userKey(get().role));
    queryClient.clear();
    set({ status: "signedOut", user: null });
  },
}));
