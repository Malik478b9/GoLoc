import { Ionicons } from "@expo/vector-icons";
import { palette, radius, space, T, TripPoster } from "@goloc/core";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { memo } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";

/** Open "Build my trip" already set to this place. */
export function startTrip(p: TripPoster) {
  router.push({
    pathname: "/build-trip",
    params: { city: p.build.city, spot: `${p.name}, ${p.city_name}`, interests: p.build.interests.join(","), kind: p.build.kind },
  });
}

const VIBE_TINT: Record<string, string> = {
  beach: "#1F8FB5", mountains: "#3C6E9E", snow: "#3C6E9E", spiritual: "#E8A33D", royal: "#C2410C", food: "#E15B3F",
  romance: "#C2416B", nature: "#2F7A6B", monsoon: "#2F7A6B", adventure: "#8A4FD8", heritage: "#B5650B",
};
const tintFor = (p: TripPoster) => VIBE_TINT[p.vibes[0]] ?? palette.rickshaw;

/** Darkens the bottom of a photo so white text stays readable (stacked bands = a soft gradient). */
function Scrim({ strong }: { strong?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ flex: strong ? 0.8 : 1.1 }} />
      <View style={{ flex: 0.6, backgroundColor: "rgba(10,25,26,0.18)" }} />
      <View style={{ flex: 0.8, backgroundColor: "rgba(10,25,26,0.45)" }} />
      <View style={{ flex: 1.2, backgroundColor: "rgba(10,25,26,0.78)" }} />
    </View>
  );
}

function Photo({ p }: { p: TripPoster }) {
  return p.image ? (
    <Image source={{ uri: p.image }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={250} />
  ) : (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tintFor(p) }]} />
  );
}

function Pill({ icon, label, bg = "rgba(255,255,255,0.92)", fg = palette.ink }: { icon?: keyof typeof Ionicons.glyphMap; label: string; bg?: string; fg?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <T style={{ fontSize: 11, fontWeight: "700", color: fg }} numberOfLines={1}>{label}</T>
    </View>
  );
}

/** One swipeable trip poster: photo, place, catchy line, season and distance. */
export const PosterTile = memo(function PosterTile({ p, width = 230 }: { p: TripPoster; width?: number }) {
  return (
    <Pressable onPress={() => startTrip(p)} style={({ pressed }) => [styles.tile, { width, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <Photo p={p} />
      <Scrim />
      <View style={styles.tileTop}>
        {p.event ? <Pill icon="sparkles" label={p.event} bg={palette.marigold} /> : p.in_season ? <Pill icon="sunny" label="In season" bg={palette.marigold} /> : <Pill icon="calendar-outline" label={p.best_months} />}
      </View>
      <View style={styles.tileBody}>
        <T style={styles.city} numberOfLines={1}>{p.city_name.toUpperCase()}</T>
        <T style={styles.tileTitle} numberOfLines={2}>{p.title}</T>
        <T style={styles.tileTag} numberOfLines={2}>{p.tagline}</T>
        <View style={styles.tileFoot}>
          <Ionicons name="location" size={12} color={palette.marigold} />
          <T style={styles.tileMeta} numberOfLines={1}>{p.name}{p.travel_hint ? ` · ${p.travel_hint}` : ""}</T>
        </View>
      </View>
    </Pressable>
  );
});

/** The big poster at the top of the home screen. */
export function HeroPoster({ p, headline, subhead, ai, seasonLabel }: { p: TripPoster; headline: string; subhead: string; ai: boolean; seasonLabel: string }) {
  return (
    <Pressable onPress={() => startTrip(p)} style={({ pressed }) => [styles.hero, pressed && { opacity: 0.95 }]}>
      <Photo p={p} />
      <Scrim strong />
      <View style={styles.tileTop}>
        <Pill icon="sparkles" label={ai ? `AI picks · ${seasonLabel}` : `${seasonLabel} picks`} bg={palette.marigold} />
        {p.image_credit ? <T style={styles.credit}>{p.image_credit}</T> : null}
      </View>
      <View style={styles.heroBody}>
        <T style={styles.heroHead}>{headline}</T>
        <T style={styles.heroSub} numberOfLines={2}>{subhead}</T>
        <View style={styles.heroCard}>
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 15, fontWeight: "800", color: palette.ink }} numberOfLines={1}>{p.title}</T>
            <T variant="caption" numberOfLines={1}>{p.name}, {p.city_name}{p.why_now ? ` · ${p.why_now}` : ""}</T>
          </View>
          <View style={styles.heroGo}>
            <T style={{ fontSize: 12, fontWeight: "800", color: palette.white }}>Plan it</T>
            <Ionicons name="arrow-forward" size={14} color={palette.white} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** A titled, side-swipe row of posters. */
export function PosterRail({ title, subtitle, items }: { title: string; subtitle: string; items: TripPoster[] }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <View style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>
        <T variant="h2">{title}</T>
        <T variant="caption">{subtitle}</T>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(p) => p.key}
        showsHorizontalScrollIndicator={false}
        snapToInterval={230 + 12}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: 12 }}
        renderItem={({ item }) => <PosterTile p={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { height: 310, borderRadius: 22, overflow: "hidden", backgroundColor: palette.night },
  tileTop: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tileBody: { position: "absolute", left: 14, right: 14, bottom: 14 },
  city: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6, color: palette.marigold },
  tileTitle: { fontSize: 20, lineHeight: 24, fontWeight: "800", color: palette.white, marginTop: 4, letterSpacing: -0.3 },
  tileTag: { fontSize: 12.5, lineHeight: 17, color: "#E6EEEB", marginTop: 4 },
  tileFoot: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  tileMeta: { fontSize: 11.5, color: "#E6EEEB", flex: 1 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 190 },
  credit: { fontSize: 9, color: "rgba(255,255,255,0.75)" },
  hero: { height: 400, borderRadius: radius.lg + 6, overflow: "hidden", backgroundColor: palette.night, marginTop: space.lg },
  heroBody: { position: "absolute", left: 16, right: 16, bottom: 16 },
  heroHead: { fontSize: 30, lineHeight: 34, fontWeight: "800", color: palette.white, letterSpacing: -0.6 },
  heroSub: { fontSize: 14, lineHeight: 19, color: "#E6EEEB", marginTop: 6 },
  heroCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 12, marginTop: 14 },
  heroGo: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: palette.coral, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 },
});
