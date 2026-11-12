import { Avatar, BrandMark, Card, ListItem, palette, Screen, space, T, useAuth } from "@goloc/core";
import { router } from "expo-router";
import React from "react";
import { View } from "react-native";

import { usePlace } from "../../../lib/data";

export default function Profile() {
  const { user, logout } = useAuth();
  const place = usePlace();
  return (
    <Screen back={false} noHeader>
      <T variant="display" style={{ marginTop: space.sm }}>Me</T>

      <View style={{ alignItems: "center", marginTop: space.xxl }}>
        <Avatar name={user?.full_name || "Traveler"} size={84} />
        <T variant="title" style={{ marginTop: space.lg }}>{user?.full_name || "Traveler"}</T>
        <T variant="caption" style={{ marginTop: 4 }}>{[user?.phone_number, place?.name].filter(Boolean).join(" · ")}</T>
      </View>

      <T variant="label" style={{ marginTop: space.xxl + space.sm, marginBottom: space.md }}>Account</T>
      <Card padded={false} style={{ overflow: "hidden", paddingVertical: space.xs }}>
        <ListItem icon="person-outline" title="Profile & emergency contact" subtitle="Who we call if you raise an SOS" onPress={() => router.push("/edit-profile")} />
        <ListItem icon="heart-outline" title="Saved" subtitle="Captains and trips you liked" onPress={() => router.push("/saved")} />
        <ListItem icon="gift-outline" title="Gift vouchers" subtitle="Your GoLoc balance and vouchers" onPress={() => router.push("/vouchers")} />
        <ListItem icon="notifications-outline" title="Notifications" onPress={() => router.push("/notifications")} />
      </Card>

      <T variant="label" style={{ marginTop: space.xxl, marginBottom: space.md }}>Support</T>
      <Card padded={false} style={{ overflow: "hidden", paddingVertical: space.xs }}>
        <ListItem icon="shield-checkmark-outline" title="Safety & SOS" subtitle="Emergency numbers and how protection works" onPress={() => router.push("/safety")} />
        <ListItem icon="help-buoy-outline" title="Help & disputes" onPress={() => router.push("/support")} />
      </Card>

      <Card padded={false} style={{ overflow: "hidden", marginTop: space.xxl }}>
        <ListItem icon="log-out-outline" title="Sign out" danger onPress={logout} />
      </Card>

      <BrandMark size={32} style={{ alignSelf: "center", marginTop: space.xxl + space.md }} />
      <T variant="caption" center style={{ marginTop: space.sm, color: palette.muted }}>GoLoc · Local people. Real places. Safe bookings.</T>
    </Screen>
  );
}
