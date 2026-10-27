import { MAX_CONTENT_WIDTH, palette, useWide } from "@goloc/core";
import { Stack } from "expo-router";

export default function AppLayout() {
  const wide = useWide();
  // Desktop: every screen is a centred column; phones use the full width.
  const content = wide
    ? { width: "100%" as const, maxWidth: MAX_CONTENT_WIDTH, alignSelf: "center" as const, backgroundColor: palette.sand }
    : { backgroundColor: palette.sand };
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: content }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="reels" options={{ animation: "fade", contentStyle: { backgroundColor: "#000" } }} />
      <Stack.Screen name="build-trip" options={{ animation: "slide_from_bottom" }} />
    </Stack>
  );
}
