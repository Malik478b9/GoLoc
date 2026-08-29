import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";

import DiscoverScreen from "../screens/traveler/DiscoverScreen";
import FindCaptainsScreen from "../screens/traveler/FindCaptainsScreen";
import CaptainProfileScreen from "../screens/traveler/CaptainProfileScreen";
import BuildMyTripScreen from "../screens/traveler/BuildMyTripScreen";
import { MyBookingsScreen } from "../screens/traveler/MyBookingsScreen";
import LiveTripScreen from "../screens/traveler/LiveTripScreen";
import MessagesScreen from "../screens/traveler/MessagesScreen";
import ProfileScreen from "../screens/traveler/ProfileScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/** Section 3.1: Explore group (Discover + Find Captains) collapsed into one stack tab. */
function ExploreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Discover" component={DiscoverScreen} />
      <Stack.Screen name="FindCaptains" component={FindCaptainsScreen} />
      <Stack.Screen name="CaptainProfile" component={CaptainProfileScreen} options={{ headerShown: true }} />
      <Stack.Screen name="BuildMyTrip" component={BuildMyTripScreen} options={{ headerShown: true }} />
    </Stack.Navigator>
  );
}

/** Section 3.1: Travel group (My Bookings -> Live Trip -> Messages). */
function TravelStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyBookings" component={MyBookingsScreen} />
      <Stack.Screen name="LiveTrip" component={LiveTripScreen} options={{ headerShown: true, title: "Live Trip" }} />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ headerShown: true }} />
    </Stack.Navigator>
  );
}

export default function TravelerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#0F766E",
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, string> = {
            Explore: "compass-outline",
            Bookings: "calendar-outline",
            Profile: "person-outline",
          };
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Explore" component={ExploreStack} />
      <Tab.Screen name="Bookings" component={TravelStack} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
