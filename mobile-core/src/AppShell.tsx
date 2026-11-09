import { PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Role } from "./api/client";
import { api } from "./api/client";
import { useAuth } from "./auth";
import { loadLanguage, useLang } from "./i18n";
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
  const [fontsLoaded] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const { signedIn, loading } = useSession();

  const langLoaded = useLang((s) => s.loaded);
  useEffect(() => {
    loadLanguage();
    useAuth.getState().init(role);
  }, [role]);
  useLanguageSync(signedIn);

  useEffect(() => {
    // Desktop browser: our fields show their own focus border, so drop the
    // browser's default black outline drawn inside them.
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = "input:focus,textarea:focus{outline:none}";
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const ready = fontsLoaded && !loading && langLoaded;
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

/**
 * Keeps the app language and the account in step: the choice made on this phone
 * wins and is saved to the account (the server uses it for AI help and itinerary
 * translations); a fresh install picks the account's language back up.
 */
function useLanguageSync(signedIn: boolean) {
  const user = useAuth((s) => s.user);
  const { lang, chosen } = useLang();
  useEffect(() => {
    if (!signedIn || !user) return;
    const server = (user as any).language as string | undefined;
    if (!chosen && server && server !== "en") {
      useLang.getState().set(server as any);
    } else if (chosen && server !== lang) {
      api.patch("/auth/me/", { language: lang }).then((me: any) => useAuth.getState().setUser(me)).catch(() => {});
    }
  }, [signedIn, user?.id, lang, chosen]); // eslint-disable-line react-hooks/exhaustive-deps
}
