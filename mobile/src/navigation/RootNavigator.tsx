import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import RoleSelectScreen from "../screens/auth/RoleSelectScreen";
import { PhoneEntryScreen, OTPVerifyScreen } from "../screens/auth/PhoneAuthScreens";
import TravelerTabs from "./TravelerTabs";
import CaptainTabs from "./CaptainTabs";
import { useAuthStore } from "../store/authStore";

const Stack = createNativeStackNavigator();

/**
 * Dual-tagline registration UX rule (Section 1) lives in RoleSelectScreen.
 * Once useAuthStore().user is populated, we route straight to the correct
 * role's tab navigator — Traveler and Captain never share a tab bar.
 */
export default function RootNavigator() {
  const { user, isLoading, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
          <Stack.Screen name="PhoneEntry" component={PhoneEntryScreen} options={{ headerShown: true, title: "" }} />
          <Stack.Screen name="OTPVerify" component={OTPVerifyScreen} options={{ headerShown: true, title: "" }} />
        </Stack.Navigator>
      ) : user.role === "captain" ? (
        <CaptainTabs />
      ) : (
        <TravelerTabs />
      )}
    </NavigationContainer>
  );
}
