import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { fetchMe, verifyOTP } from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  hydrate: () => Promise<void>;
  loginWithOTP: (params: {
    phone_number: string;
    code: string;
    role?: string;
    full_name?: string;
    primary_city_id?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  hydrate: async () => {
    const token = await AsyncStorage.getItem("access_token");
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const { data } = await fetchMe();
      set({ user: data, isLoading: false });
    } catch {
      await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
      set({ user: null, isLoading: false });
    }
  },

  loginWithOTP: async (params) => {
    const { data } = await verifyOTP(params);
    await AsyncStorage.setItem("access_token", data.access);
    await AsyncStorage.setItem("refresh_token", data.refresh);
    set({ user: data.user });
    return data.user as User;
  },

  logout: async () => {
    await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
    set({ user: null });
  },
}));
