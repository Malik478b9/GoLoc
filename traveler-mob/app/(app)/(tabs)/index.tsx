import { Ionicons } from "@expo/vector-icons";
import {
  Appear, Empty, fonts, GroupTripCard, palette, Pressy, radius, Row, Section, shadow, Skeleton, space, T, useUnreadCount,
} from "@goloc/core";
import { router } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CaptainRow, CategoryTile, ReelTile } from "../../../lib/cards";
import { useCity, useDiscovery, useDiscoverFeed, useFeed, useGroupTrips, usePlace } from "../../../lib/data";
import { PosterRail } from "../../../lib/discover";
import { PlacePicker } from "../../../lib/place-picker";

const CATEGORIES = ["food", "heritage", "culture", "adventure", "photography", "nature", "shopping", "spiritual"];

const PROMISES: [keyof typeof Ionicons.glyphMap, string, string][] = [
  ["shield-checkmark-outline", "Verified locals", "ID, licence and background checked"],
  ["card-outline", "Secure payments", "Pay in the app. Refunds by policy, automatically."],
  ["medkit-outline", "SOS on every trip", "Our safety team, plus nearby police and hospitals"],
];

export default function Discover() {
  const insets = useSafeAreaInsets();
  const city = useCity();
  const place = usePlace();
  const unread = useUnreadCount();
  const feed = useFeed(city?.slug);
  const top = useDiscovery({ city: city?.slug, page_size: "6" });
  const discover = useDiscoverFeed(city?.slug, place);
  const groups = useGroupTrips({ city: city?.slug });
  const picks = discover.data?.picks ?? [];
  const [placeOpen, setPlaceOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Exploring from somewhere other than a GoLoc city: say which city's Captains we're showing.
  const away = !!place && !!city && place.name !== city.name;
  const placeLine = [place?.area, place?.state].filter((x) => x && x !== place?.name).join(", ");
  const posts = feed.data?.results ?? [];
  const pad = { paddingHorizontal: space.xl };

  return (
    <View style={{ flex: 1, backgroundColor: palette.sand }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.rickshaw}
            colors={[palette.rickshaw]}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([feed.refetch(), top.refetch(), discover.refetch()]);
              setRefreshing(false);
            }}
          />
        }
      >
        {/* ---------- header ---------- */}
        <View style={[styles.top, pad]}>
          <Pressy onPress={() => setPlaceOpen(true)} haptic scaleTo={0.97} style={styles.place} accessibilityLabel="Change where you're exploring">
            <View style={styles.pin}><Ionicons name="location" size={16} color={palette.rickshaw} /></View>
            <View style={{ flexShrink: 1 }}>
              <Row gap={4}>
                <T variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>{place?.name ?? "Choose a place"}</T>
                <Ionicons name="chevron-down" size={16} color={palette.ink} />
              </Row>
              {placeLine ? <T variant="caption" numberOfLines={1}>{placeLine}</T> : null}
            </View>
          </Pressy>
          <Row gap={space.sm}>
            <RoundIcon icon="shield-checkmark-outline" label="Safety" onPress={() => router.push("/safety")} />
            <RoundIcon icon="notifications-outline" label="Notifications" badge={unread.data} onPress={() => router.push("/notifications")} />
          </Row>
        </View>

        <Appear i={0} style={[pad, { marginTop: space.lg }]}>
          <Pressy onPress={() => router.push("/explore")} scaleTo={0.98} style={styles.search}>
            <Ionicons name="search" size={20} color={palette.muted} />
            <T variant="body" color={palette.muted} style={{ flex: 1 }} numberOfLines={1}>Search Captains, cities, trips</T>
            <View style={styles.searchGo}><Ionicons name="options-outline" size={18} color={palette.white} /></View>
          </Pressy>
        </Appear>

        {/* ---------- this season: one quote, then the trips ---------- */}
        <Appear i={1} style={[pad, { marginTop: space.xl, marginBottom: space.lg }]}>
          {discover.data ? (
            <T variant="display" style={styles.quote}>{discover.data.headline}</T>
          ) : (
            <Skeleton h={30} w="80%" r={8} />
          )}
        </Appear>
        {picks.length ? (
          <PosterRail items={picks} />
        ) : discover.isLoading ? (
          <Row style={pad} gap={16}>{[0, 1].map((i) => <Skeleton key={i} w={270} h={360} r={radius.xl} />)}</Row>
        ) : null}

        {/* ---------- build my trip ---------- */}
        <Appear style={[pad, { marginTop: space.xxl + space.sm }]}>
          <Pressy onPress={() => router.push("/build-trip")} scaleTo={0.98} style={styles.build}>
            <View style={{ flex: 1 }}>
              <T variant="label" color={palette.onDarkMuted}>Takes 2 minutes</T>
              <T variant="title" color={palette.white} style={{ marginTop: space.sm }}>Build my trip</T>
              <T variant="small" color={palette.onDark} style={{ marginTop: 6 }}>Tell us your dates and group. We show only Captains who are free.</T>
            </View>
            <View style={styles.buildArrow}><Ionicons name="arrow-forward" size={20} color={palette.ink} /></View>
          </Pressy>
        </Appear>

        {/* ---------- group trips ---------- */}
        {groups.data?.length ? (
          <>
            <Section title="Join a group trip" subtitle="Travel with others on a Captain's fixed date. Pay per seat."
              action="See all" onAction={() => router.push("/groups")} style={pad}>
              <View />
            </Section>
            <FlatList
              horizontal
              data={groups.data.slice(0, 8)}
              keyExtractor={(g) => g.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: space.xl, gap: 14, paddingBottom: 6 }}
              renderItem={({ item }) => <GroupTripCard g={item} width={280} onPress={() => router.push(`/group/${item.id}`)} />}
            />
          </>
        ) : null}

        {/* ---------- categories ---------- */}
        <Section title="What are you into?" style={pad}>
          <View style={styles.categories}>
            {CATEGORIES.map((c) => (
              <CategoryTile key={c} value={c} onPress={() => router.push({ pathname: "/explore", params: { category: c } })} />
            ))}
          </View>
        </Section>

        {/* ---------- reels ---------- */}
        <Section
          title="Reels from Captains"
          action={posts.length ? "See all" : undefined}
          onAction={() => router.push({ pathname: "/reels", params: { city: city?.slug, start: "0" } })}
          style={pad}
        >
          <View />
        </Section>
        {feed.isLoading ? (
          <Row style={pad} gap={12}>{[0, 1, 2].map((i) => <Skeleton key={i} w={140} h={230} r={radius.lg} />)}</Row>
        ) : posts.length ? (
          <FlatList
            horizontal
            data={posts}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.xl, gap: 12 }}
            renderItem={({ item, index }) => (
              <ReelTile p={item} width={140} onPress={() => router.push({ pathname: "/reels", params: { city: city?.slug, start: String(index) } })} />
            )}
          />
        ) : (
          <View style={pad}>
            <T variant="caption">No reels in {city?.name} yet. Captains post here as they join.</T>
          </View>
        )}

        {/* ---------- captains ---------- */}
        <Section
          title={away ? `Captains near ${place!.name}` : `Top Captains in ${city?.name ?? "your city"}`}
          subtitle={away ? `From ${city!.name}${place?.nearest_city_km ? `, ${place.nearest_city_km} km away` : ""}. More cities coming.` : undefined}
          action="See all"
          onAction={() => router.push("/explore")}
          style={pad}
        >
          {top.isLoading ? (
            <View style={{ gap: space.lg }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={150} r={radius.xl} />)}</View>
          ) : (top.data?.results ?? []).length ? (
            <View style={{ gap: space.lg }}>{top.data!.results.map((c) => <CaptainRow key={c.id} c={c} />)}</View>
          ) : (
            <Empty icon="people-outline" title="No Captains live here yet" body="Try another city. We're onboarding locals every week." action="Change place" onAction={() => setPlaceOpen(true)} />
          )}
        </Section>

        {/* ---------- trust ---------- */}
        <Section title="Travel with peace of mind" style={pad}>
          <View style={styles.trust}>
            {PROMISES.map(([icon, title, body]) => (
              <Row key={title} gap={space.lg} style={{ alignItems: "flex-start" }}>
                <View style={styles.trustIcon}><Ionicons name={icon} size={20} color={palette.rickshaw} /></View>
                <View style={{ flex: 1 }}>
                  <T variant="bodyBold">{title}</T>
                  <T variant="caption" style={{ marginTop: 2 }}>{body}</T>
                </View>
              </Row>
            ))}
          </View>
        </Section>
      </ScrollView>

      <PlacePicker visible={placeOpen} onClose={() => setPlaceOpen(false)} />
    </View>
  );
}

function RoundIcon({ icon, label, badge, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; badge?: number; onPress: () => void }) {
  return (
    <Pressy onPress={onPress} scaleTo={0.88} accessibilityLabel={label} style={styles.round}>
      <Ionicons name={icon} size={20} color={palette.ink} />
      {badge ? <View style={styles.badge}><T style={styles.badgeText}>{badge > 9 ? "9+" : badge}</T></View> : null}
    </Pressy>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.lg },
  place: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.rickshawSoft, alignItems: "center", justifyContent: "center" },
  quote: { fontSize: 25, lineHeight: 31 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.paper, alignItems: "center", justifyContent: "center", ...shadow },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: palette.coral, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: palette.paper },
  badgeText: { color: palette.white, fontSize: 9.5, fontFamily: fonts.bold },
  search: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.paper, borderRadius: radius.pill, paddingLeft: space.xl, paddingRight: 6, height: 60, ...shadow },
  searchGo: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.rickshaw, alignItems: "center", justifyContent: "center" },
  build: { flexDirection: "row", alignItems: "center", gap: space.lg, borderRadius: radius.xl, padding: space.xl + 4, backgroundColor: palette.night },
  buildArrow: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.white, alignItems: "center", justifyContent: "center" },
  categories: { flexDirection: "row", flexWrap: "wrap", rowGap: space.md },
  trust: { backgroundColor: palette.paper, borderRadius: radius.xl, padding: space.xl, gap: space.xl, ...shadow },
  trustIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.rickshawSoft, alignItems: "center", justifyContent: "center" },
});
