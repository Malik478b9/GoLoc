import { Ionicons } from "@expo/vector-icons";
import { api, DiscoverFeed, fonts, gradients, LinearGradient, palette, Pressy, radius, shadow, space, T, toastError, TripPoster } from "@goloc/core";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { memo } from "react";
import { FlatList, StyleSheet, View } from "react-native";

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

/** Darkens the bottom of a photo so white text stays readable. */
function Scrim() {
  return <LinearGradient pointerEvents="none" colors={gradients.glassDark as any} locations={[0.3, 0.65, 1]} style={StyleSheet.absoluteFill} />;
}

function Pill({ icon, label }: { icon?: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.pill}>
      {icon ? <Ionicons name={icon} size={11} color={palette.ink} /> : null}
      <T style={{ fontSize: 11.5, fontFamily: fonts.bold, color: palette.ink }} numberOfLines={1}>{label}</T>
    </View>
  );
}

/** One swipeable trip poster: photo, place, catchy line, season, distance and a save heart. */
export const PosterTile = memo(function PosterTile({ p, width = 270, onToggleSave }: { p: TripPoster; width?: number; onToggleSave: (p: TripPoster) => void }) {
  return (
    <Pressy onPress={() => startTrip(p)} scaleTo={0.97} style={[styles.tile, { width }]}>
      {p.image ? (
        <Image source={{ uri: p.image }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={250} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.night2 }]} />
      )}
      <Scrim />
      <View style={styles.tileTop}>
        {p.event ? <Pill icon="sparkles" label={p.event} /> : p.in_season ? <Pill icon="sunny" label="In season" /> : <Pill icon="calendar-outline" label={p.best_months} />}
        <Pressy
          onPress={() => onToggleSave(p)}
          hitSlop={10}
          haptic
          scaleTo={0.75}
          accessibilityLabel={p.saved ? "Remove from saved" : "Save for later"}
          style={styles.heart}
        >
          <Ionicons name={p.saved ? "heart" : "heart-outline"} size={20} color={p.saved ? palette.coral : palette.ink} />
        </Pressy>
      </View>
      <View style={styles.tileBody}>
        <T style={styles.city} numberOfLines={1}>{p.city_name.toUpperCase()}</T>
        <T style={styles.tileTitle} numberOfLines={2}>{p.title}</T>
        <T style={styles.tileTag} numberOfLines={2}>{p.tagline}</T>
        <View style={styles.tileFoot}>
          <T style={styles.tileMeta} numberOfLines={1}>{p.name}{p.travel_hint ? ` · ${p.travel_hint}` : ""}</T>
          <View style={styles.plan}>
            <T style={{ fontSize: 12.5, fontFamily: fonts.bold, color: palette.ink }}>Plan</T>
            <Ionicons name="arrow-forward" size={13} color={palette.ink} />
          </View>
        </View>
      </View>
    </Pressy>
  );
});

/** The home screen's one row of trip posters. */
/** The home screen's one row of trip posters (the headline is drawn by the screen). */
export function PosterRail({ items }: { items: TripPoster[] }) {
  const toggle = useToggleSavedTrip();
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(p) => p.key}
      showsHorizontalScrollIndicator={false}
      snapToInterval={270 + 16}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: space.xl, gap: 16 }}
      renderItem={({ item }) => <PosterTile p={item} onToggleSave={toggle} />}
    />
  );
}

const styles = StyleSheet.create({
  tile: { height: 360, borderRadius: radius.xl, overflow: "hidden", backgroundColor: palette.night, ...shadow },
  tileTop: { position: "absolute", top: 14, left: 14, right: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heart: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.white, alignItems: "center", justifyContent: "center" },
  tileBody: { position: "absolute", left: 18, right: 18, bottom: 18 },
  city: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.4, color: palette.onDarkMuted },
  tileTitle: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display, color: palette.white, marginTop: 6, letterSpacing: -0.3 },
  tileTag: { fontSize: 13, lineHeight: 18, color: palette.onDark, marginTop: 6 },
  tileFoot: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg },
  tileMeta: { fontSize: 12, color: palette.onDarkMuted, flex: 1 },
  plan: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, backgroundColor: palette.white, paddingHorizontal: 14, paddingVertical: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, backgroundColor: palette.white, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 170 },
});
