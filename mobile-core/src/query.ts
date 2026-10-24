import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";

import { ApiError } from "./api/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // show cached data instantly, refresh in the background
      gcTime: 10 * 60_000,
      retry: (count, error) => {
        const status = (error as ApiError)?.status;
        if (status && status >= 400 && status < 500) return false; // our fault or theirs, retrying won't help
        return count < 2;
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

// Refetch stale queries when the app comes back to the foreground.
AppState.addEventListener("change", (state) => {
  if (Platform.OS !== "web") focusManager.setFocused(state === "active");
});
onlineManager.setOnline(true);
