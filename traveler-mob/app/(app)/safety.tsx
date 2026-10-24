import { Ionicons } from "@expo/vector-icons";
import { api, Button, Card, EmergencyList, EmergencyService, palette, Row, Screen, Section, SkeletonList, space, T } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Linking, View } from "react-native";

import { useCity } from "../../lib/data";

export default function Safety() {
  const city = useCity();
  const q = useQuery({ queryKey: ["emergency", city?.slug], queryFn: () => api.get<EmergencyService[]>("/trips/emergency/", { city: city?.slug }) });
  return (
    <Screen title="Safety & SOS" onRefresh={q.refetch}>
      <Card style={{ backgroundColor: palette.coralSoft }}>
        <Row gap={10}><Ionicons name="warning" size={22} color={palette.coral} /><T variant="h2" color={palette.coral}>In danger right now?</T></Row>
        <T style={{ marginTop: 4 }}>Call 112 — India's single emergency number for police, fire and ambulance.</T>
        <Button title="Call 112" icon="call" kind="danger" onPress={() => Linking.openURL("tel:112")} style={{ marginTop: space.md }} />
      </Card>

      <Section title="How GoLoc protects you">
        {[
          ["card", "Pay in-app to be protected", "Trip insurance, live tracking and SOS switch on only for bookings paid through GoLoc."],
          ["key", "Trip PIN", "Your trip starts only when you give your Captain the 4-digit PIN in person."],
          ["navigate", "Live location", "During a trip your Captain's position is shared with you and our safety team."],
          ["share-social", "Share with family", "Send a live link from your booking — no app needed to follow along."],
          ["alert-circle", "SOS", "One tap alerts our safety team with your location and your Captain is notified."],
        ].map(([icon, title, body]) => (
          <Row key={title} gap={12} style={{ alignItems: "flex-start", marginBottom: space.md }}>
            <Ionicons name={icon as any} size={20} color={palette.rickshaw} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T variant="bodyBold">{title}</T>
              <T variant="caption">{body}</T>
            </View>
          </Row>
        ))}
      </Section>

      <Section title={`Emergency numbers${city ? ` · ${city.name}` : ""}`}>
        {q.isLoading ? <SkeletonList rows={3} /> : <EmergencyList items={q.data ?? []} />}
      </Section>
      <Button title="Set your emergency contact" kind="secondary" icon="person-add" onPress={() => router.push("/edit-profile")} style={{ marginTop: space.lg }} />
    </Screen>
  );
}
