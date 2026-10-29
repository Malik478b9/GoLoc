import { Avatar, Badge, Card, Divider, ListItem, palette, Screen, space, T, useAuth } from "@goloc/core";
import { router } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useAgency, useProfile } from "../../../lib/data";

export default function Account() {
  const { user, logout } = useAuth();
  const profile = useProfile();
  const membership = useAgency();
  const p = profile.data;
  const agency = p?.agency;
  const invites = membership.data?.invites.length ?? 0;
  return (
    <Screen back={false} title="Account" onRefresh={profile.refetch}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar uri={p?.avatar} name={p?.full_name || user?.full_name || "Captain"} size={56} verified={p?.review_status === "approved"} />
        <View style={{ flex: 1 }}>
          <T variant="h2">{p?.full_name || user?.full_name}</T>
          <T variant="caption">{p ? `${p.code} · ${p.city_name}` : user?.phone_number}</T>
        </View>
        {p ? <Badge label={p.review_status === "approved" ? "Verified" : p.review_status === "pending" ? "In review" : "Setup"} bg={p.review_status === "approved" ? palette.successSoft : palette.warningSoft} fg={p.review_status === "approved" ? palette.success : palette.warning} /> : null}
      </Card>

      <T variant="label" style={{ marginTop: space.xl, marginBottom: space.sm }}>Business setup</T>
      <Card padded={false} style={{ overflow: "hidden" }}>
        <ListItem
          icon="business-outline"
          title={agency ? agency.name : "Agency"}
          subtitle={agency ? "You work for this agency" : invites ? `${invites} invite${invites > 1 ? "s" : ""} waiting` : "Independent · join an agency"}
          onPress={() => router.push("/agency")}
        />
        <Divider />
        <ListItem icon="checkbox-outline" title="Go-live checklist" onPress={() => router.push("/checklist")} />
        <Divider />
        <ListItem icon="person-outline" title="Business profile" subtitle="Photo, bio, languages, specialties" onPress={() => router.push("/setup/profile")} />
        <Divider />
        <ListItem icon="pricetags-outline" title="Services & pricing" subtitle={agency ? `Set by ${agency.name}` : "Day experiences, guide days and packages"} onPress={() => router.push("/setup/services")} />
        <Divider />
        <ListItem icon="document-text-outline" title="Itineraries" subtitle="AI day-by-day plans and posters for your trips" onPress={() => router.push("/itineraries")} />
        <Divider />
        <ListItem icon="car-outline" title="Vehicles" subtitle={agency ? `Cars from ${agency.name}` : "Optional for local guides"} onPress={() => router.push("/setup/vehicles")} />
        <Divider />
        <ListItem icon="shield-checkmark-outline" title="Verification documents" onPress={() => router.push("/setup/documents")} />
        <Divider />
        <ListItem icon="calendar-outline" title="Availability" subtitle="Weekly hours, days off, daily capacity" onPress={() => router.push("/setup/availability")} />
      </Card>

      <T variant="label" style={{ marginTop: space.xl, marginBottom: space.sm }}>Money & growth</T>
      <Card padded={false} style={{ overflow: "hidden" }}>
        <ListItem icon="wallet-outline" title="Earnings & payouts" onPress={() => router.push("/earnings")} />
        <Divider />
        {!agency ? <ListItem icon="card-outline" title="Payout account" subtitle="UPI or bank" onPress={() => router.push("/setup/payout")} /> : null}
        <Divider />
        <ListItem icon="star-outline" title="Reviews" onPress={() => router.push("/reviews")} />
      </Card>

      <T variant="label" style={{ marginTop: space.xl, marginBottom: space.sm }}>Support</T>
      <Card padded={false} style={{ overflow: "hidden" }}>
        <ListItem icon="notifications-outline" title="Notifications" onPress={() => router.push("/notifications")} />
        <Divider />
        <ListItem icon="help-buoy-outline" title="Help & disputes" onPress={() => router.push("/support")} />
        <Divider />
        <ListItem icon="log-out-outline" title="Sign out" danger onPress={logout} />
      </Card>
      <T variant="caption" center style={{ marginTop: space.xl }}>GoLoc Captain · Your city. Your business. Your income.</T>
    </Screen>
  );
}
