import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";

import CaptainDashboardScreen from "../screens/captain/CaptainDashboardScreen";
import VerificationScreen from "../screens/captain/VerificationScreen";
import ServicesPricingScreen from "../screens/captain/ServicesPricingScreen";
import AvailabilityScreen from "../screens/captain/AvailabilityScreen";
import RequestsScreen from "../screens/captain/RequestsScreen";
import EarningsScreen from "../screens/captain/EarningsScreen";
import MessagesScreen from "../screens/traveler/MessagesScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/** Section 4.1: Overview + Business setup. */
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={CaptainDashboardScreen} />
      <Stack.Screen name="Verification" component={VerificationScreen} options={{ headerShown: true }} />
      <Stack.Screen name="BusinessProfile" component={ServicesPricingScreen} options={{ headerShown: true }} />
    </Stack.Navigator>
  );
}

/** Section 4.1: Operate group. */
function OperateStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Requests" component={RequestsScreen} />
      <Stack.Screen name="Availability" component={AvailabilityScreen} options={{ headerShown: true }} />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ headerShown: true }} />
    </Stack.Navigator>
  );
}

export default function CaptainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#C2410C",
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, string> = {
            Home: "home-outline",
            Operate: "briefcase-outline",
            Pricing: "pricetag-outline",
            Earnings: "wallet-outline",
          };
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Operate" component={OperateStack} />
      <Tab.Screen name="Pricing" component={ServicesPricingScreen} />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
    </Tab.Navigator>
  );
}
