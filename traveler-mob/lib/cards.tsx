import { Ionicons } from "@expo/vector-icons";
import { Avatar, Booking, CaptainCard, CATEGORY_ICON, dateRange, fonts, gradients, LinearGradient, money, palette, Post, Pressy, radius, Rating, Row, shadow, space, StatusBadge, T, timeLeft, titleCase } from "@goloc/core";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { usePrefetchCaptain } from "./data";

/** `note` = a line about the traveler's search, e.g. "Free 12–15 Nov". */
export const CaptainRow = memo(function CaptainRow({ c, right, note }: { c: CaptainCard; right?: React.ReactNode; note?: string }) {
  const prefetch = usePrefetchCaptain();
  const guide = c.captain_type === "guide";
  const meta = [c.city_name, c.years_experience ? `${c.years_experience} yr${c.years_experience > 1 ? "s" : ""} experience` : null].filter(Boolean).join(" · ");
  return (
    <Pressy onPressIn={() => prefetch(c.id)} onPress={() => router.push(`/captain/${c.id}`)} scaleTo={0.98} style={styles.captain}>
      <Row gap={space.lg} style={{ alignItems: "center" }}>
        <Avatar uri={c.avatar} name={c.name} size={60} verified={c.is_verified} />
        <View style={{ flex: 1, gap: 3 }}>
          <Row gap={6}>
            <T variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>{c.name}</T>
            {c.is_featured ? <Ionicons name="ribbon" size={14} color={palette.marigold} /> : null}
          </Row>
          <T variant="caption" numberOfLines={1}>{meta}</T>
          <Row gap={space.md} style={{ marginTop: 2 }}>
            <Rating value={c.rating_avg} count={c.rating_count} />
            <T variant="caption">{c.trips_completed} trips</T>
          </Row>
        </View>
        {right}
      </Row>

      {c.tagline ? <T variant="body" numberOfLines={2} style={{ marginTop: space.md }}>{c.tagline}</T> : null}

      <Row style={{ marginTop: space.lg, justifyContent: "space-between" }}>
        <Row gap={6} style={{ flex: 1, flexWrap: "wrap" }}>
          <View style={styles.tag}><T style={styles.tagText}>{guide ? "Guide" : "Captain"}</T></View>
          {c.has_package ? <View style={styles.tag}><T style={styles.tagText}>Packages</T></View> : null}
          {c.has_guide ? <View style={styles.tag}><T style={styles.tagText}>By day</T></View> : null}
          {c.agency_name ? <View style={styles.tag}><T style={styles.tagText} numberOfLines={1}>{c.agency_name}</T></View> : null}
        </Row>
        {c.from_price ? (
          <T variant="caption">
            from <T variant="bodyBold" style={{ fontSize: 16 }}>{money(c.from_price)}</T>
          </T>
        ) : null}
      </Row>

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
    <Pressy onPress={onPress} scaleTo={0.96} style={[styles.reel, { width }]}>
      {p.thumbnail || p.kind === "photo" ? (
        <Image source={{ uri: p.thumbnail || p.media }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" recyclingKey={p.id} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.night2 }]} />
      )}
      <LinearGradient colors={gradients.glassDark as any} style={StyleSheet.absoluteFill} />
      {p.kind === "reel" ? <View style={styles.play}><Ionicons name="play" size={12} color={palette.ink} /></View> : null}
      <View style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
        <T variant="small" color={palette.white} numberOfLines={2} style={{ fontFamily: fonts.bold }}>{p.caption || p.captain.name}</T>
        <T variant="caption" color={palette.onDarkMuted} numberOfLines={1} style={{ marginTop: 4, fontSize: 11.5 }}>{p.captain.name}</T>
      </View>
    </Pressy>
  );
});

export const BookingRow = memo(function BookingRow({ b }: { b: Booking }) {
  const needsPay = b.status === "accepted";
  return (
    <Pressy onPress={() => router.push(`/booking/${b.id}`)} scaleTo={0.98} style={styles.booking}>
      <Row style={{ justifyContent: "space-between" }}>
        <T variant="caption">{b.code}</T>
        <StatusBadge status={b.status} />
      </Row>
      <T variant="h2" style={{ marginTop: space.sm }} numberOfLines={1}>{b.title}</T>
      <T variant="caption" style={{ marginTop: 4 }}>
        {dateRange(b.start_date, b.end_date)} · {b.guests} guest{b.guests > 1 ? "s" : ""} · {b.captain.name}
      </T>
      <Row style={{ marginTop: space.md, justifyContent: "space-between" }}>
        {needsPay ? (
          <Row gap={6} style={{ flex: 1 }}>
            <Ionicons name="time-outline" size={15} color={palette.warning} />
            <T variant="small" color={palette.warning} style={{ fontFamily: fonts.bold }}>Pay to confirm · {timeLeft(b.payment_due_at)}</T>
          </Row>
        ) : <View />}
        <T variant="bodyBold" style={{ fontSize: 16 }}>{money(b.total)}</T>
      </Row>
    </Pressy>
  );
});

/** Interest shortcut: one calm style for every category (brand blue on soft blue). */
export const CategoryTile = ({ value, onPress }: { value: string; onPress: () => void }) => (
  <Pressy onPress={onPress} haptic scaleTo={0.92} style={styles.category}>
    <View style={styles.categoryIcon}>
      <Ionicons name={(CATEGORY_ICON[value] ?? "sparkles") as any} size={24} color={palette.rickshaw} />
    </View>
    <T variant="small" style={{ marginTop: space.sm }} numberOfLines={1}>{titleCase(value)}</T>
  </Pressy>
);

const styles = StyleSheet.create({
  captain: { backgroundColor: palette.paper, padding: space.xl, borderRadius: radius.xl, ...shadow },
  tag: { backgroundColor: palette.sand, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 150 },
  tagText: { fontSize: 11.5, fontFamily: fonts.medium, color: palette.ink2 },
  note: { marginTop: space.md, backgroundColor: palette.successSoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  reel: { aspectRatio: 9 / 15, borderRadius: radius.lg, overflow: "hidden", backgroundColor: palette.night },
  play: { position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: palette.white, alignItems: "center", justifyContent: "center", paddingLeft: 2 },
  booking: { backgroundColor: palette.paper, padding: space.xl, borderRadius: radius.xl, ...shadow },
  category: { alignItems: "center", width: "25%", paddingVertical: space.sm },
  categoryIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: palette.rickshawSoft, alignItems: "center", justifyContent: "center" },
});
