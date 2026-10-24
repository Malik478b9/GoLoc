import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="reels" options={{ animation: "fade", contentStyle: { backgroundColor: "#000" } }} />
      <Stack.Screen name="build-trip" options={{ animation: "slide_from_bottom" }} />
    </Stack>
  );
}
