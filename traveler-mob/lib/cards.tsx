import { Ionicons } from "@expo/vector-icons";
import { Avatar, Booking, CaptainCard, CATEGORY_ICON, dateRange, money, palette, Post, radius, Rating, Row, space, StatusBadge, T, timeLeft, titleCase } from "@goloc/core";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { usePrefetchCaptain } from "./data";

export const CaptainRow = memo(function CaptainRow({ c, right }: { c: CaptainCard; right?: React.ReactNode }) {
  const prefetch = usePrefetchCaptain();
  return (
    <Pressable onPressIn={() => prefetch(c.id)} onPress={() => router.push(`/captain/${c.id}`)} style={({ pressed }) => [styles.captain, pressed && { opacity: 0.85 }]}>
      <Avatar uri={c.avatar} name={c.name} size={60} verified />
      <View style={{ flex: 1 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <T variant="h2" numberOfLines={1} style={{ flex: 1 }}>{c.name}</T>
          {c.is_featured ? <Ionicons name="ribbon" size={16} color={palette.marigold} /> : null}
        </Row>
        <T variant="caption" numberOfLines={1}>{c.tagline || c.categories.map(titleCase).join(" · ")}</T>
        <Row style={{ marginTop: 6, justifyContent: "space-between" }}>
          <Row gap={10}>
            <Rating value={c.rating_avg} count={c.rating_count} />
            <T variant="caption">{c.trips_completed} trips</T>
            {c.has_package ? <T variant="caption" color={palette.rickshaw}>· Packages</T> : null}
          </Row>
          <T variant="bodyBold">{c.from_price ? `from ${money(c.from_price)}` : ""}</T>
        </Row>
      </View>
      {right}
    </Pressable>
  );
});

export const ReelTile = memo(function ReelTile({ p, onPress, width = 132 }: { p: Post; onPress: () => void; width?: number }) {
  return (
    <Pressable onPress={onPress} style={[styles.reel, { width }]}>
      {p.thumbnail || p.kind === "photo" ? (
        <Image source={{ uri: p.thumbnail || p.media }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" recyclingKey={p.id} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.night2 }]} />
      )}
      <View style={styles.reelShade} />
      {p.kind === "reel" ? <Ionicons name="play" size={18} color={palette.white} style={{ position: "absolute", top: 10, right: 10 }} /> : null}
      <View style={{ position: "absolute", left: 10, right: 10, bottom: 10 }}>
        <T variant="small" color={palette.white} numberOfLines={2} style={{ fontWeight: "700" }}>{p.caption || p.captain.name}</T>
        <Row gap={6} style={{ marginTop: 6 }}>
          <Avatar uri={p.captain.avatar} name={p.captain.name} size={20} />
          <T variant="caption" color="#ffffffdd" numberOfLines={1} style={{ flex: 1, fontSize: 11 }}>{p.captain.name}</T>
        </Row>
      </View>
    </Pressable>
  );
});

export const BookingRow = memo(function BookingRow({ b }: { b: Booking }) {
  const needsPay = b.status === "accepted";
  return (
    <Pressable onPress={() => router.push(`/booking/${b.id}`)} style={({ pressed }) => [styles.booking, needsPay && { borderColor: palette.warning, borderWidth: 1.5 }, pressed && { opacity: 0.85 }]}>
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
    </Pressable>
  );
});

export const CategoryTile = ({ value, onPress }: { value: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.category}>
    <View style={styles.categoryIcon}>
      <Ionicons name={(CATEGORY_ICON[value] ?? "sparkles") as any} size={20} color={palette.rickshaw} />
    </View>
    <T variant="small" style={{ marginTop: 6 }}>{titleCase(value)}</T>
  </Pressable>
);

const styles = StyleSheet.create({
  captain: { flexDirection: "row", gap: space.md, alignItems: "center", backgroundColor: palette.paper, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  reel: { aspectRatio: 9 / 15, borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.night },
  reelShade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.25)" },
  booking: { backgroundColor: palette.paper, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  category: { alignItems: "center", width: 72 },
  categoryIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: palette.rickshawSoft, alignItems: "center", justifyContent: "center" },
});
