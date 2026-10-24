import { api, Avatar, Button, CaptainDetail, Empty, Loading, money, palette, Rating, Row, Screen, space, T, titleCase } from "@goloc/core";
import { useQueries } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { useCompare } from "../../lib/data";

const ROWS: [string, (c: CaptainDetail) => React.ReactNode][] = [
  ["Rating", (c) => <Rating value={c.rating_avg} count={c.rating_count} />],
  ["Trips done", (c) => <T variant="bodyBold">{c.trips_completed}</T>],
  ["Experience", (c) => <T>{c.years_experience} yrs</T>],
  ["From", (c) => <T variant="bodyBold">{money(c.from_price)}</T>],
  ["Packages", (c) => <T>{c.has_package ? "Yes" : "—"}</T>],
  ["Languages", (c) => <T variant="small">{c.languages.join(", ")}</T>],
  ["Specialties", (c) => <T variant="small">{c.categories.map(titleCase).join(", ")}</T>],
  ["Vehicle", (c) => <T variant="small">{c.vehicles.map((v) => `${v.make_model}${v.has_ac ? " · AC" : ""}`).join(", ") || "—"}</T>],
];

export default function Compare() {
  const { ids, toggle } = useCompare();
  const results = useQueries({ queries: ids.map((id) => ({ queryKey: ["captain", id], queryFn: () => api.get<CaptainDetail>(`/captains/${id}/`) })) });
  if (!ids.length) return <Screen title="Compare"><Empty icon="git-compare-outline" title="Nothing to compare" body="Tap the compare icon on up to 3 Captains." action="Find Captains" onAction={() => router.replace("/explore")} /></Screen>;
  if (results.some((r) => r.isLoading)) return <Loading />;
  const captains = results.map((r) => r.data).filter(Boolean) as CaptainDetail[];
  const colW = 150;

  return (
    <Screen title="Compare Captains" padded={false}>
      <ScrollView horizontal contentContainerStyle={{ padding: space.lg }}>
        <View>
          <Row style={styles.row} gap={0}>
            <View style={styles.label} />
            {captains.map((c) => (
              <View key={c.id} style={[styles.cell, { width: colW, alignItems: "center", gap: 6 }]}>
                <Avatar uri={c.avatar} name={c.name} size={52} verified={c.verified} />
                <T variant="bodyBold" center numberOfLines={1}>{c.name}</T>
                <T variant="caption">{c.code}</T>
              </View>
            ))}
          </Row>
          {ROWS.map(([label, render], i) => (
            <Row key={label} style={[styles.row, i % 2 === 0 && { backgroundColor: palette.paper }]} gap={0}>
              <View style={styles.label}><T variant="label">{label}</T></View>
              {captains.map((c) => <View key={c.id} style={[styles.cell, { width: colW }]}>{render(c)}</View>)}
            </Row>
          ))}
          <Row style={styles.row} gap={0}>
            <View style={styles.label} />
            {captains.map((c) => (
              <View key={c.id} style={[styles.cell, { width: colW, gap: 6 }]}>
                <Button title="View & book" small onPress={() => router.push(`/captain/${c.id}`)} />
                <Button title="Remove" small kind="ghost" onPress={() => toggle(c.id)} />
              </View>
            ))}
          </Row>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "stretch", borderRadius: 10 },
  label: { width: 96, paddingVertical: 12, paddingRight: 8, justifyContent: "center" },
  cell: { paddingVertical: 12, paddingHorizontal: 8, justifyContent: "center" },
});
