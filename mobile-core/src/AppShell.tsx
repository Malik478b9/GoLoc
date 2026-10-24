import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from "@expo-google-fonts/manrope";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Role } from "./api/client";
import { useAuth } from "./auth";
import { usePushNotifications } from "./hooks";
import { queryClient } from "./query";
import { accents, palette } from "./theme";
import { ToastHost } from "./ui/feedback";
import { AccentContext } from "./ui/primitives";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Session state for the root navigator's Stack.Protected guards. */
export function useSession() {
  const status = useAuth((s) => s.status);
  return { signedIn: status === "signedIn", loading: status === "loading" };
}

/**
 * Root providers for both apps. Holds the splash screen until fonts and the
 * stored session are ready, so the first frame is already the right screen.
 */
export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold });
  const { signedIn, loading } = useSession();

  useEffect(() => {
    useAuth.getState().init(role);
  }, [role]);

  const ready = fontsLoaded && !loading;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  usePushNotifications(signedIn);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AccentContext.Provider value={accents[role]}>
          <StatusBar style="dark" />
          <View style={{ flex: 1, backgroundColor: palette.sand }}>
            {ready ? children : null}
            <ToastHost />
          </View>
        </AccentContext.Provider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
