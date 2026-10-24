import { AppShell, useSession } from "@goloc/core";
import { Stack } from "expo-router";

function RootStack() {
  const { signedIn } = useSession();
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Root() {
  return (
    <AppShell role="captain">
      <RootStack />
    </AppShell>
  );
}
