import { Ionicons } from "@expo/vector-icons";
import { Avatar, Booking, CaptainCard, CATEGORY_ICON, dateRange, fonts, gradients, LinearGradient, money, palette, Post, Pressy, Rating, Row, shadow, space, StatusBadge, T, timeLeft, titleCase } from "@goloc/core";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { usePrefetchCaptain } from "./data";

/** `note` = a line about the traveler's search, e.g. "Free 12–15 Nov". */
export const CaptainRow = memo(function CaptainRow({ c, right, note }: { c: CaptainCard; right?: React.ReactNode; note?: string }) {
  const prefetch = usePrefetchCaptain();
  const guide = c.captain_type === "guide";
  return (
    <Pressy onPressIn={() => prefetch(c.id)} onPress={() => router.push(`/captain/${c.id}`)} scaleTo={0.98} style={styles.captain}>
      <Row gap={space.md} style={{ alignItems: "flex-start" }}>
        <Avatar uri={c.avatar} name={c.name} size={64} ring={c.is_verified || c.is_featured} verified />
        <View style={{ flex: 1 }}>
          <Row gap={6}>
            <T variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>{c.name}</T>
            {c.is_verified ? <Ionicons name="checkmark-done-circle" size={17} color={palette.success} accessibilityLabel="GoLoc Verified" /> : null}
            {c.is_featured ? <Ionicons name="ribbon" size={15} color={palette.marigold} /> : null}
          </Row>
          <Row gap={4} style={{ marginTop: 2 }}>
            <Ionicons name="location" size={12} color={palette.muted} />
            <T variant="caption" numberOfLines={1} style={{ flex: 1 }}>
              {c.city_name}{c.agency_name ? ` · ${c.agency_name}` : ""}{c.years_experience ? ` · ${c.years_experience} yr${c.years_experience > 1 ? "s" : ""} exp` : ""}
            </T>
          </Row>
          <T variant="small" numberOfLines={1} style={{ marginTop: 4 }}>{c.tagline || c.categories.map(titleCase).join(" · ")}</T>
        </View>
        <View style={[styles.typeTag, { backgroundColor: guide ? palette.warningSoft : palette.rickshawSoft }]}>
          <T style={[styles.typeTagText, { color: guide ? palette.warning : palette.rickshaw }]}>{guide ? "Guide" : "Captain"}</T>
        </View>
      </Row>
      <View style={styles.captainFoot}>
        <Row gap={12} style={{ flex: 1 }}>
          <Rating value={c.rating_avg} count={c.rating_count} />
          <Row gap={3}><Ionicons name="navigate-circle-outline" size={14} color={palette.muted} /><T variant="caption">{c.trips_completed} trips</T></Row>
          {c.has_package ? <View style={styles.dotTag}><T style={[styles.dotTagText, { color: palette.rickshaw }]}>Packages</T></View> : null}
          {c.has_guide ? <View style={[styles.dotTag, { backgroundColor: palette.warningSoft }]}><T style={[styles.dotTagText, { color: palette.warning }]}>By day</T></View> : null}
        </Row>
        {c.from_price ? (
          <View style={{ alignItems: "flex-end" }}>
            <T style={styles.fromLabel}>from</T>
            <T variant="bodyBold" style={{ fontSize: 16 }}>{money(c.from_price)}</T>
          </View>
        ) : null}
        {right}
      </View>
      {note ? (
        <Row gap={6} style={styles.note}>
          <Ionicons name="checkmark-circle" size={15} color={palette.success} />
          <T variant="small" color={palette.success} style={{ fontFamily: fonts.bold }}>{note}</T>
        </Row>
      ) : null}
    </Pressy>
  );
});

export const ReelTile = memo(function ReelTile({ p, onPress, width = 132 }: { p: Post; onPress: () => void; width?: number }) {
  return (
    <Pressy onPress={onPress} scaleTo={0.95} style={[styles.reel, { width }]}>
      {p.thumbnail || p.kind === "photo" ? (
        <Image source={{ uri: p.thumbnail || p.media }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" recyclingKey={p.id} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.night2 }]} />
      )}
      <LinearGradient colors={gradients.glassDark as any} style={StyleSheet.absoluteFill} />
      {p.kind === "reel" ? <View style={styles.play}><Ionicons name="play" size={13} color={palette.white} /></View> : null}
      <View style={{ position: "absolute", left: 10, right: 10, bottom: 10 }}>
        <T variant="small" color={palette.white} numberOfLines={2} style={{ fontWeight: "700" }}>{p.caption || p.captain.name}</T>
        <Row gap={6} style={{ marginTop: 6 }}>
          <Avatar uri={p.captain.avatar} name={p.captain.name} size={20} />
          <T variant="caption" color="#ffffffdd" numberOfLines={1} style={{ flex: 1, fontSize: 11 }}>{p.captain.name}</T>
        </Row>
      </View>
    </Pressy>
  );
});

export const BookingRow = memo(function BookingRow({ b }: { b: Booking }) {
  const needsPay = b.status === "accepted";
  return (
    <Pressy onPress={() => router.push(`/booking/${b.id}`)} scaleTo={0.98} style={[styles.booking, needsPay && { borderColor: palette.warning, borderWidth: 1.5 }]}>
      <Row style={{ justifyContent: "space-between" }}>
        <T variant="label">{b.code}</T>
        <StatusBadge status={b.status} />
      </Row>
      <T variant="h2" style={{ marginTop: 6 }} numberOfLines={1}>{b.title}</T>
      <Row style={{ marginTop: 4, justifyContent: "space-between" }}>
        <T variant="caption">{dateRange(b.start_date, b.end_date)} · {b.guests} guest{b.guests > 1 ? "s" : ""} · {b.captain.name}</T>
        <T variant="bodyBold">{money(b.total)}</T>
      </Row>
      {needsPay ? (
        <Row style={{ marginTop: space.sm }} gap={6}>
          <Ionicons name="time" size={14} color={palette.warning} />
          <T variant="small" color={palette.warning}>Pay to confirm · {timeLeft(b.payment_due_at)}</T>
        </Row>
      ) : null}
    </Pressy>
  );
});

const CATEGORY_TINT: Record<string, readonly [string, string]> = {
  food: ["#FFB25B", "#EF5B3F"], heritage: ["#E9A23B", "#B8670A"], culture: ["#F0628A", "#B83266"], adventure: ["#8B5CF6", "#5B32C2"],
  photography: ["#4C8DF6", "#2457C2"], nature: ["#34C38F", "#1E7A66"], shopping: ["#FF8A65", "#D9480F"], spiritual: ["#F7C548", "#D98E0B"],
};

export const CategoryTile = ({ value, onPress }: { value: string; onPress: () => void }) => (
  <Pressy onPress={onPress} haptic scaleTo={0.9} style={styles.category}>
    <LinearGradient colors={(CATEGORY_TINT[value] ?? gradients.traveler) as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.categoryIcon}>
      <Ionicons name={(CATEGORY_ICON[value] ?? "sparkles") as any} size={24} color={palette.white} />
    </LinearGradient>
    <T variant="small" style={{ marginTop: 7, fontFamily: fonts.bold }}>{titleCase(value)}</T>
  </Pressy>
);

const styles = StyleSheet.create({
  captain: { backgroundColor: palette.paper, padding: space.lg, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, ...shadow },
  captainFoot: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  typeTag: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 },
  typeTagText: { fontSize: 10.5, fontFamily: fonts.bold, letterSpacing: 0.3 },
  dotTag: { backgroundColor: palette.rickshawSoft, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  dotTagText: { fontSize: 10.5, fontFamily: fonts.bold },
  fromLabel: { fontSize: 10, fontFamily: fonts.medium, color: palette.muted, marginBottom: -3 },
  note: { marginTop: space.sm, backgroundColor: palette.successSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  reel: { aspectRatio: 9 / 15, borderRadius: 20, overflow: "hidden", backgroundColor: palette.night },
  play: { position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", paddingLeft: 2 },
  booking: { backgroundColor: palette.paper, padding: space.lg, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, ...shadow },
  category: { alignItems: "center", width: 76 },
  categoryIcon: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", shadowColor: "#0F1E1C", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
});
