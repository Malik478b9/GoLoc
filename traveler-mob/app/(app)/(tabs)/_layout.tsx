import { Ionicons } from "@expo/vector-icons";
import { api, Conversation, fonts, Paginated, palette, useUnreadCount, useWide } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, focused }: { color: ColorValue; focused: boolean }) => (
  <Ionicons name={(focused ? name : `${name}-outline`) as any} size={23} color={color as string} />
);

export default function TabsLayout() {
  useUnreadCount();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const chats = useQuery({ queryKey: ["conversations"], queryFn: () => api.get<Paginated<Conversation>>("/chat/"), refetchInterval: 30000 });
  const unreadChats = (chats.data?.results ?? []).reduce((n, c) => n + c.unread, 0);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.rickshaw,
        tabBarInactiveTintColor: palette.muted,
        // Desktop: a labelled sidebar on the left. Phone: the usual bottom tab bar.
        tabBarPosition: wide ? "left" : "bottom",
        tabBarVariant: wide ? "material" : "uikit",
        tabBarLabelPosition: wide ? "beside-icon" : "below-icon",
        tabBarStyle: wide
          ? { backgroundColor: palette.paper, borderRightColor: palette.line, minWidth: 200, paddingTop: 24 }
          : { backgroundColor: palette.paper, borderTopColor: palette.line, height: insets.bottom ? 58 + insets.bottom : 64, paddingTop: 6, paddingBottom: insets.bottom },
        tabBarLabelStyle: wide ? { fontFamily: fonts.bold, fontSize: 14 } : { fontFamily: fonts.bold, fontSize: 11, marginBottom: insets.bottom ? 0 : 6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Discover", tabBarIcon: icon("compass") }} />
      <Tabs.Screen name="explore" options={{ title: "Captains", tabBarIcon: icon("search") }} />
      <Tabs.Screen name="trips" options={{ title: "Trips", tabBarIcon: icon("map") }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: icon("chatbubbles"), tabBarBadge: unreadChats || undefined }} />
      <Tabs.Screen name="profile" options={{ title: "Me", tabBarIcon: icon("person") }} />
    </Tabs>
  );
}
