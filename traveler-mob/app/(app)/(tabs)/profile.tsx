import { Avatar, Card, Divider, ListItem, palette, Screen, space, T, useAuth } from "@goloc/core";
import { router } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useCity } from "../../../lib/data";

export default function Profile() {
  const { user, logout } = useAuth();
  const city = useCity();
  return (
    <Screen back={false} title="Me">
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar name={user?.full_name || "Traveler"} size={56} />
        <View style={{ flex: 1 }}>
          <T variant="h2">{user?.full_name || "Traveler"}</T>
          <T variant="caption">{user?.phone_number} · {city?.name}</T>
        </View>
      </Card>

      <Card padded={false} style={{ marginTop: space.lg, overflow: "hidden" }}>
        <ListItem icon="person-outline" title="Profile & emergency contact" subtitle="Who we call if you raise an SOS" onPress={() => router.push("/edit-profile")} />
        <Divider />
        <ListItem icon="heart-outline" title="Saved Captains" onPress={() => router.push("/saved")} />
        <Divider />
        <ListItem icon="notifications-outline" title="Notifications" onPress={() => router.push("/notifications")} />
        <Divider />
        <ListItem icon="shield-checkmark-outline" title="Safety & SOS" subtitle="Emergency numbers and how protection works" onPress={() => router.push("/safety")} />
        <Divider />
        <ListItem icon="help-buoy-outline" title="Help & disputes" onPress={() => router.push("/support")} />
      </Card>

      <Card padded={false} style={{ marginTop: space.lg, overflow: "hidden" }}>
        <ListItem icon="log-out-outline" title="Sign out" danger onPress={logout} />
      </Card>
      <T variant="caption" center style={{ marginTop: space.xl, color: palette.muted }}>GoLoc · Local people. Real places. Safe bookings.</T>
    </Screen>
  );
}
