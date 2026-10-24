import { ConversationList, palette, space, T } from "@goloc/core";
import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Inbox() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <T variant="title">Messages</T>
      </View>
      <ConversationList emptyBody="Travelers can message you from your profile. Reply fast — it helps you win bookings." />
    </SafeAreaView>
  );
}
