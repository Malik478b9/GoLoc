import { Ionicons } from "@expo/vector-icons";
import { Button, Empty, IconButton, palette, radius, Row, Section, Sheet, Skeleton, space, T, toastError, useAuth, useUnreadCount } from "@goloc/core";
import { router } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CaptainRow, CategoryTile, ReelTile } from "../../../lib/cards";
import { changeCity, useCities, useCity, useDiscovery, useFeed } from "../../../lib/data";

const CATEGORIES = ["food", "heritage", "culture", "adventure", "photography", "nature", "shopping", "spiritual"];

export default function Discover() {
  const user = useAuth((s) => s.user);
  const city = useCity();
  const cities = useCities();
  const unread = useUnreadCount();
  const feed = useFeed(city?.slug);
  const top = useDiscovery({ city: city?.slug, page_size: "6" });
  const [cityOpen, setCityOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const first = (user?.full_name || "").split(" ")[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const posts = feed.data?.results ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.rickshaw}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([feed.refetch(), top.refetch()]);
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={styles.top}>
          <Pressable onPress={() => setCityOpen(true)} style={styles.cityBtn}>
            <Ionicons name="location" size={16} color={palette.rickshaw} />
            <T variant="bodyBold">{city?.name ?? "Choose city"}</T>
            <Ionicons name="chevron-down" size={14} color={palette.ink2} />
          </Pressable>
          <Row>
            <IconButton name="shield-checkmark-outline" onPress={() => router.push("/safety")} accessibilityLabel="Safety" />
            <IconButton name="notifications-outline" badge={unread.data} onPress={() => router.push("/notifications")} accessibilityLabel="Notifications" />
          </Row>
        </View>

        <View style={{ paddingHorizontal: space.lg }}>
          <T variant="label" color={palette.rickshaw}>{greet}{first ? `, ${first}` : ""}</T>
          <T variant="display" style={{ marginTop: 4 }}>Where will a local take you next?</T>

          <Pressable onPress={() => router.push("/explore")} style={styles.search}>
            <Ionicons name="search" size={18} color={palette.muted} />
            <T variant="body" color={palette.muted} style={{ flex: 1 }}>Search Captains, food trails, CAP-ID…</T>
          </Pressable>

          <Pressable onPress={() => router.push("/build-trip")} style={styles.buildCard}>
            <View style={{ flex: 1 }}>
              <T variant="h2" color={palette.white}>Build my trip</T>
              <T variant="small" color="#D6E6E1" style={{ marginTop: 2 }}>Hire a Captain who does everything, or plan it yourself with a local guide. Pick your arrival and return; we find your match.</T>
            </View>
            <View style={styles.buildArrow}><Ionicons name="arrow-forward" size={20} color={palette.night} /></View>
          </Pressable>
        </View>

        <Section title="Reels from Captains" action={posts.length ? "Watch all" : undefined} onAction={() => router.push({ pathname: "/reels", params: { city: city?.slug, start: "0" } })} style={{ paddingHorizontal: space.lg }}>
          <View />
        </Section>
        {feed.isLoading ? (
          <Row style={{ paddingHorizontal: space.lg }} gap={10}>{[0, 1, 2].map((i) => <Skeleton key={i} w={132} h={220} r={14} />)}</Row>
        ) : posts.length ? (
          <FlatList
            horizontal
            data={posts}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.lg, gap: 10 }}
            renderItem={({ item, index }) => <ReelTile p={item} onPress={() => router.push({ pathname: "/reels", params: { city: city?.slug, start: String(index) } })} />}
          />
        ) : (
          <T variant="caption" style={{ paddingHorizontal: space.lg }}>No reels in {city?.name} yet — Captains post here as they join.</T>
        )}

        <Section title="What are you into?" style={{ paddingHorizontal: space.lg }}>
          <View style={styles.categories}>
            {CATEGORIES.map((c) => <CategoryTile key={c} value={c} onPress={() => router.push({ pathname: "/explore", params: { category: c } })} />)}
          </View>
        </Section>

        <Section title={`Captains locals trust in ${city?.name ?? ""}`} action="See all" onAction={() => router.push("/explore")} style={{ paddingHorizontal: space.lg }}>
          {top.isLoading ? (
            <View style={{ gap: 10 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={86} r={20} />)}</View>
          ) : (top.data?.results ?? []).length ? (
            <View style={{ gap: 10 }}>{top.data!.results.map((c) => <CaptainRow key={c.id} c={c} />)}</View>
          ) : (
            <Empty icon="people-outline" title="No Captains live here yet" body="Try another city — we're onboarding locals every week." action="Change city" onAction={() => setCityOpen(true)} />
          )}
        </Section>

        <View style={[styles.trust, { marginHorizontal: space.lg }]}>
          {[
            ["shield-checkmark", "Verified Captains", "ID, licence & background checked"],
            ["medkit", "Insured trips", "Every paid booking has its own cover"],
            ["warning", "SOS on every trip", "Safety team + nearby police & hospitals"],
          ].map(([i, t, b]) => (
            <Row key={t} gap={12} style={{ paddingVertical: 8 }}>
              <Ionicons name={i as any} size={20} color={palette.rickshaw} />
              <View style={{ flex: 1 }}>
                <T variant="bodyBold">{t}</T>
                <T variant="caption">{b}</T>
              </View>
            </Row>
          ))}
        </View>
      </ScrollView>

      <Sheet visible={cityOpen} onClose={() => setCityOpen(false)} title="Choose a city">
        <ScrollView style={{ maxHeight: 420 }}>
          {(cities.data ?? []).map((c) => (
            <Pressable
              key={c.id}
              onPress={async () => {
                setCityOpen(false);
                try {
                  await changeCity(c.id);
                } catch (e) {
                  toastError(e);
                }
              }}
              style={styles.cityRow}
            >
              <View style={{ flex: 1 }}>
                <T variant="bodyBold">{c.name}</T>
                <T variant="caption">{c.state}</T>
              </View>
              {c.id === city?.id ? <Ionicons name="checkmark-circle" size={22} color={palette.rickshaw} /> : null}
            </Pressable>
          ))}
        </ScrollView>
        <Button title="Close" kind="ghost" onPress={() => setCityOpen(false)} />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.sm },
  cityBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.paper, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.white, borderRadius: radius.md, paddingHorizontal: space.lg, height: 52, marginTop: space.lg, borderWidth: 1, borderColor: palette.line },
  buildCard: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.night, borderRadius: radius.lg, padding: space.lg, marginTop: space.md },
  buildArrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.marigold, alignItems: "center", justifyContent: "center" },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  trust: { marginTop: space.xxl, padding: space.lg, backgroundColor: palette.rickshawSoft, borderRadius: radius.lg },
  cityRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
});
