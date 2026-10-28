import { Ionicons } from "@expo/vector-icons";
import { api, DiscoverFeed, palette, space, T, toastError, TripPoster } from "@goloc/core";
import { useQueryClient } from "@tanstack/react-query";
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

/** Save a trip for later (or remove it), updating every list that shows it straight away. */
export function useToggleSavedTrip() {
  const qc = useQueryClient();
  return async (p: TripPoster) => {
    const saved = !p.saved;
    qc.setQueriesData<DiscoverFeed>({ queryKey: ["discover"] }, (d) =>
      d ? { ...d, picks: d.picks.map((x) => (x.key === p.key ? { ...x, saved } : x)) } : d,
    );
    qc.setQueriesData<TripPoster[]>({ queryKey: ["saved-trips"] }, (rows) => (rows && !saved ? rows.filter((x) => x.key !== p.key) : rows));
    try {
      if (saved) await api.post(`/discover/saved/${p.key}/`);
      else await api.del(`/discover/saved/${p.key}/`);
    } catch (e) {
      toastError(e);
    }
    qc.invalidateQueries({ queryKey: ["discover"] });
    qc.invalidateQueries({ queryKey: ["saved-trips"] });
  };
}

const VIBE_TINT: Record<string, string> = {
  beach: "#1F8FB5", mountains: "#3C6E9E", snow: "#3C6E9E", spiritual: "#E8A33D", royal: "#C2410C", food: "#E15B3F",
  romance: "#C2416B", nature: "#2F7A6B", monsoon: "#2F7A6B", adventure: "#8A4FD8", heritage: "#B5650B",
};

/** Darkens the bottom of a photo so white text stays readable (stacked bands = a soft gradient). */
function Scrim() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ flex: 1.1 }} />
      <View style={{ flex: 0.6, backgroundColor: "rgba(10,25,26,0.18)" }} />
      <View style={{ flex: 0.8, backgroundColor: "rgba(10,25,26,0.45)" }} />
      <View style={{ flex: 1.3, backgroundColor: "rgba(10,25,26,0.8)" }} />
    </View>
  );
}

function Pill({ icon, label, bg = "rgba(255,255,255,0.92)" }: { icon?: keyof typeof Ionicons.glyphMap; label: string; bg?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={palette.ink} /> : null}
      <T style={{ fontSize: 11, fontWeight: "700", color: palette.ink }} numberOfLines={1}>{label}</T>
    </View>
  );
}

/** One swipeable trip poster: photo, place, catchy line, season, distance and a save heart. */
export const PosterTile = memo(function PosterTile({ p, width = 250, onToggleSave }: { p: TripPoster; width?: number; onToggleSave: (p: TripPoster) => void }) {
  return (
    <Pressable onPress={() => startTrip(p)} style={({ pressed }) => [styles.tile, { width, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      {p.image ? (
        <Image source={{ uri: p.image }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={250} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: VIBE_TINT[p.vibes[0]] ?? palette.rickshaw }]} />
      )}
      <Scrim />
      <View style={styles.tileTop}>
        {p.event ? <Pill icon="sparkles" label={p.event} bg={palette.marigold} /> : p.in_season ? <Pill icon="sunny" label="In season" bg={palette.marigold} /> : <Pill icon="calendar-outline" label={p.best_months} />}
        <Pressable
          onPress={() => onToggleSave(p)}
          hitSlop={10}
          accessibilityLabel={p.saved ? "Remove from saved" : "Save for later"}
          style={styles.heart}
        >
          <Ionicons name={p.saved ? "heart" : "heart-outline"} size={20} color={p.saved ? palette.coral : palette.ink} />
        </Pressable>
      </View>
      <View style={styles.tileBody}>
        <T style={styles.city} numberOfLines={1}>{p.city_name.toUpperCase()}</T>
        <T style={styles.tileTitle} numberOfLines={2}>{p.title}</T>
        <T style={styles.tileTag} numberOfLines={2}>{p.tagline}</T>
        <View style={styles.tileFoot}>
          <Ionicons name="location" size={12} color={palette.marigold} />
          <T style={styles.tileMeta} numberOfLines={1}>{p.name}{p.travel_hint ? ` · ${p.travel_hint}` : ""}</T>
        </View>
        <View style={styles.plan}>
          <T style={{ fontSize: 12, fontWeight: "800", color: palette.white }}>Plan this trip</T>
          <Ionicons name="arrow-forward" size={13} color={palette.white} />
        </View>
      </View>
    </Pressable>
  );
});

/** The home screen's one row of trip posters. */
export function PosterRail({ title, subtitle, items, badge }: { title: string; subtitle: string; items: TripPoster[]; badge?: string }) {
  const toggle = useToggleSavedTrip();
  return (
    <View style={{ marginTop: space.lg }}>
      <View style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>
        {badge ? (
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={11} color={palette.night} />
            <T style={{ fontSize: 11, fontWeight: "800", color: palette.night }}>{badge}</T>
          </View>
        ) : null}
        <T variant="title">{title}</T>
        <T variant="caption">{subtitle}</T>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(p) => p.key}
        showsHorizontalScrollIndicator={false}
        snapToInterval={250 + 12}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: 12 }}
        renderItem={({ item }) => <PosterTile p={item} onToggleSave={toggle} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { height: 340, borderRadius: 24, overflow: "hidden", backgroundColor: palette.night },
  tileTop: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heart: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  tileBody: { position: "absolute", left: 14, right: 14, bottom: 14 },
  city: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6, color: palette.marigold },
  tileTitle: { fontSize: 21, lineHeight: 25, fontWeight: "800", color: palette.white, marginTop: 4, letterSpacing: -0.3 },
  tileTag: { fontSize: 12.5, lineHeight: 17, color: "#E6EEEB", marginTop: 4 },
  tileFoot: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  tileMeta: { fontSize: 11.5, color: "#E6EEEB", flex: 1 },
  plan: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 4, marginTop: 10, backgroundColor: palette.coral, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 170 },
  badge: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 4, backgroundColor: palette.marigold, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 6 },
});
