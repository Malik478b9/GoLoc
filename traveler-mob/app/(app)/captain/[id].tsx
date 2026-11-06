import { Ionicons } from "@expo/vector-icons";
import {
  api, Appear, Avatar, Badge, Button, CaptainAvailability, Card, Empty, ErrorView, gradients, Header, lift, LinearGradient, Loading, money, openChat, Paginated, palette, Post, PosterCard,
  Pressy, radius, Rating, Review, Row, Segmented, Service, shadow, SkeletonList, longDate, space, T, timeAgo, titleCase, toastError, useMeasuredWidth,
} from "@goloc/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const HERO_H = 250;

import { ReelTile } from "../../../lib/cards";
import { toggleSave, useCaptain, useCompare } from "../../../lib/data";

/** Opens the booking screen, starting on the day picked from the availability calendar if any. */
const book = (serviceId: string, date?: string) => router.push({ pathname: "/book/[serviceId]", params: { serviceId, ...(date ? { date } : {}) } });

function ServiceCard({ s, date }: { s: Service; date?: string }) {
  const pkg = s.kind === "package";
  const guide = s.kind === "guide";
  return (
    <Card onPress={() => book(s.id, date)} padded={false} style={{ overflow: "hidden" }}>
      {s.cover_image ? <Image source={{ uri: s.cover_image }} style={{ height: 140 }} contentFit="cover" cachePolicy="memory-disk" /> : null}
      <View style={{ padding: space.lg }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Badge
            label={pkg ? `${s.duration_days}D package` : guide ? `Guide · ${s.duration_hours}h a day` : `${s.duration_hours}h experience`}
            bg={pkg || guide ? palette.marigoldSoft : palette.rickshawSoft}
            fg={pkg || guide ? palette.warning : palette.rickshaw}
          />
          <T variant="caption">{titleCase(s.category)} · up to {s.max_guests}</T>
        </Row>
        <T variant="h2" style={{ marginTop: 8 }}>{s.title}</T>
        {s.description ? <T variant="caption" numberOfLines={2} style={{ marginTop: 2 }}>{s.description}</T> : null}
        {pkg ? (
          <Row style={{ marginTop: space.md }} gap={8}>
            {(["normal", "medium", "lavish"] as const).map((t) => (
              <View key={t} style={styles.tier}>
                <T variant="label">{t}</T>
                <T variant="bodyBold">{money(s[`${t}_price`])}</T>
                <T variant="caption" style={{ fontSize: 11 }}>per person</T>
              </View>
            ))}
          </Row>
        ) : (
          <Row style={{ marginTop: space.md, justifyContent: "space-between" }}>
            <T variant="caption">{s.stops.slice(0, 3).join(" → ")}</T>
            <View style={{ alignItems: "flex-end" }}>
              <T variant="h2">{money(s.price)}{guide ? <T variant="caption"> /day</T> : null}</T>
              <T variant="caption" style={{ fontSize: 11 }}>for {s.included_guests} · +{money(s.extra_guest_price)}/extra{guide ? " per day" : ""}</T>
            </View>
          </Row>
        )}
        <Button title={date ? `Book from ${longDate(date)}` : guide ? "Pick your dates" : "Book your trip"} small style={{ marginTop: space.md }} onPress={() => book(s.id, date)} />
      </View>
    </Card>
  );
}

export default function CaptainProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useCaptain(id);
  const qc = useQueryClient();
  const compare = useCompare();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"trips" | "itineraries" | "reels" | "photos" | "reviews">("trips");
  // A free day tapped on the availability calendar; carried into booking.
  const [picked, setPicked] = useState<string | undefined>();
  // Full lists load when their tab opens; the profile itself carries the latest few.
  const media = useQuery({
    queryKey: ["captain-posts", id, tab],
    queryFn: () => api.get<Paginated<Post>>("/social/feed/", { captain: q.data!.id, kind: tab === "photos" ? "photo" : "reel", page_size: 30 }),
    enabled: !!q.data && (tab === "reels" || tab === "photos"),
  });
  const reviews = useQuery({
    queryKey: ["captain-reviews", id],
    queryFn: () => api.get<Paginated<Review>>(`/reviews/captains/${q.data!.id}/`, { page_size: 50 }),
    enabled: !!q.data && tab === "reviews",
  });
  const [gridW, onGridLayout] = useMeasuredWidth(useWindowDimensions().width - space.lg * 2);
  const cols = gridW > 700 ? 5 : 3;
  const tileW = (gridW - 8 * (cols - 1)) / cols;

  // Parallax hero + top bar that fades in once the hero has scrolled away.
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(y.value, [-200, 0, HERO_H], [-100, 0, HERO_H * 0.45], Extrapolation.CLAMP) },
      { scale: interpolate(y.value, [-200, 0], [1.6, 1], Extrapolation.CLAMP) },
    ],
  }));
  const barBgStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [HERO_H - 120, HERO_H - 40], [0, 1], Extrapolation.CLAMP) }));
  const barTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [HERO_H, HERO_H + 40], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(y.value, [HERO_H, HERO_H + 40], [8, 0], Extrapolation.CLAMP) }],
  }));

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }}>
        <Header title="Captain" />
        <ErrorView error={q.error ?? { message: "This Captain isn't available right now." }} onRetry={q.refetch} />
      </SafeAreaView>
    );
  const c = q.data;
  const firstService = c.services[0];

  const cover = c.services.find((s) => s.cover_image)?.cover_image;

  return (
    <View style={{ flex: 1, backgroundColor: palette.sand }}>
      {/* Top bar floats over the hero, then turns solid with the name as you scroll. */}
      <Animated.View style={[styles.bar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.barBg, barBgStyle]} />
        <GlassIcon icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <Animated.View style={[{ flex: 1, paddingHorizontal: space.sm }, barTitleStyle]}>
          <T variant="h2" numberOfLines={1}>{c.name}</T>
          <T variant="caption" numberOfLines={1}>{c.code} · {c.city_name}</T>
        </Animated.View>
        <GlassIcon
          icon={c.saved ? "heart" : "heart-outline"}
          color={c.saved ? palette.coral : undefined}
          label={c.saved ? "Unsave" : "Save"}
          onPress={() => toggleSave(qc, c.id, !!c.saved).catch(toastError)}
        />
      </Animated.View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <Animated.View style={[styles.hero, heroStyle]}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={300} /> : null}
          <LinearGradient colors={cover ? ["rgba(1,26,66,0.35)", "rgba(1,26,66,0.15)", "rgba(1,26,66,0.85)"] : (gradients.night as any)} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <View style={{ paddingHorizontal: space.lg }}>
          <Appear style={styles.identity}>
            <View style={styles.avatarWrap}>
              <Avatar uri={c.avatar} name={c.name} size={104} verified={c.verified} ring />
            </View>
            <T variant="display" style={{ marginTop: space.md }}>{c.name}</T>
            {c.tagline ? <T variant="body" style={{ marginTop: 2 }}>{c.tagline}</T> : null}
            <Row gap={6} style={{ marginTop: 6 }}>
              <Ionicons name="location" size={13} color={palette.muted} />
              <T variant="caption">{c.city_name} · {c.code}</T>
            </Row>
            <View style={styles.kpis}>
              {([
                ["star", Number(c.rating_avg) > 0 ? Number(c.rating_avg).toFixed(1) : "New", c.rating_count ? `${c.rating_count} reviews` : "Rating"],
                ["navigate", String(c.trips_completed), "Trips"],
                ["time", `${c.years_experience}y`, "Experience"],
              ] as const).map(([icon, value, label], i) => (
                <View key={label} style={[styles.kpi, i > 0 && styles.kpiSep]}>
                  <Row gap={4}>
                    <Ionicons name={icon} size={14} color={icon === "star" ? palette.marigold : palette.rickshaw} />
                    <T variant="title" style={{ fontSize: 20, lineHeight: 24 }}>{value}</T>
                  </Row>
                  <T variant="caption" style={{ fontSize: 11.5 }}>{label}</T>
                </View>
              ))}
            </View>
          </Appear>
        <Row gap={6} style={{ flexWrap: "wrap", marginTop: space.lg }}>
          <Badge
            label={c.captain_type === "guide" ? "Local guide · walks with you" : "Captain · does everything"}
            icon={c.captain_type === "guide" ? "walk" : "briefcase"}
            bg={c.captain_type === "guide" ? palette.marigoldSoft : palette.rickshawSoft}
            fg={c.captain_type === "guide" ? palette.warning : palette.rickshaw}
          />
          {c.is_verified ? <Badge label="GoLoc Verified" icon="checkmark-done-circle" bg={palette.night} fg={palette.marigold} /> : null}
          {c.verified ? <Badge label="ID checked" icon="shield-checkmark" bg={palette.successSoft} fg={palette.success} /> : null}
          <Badge label={c.city_name} icon="location" />
          {c.agency_name ? <Badge label={`With ${c.agency_name}`} icon="business" /> : null}
          {c.languages.map((l) => <Badge key={l} label={l} icon="language" />)}
          {c.vehicles.map((v, i) => <Badge key={i} label={`${v.make_model} · ${v.capacity} seats${v.has_ac ? " · AC" : ""}`} icon="car" />)}
        </Row>
        {c.bio ? <T style={{ marginTop: space.md }}>{c.bio}</T> : null}
        {c.stats ? (
          <View style={styles.stats}>
            {([
              ["Trips done", String(c.stats.trips_completed)],
              ["Rating", Number(c.stats.rating_avg) > 0 ? Number(c.stats.rating_avg).toFixed(1) : "New"],
              ["Reviews", String(c.stats.reviews)],
              ["Itineraries", String(c.stats.itineraries_prepared)],
              ["Reels", String(c.stats.reels)],
              ["Photos", String(c.stats.photos)],
            ] as const).map(([label, value]) => (
              <View key={label} style={styles.stat}>
                <T variant="h2">{value}</T>
                <T variant="caption" style={{ fontSize: 11 }}>{label}</T>
              </View>
            ))}
          </View>
        ) : null}
        {c.stats?.member_since ? <T variant="caption" style={{ marginTop: 6 }}>On GoLoc since {new Date(c.stats.member_since).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</T> : null}
        <Row gap={10} style={{ marginTop: space.lg }}>
          <Button title="Message" icon="chatbubble-ellipses" kind="secondary" small style={{ flex: 1 }} onPress={() => openChat({ captain_id: c.id })} />
          <Button
            title={compare.ids.includes(c.id) ? "In compare" : "Compare"}
            icon="git-compare"
            kind="secondary"
            small
            style={{ flex: 1 }}
            onPress={() => {
              compare.toggle(c.id);
              if (!compare.ids.includes(c.id) && compare.ids.length >= 1) router.push("/compare");
            }}
          />
        </Row>

        <Card style={{ marginTop: space.lg }}>
          <Row style={{ justifyContent: "space-between", marginBottom: space.sm }}>
            <T variant="h2">Availability</T>
            <Badge label={c.city_name} icon="location" />
          </Row>
          <T variant="caption" style={{ marginBottom: space.md }}>
            When {c.name.split(" ")[0]} can take you around {c.city_name}. Tap a green day to book it.
          </T>
          <CaptainAvailability captainId={c.id} selected={picked} onPick={(iso) => setPicked(iso === picked ? undefined : iso)} />
          {picked ? (
            <View style={styles.picked}>
              <T variant="bodyBold">{longDate(picked)} is free</T>
              {c.services.length === 1 ? (
                <Button title="Book this day" icon="calendar" small style={{ marginTop: space.sm }} onPress={() => book(c.services[0].id, picked)} />
              ) : (
                <>
                  <T variant="caption" style={{ marginTop: 2, marginBottom: space.sm }}>Choose a trip:</T>
                  <View style={{ gap: 6 }}>
                    {c.services.map((s) => (
                      <Pressable key={s.id} onPress={() => book(s.id, picked)} style={styles.pickRow}>
                        <T variant="small" style={{ flex: 1 }} numberOfLines={1}>{s.title}</T>
                        <T variant="bodyBold">{money(s.from_price)}</T>
                        <Ionicons name="chevron-forward" size={16} color={palette.muted} />
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          ) : null}
        </Card>

        <View style={{ marginTop: space.xl }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "trips", label: "Trips", count: c.services.length },
              { value: "itineraries", label: "Plans", count: (c.itineraries ?? []).length },
              { value: "reels", label: "Reels", count: c.stats?.reels ?? 0 },
              { value: "photos", label: "Photos", count: c.stats?.photos ?? 0 },
              { value: "reviews", label: "Reviews", count: c.stats?.reviews ?? c.rating_count },
            ]}
          />
        </View>

        <View style={{ marginTop: space.lg, gap: space.md }}>
          {tab === "itineraries" && !(c.itineraries ?? []).length ? (
            <Empty icon="document-text-outline" title="No sample itineraries yet"
              body={`${c.name.split(" ")[0]} has prepared ${c.stats?.itineraries_prepared ?? 0} itinerar${c.stats?.itineraries_prepared === 1 ? "y" : "ies"} for travelers. You get your own after booking.`} />
          ) : null}
          {tab === "itineraries" && (c.itineraries ?? []).length ? (
            <View style={{ gap: space.sm }}>
              <T variant="h2">Sample itineraries</T>
              <T variant="caption">How {c.name.split(" ")[0]} plans these trips, day by day. Yours is tailored after you book.</T>
              {c.itineraries.map((it) => (
                <Pressable key={it.id} onPress={() => router.push(`/itinerary/${it.id}`)}>
                  <PosterCard poster={it.poster} it={it} compact />
                </Pressable>
              ))}
            </View>
          ) : null}
          {tab === "trips" &&
            (c.services.length ? c.services.map((s) => <ServiceCard key={s.id} s={s} date={picked} />) : <Empty title="No trips listed yet" />)}
          {(tab === "reels" || tab === "photos") &&
            (media.isLoading ? (
              <SkeletonList rows={2} />
            ) : (media.data?.results ?? []).length ? (
              <View style={styles.grid} onLayout={onGridLayout}>
                {media.data!.results.map((p, i) => (
                  <ReelTile key={p.id} p={p} width={tileW} onPress={() => router.push({ pathname: "/reels", params: { captain: c.id, start: String(i), kind: p.kind } })} />
                ))}
              </View>
            ) : (
              <Empty icon={tab === "photos" ? "images-outline" : "film-outline"} title={tab === "photos" ? "No photos yet" : "No reels yet"} />
            ))}
          {tab === "reviews" &&
            (reviews.isLoading ? (
              <SkeletonList rows={3} />
            ) : (reviews.data?.results ?? []).length ? (
              reviews.data!.results.map((r) => (
                <Card key={r.id}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <T variant="bodyBold">{r.traveler_name}</T>
                    <Rating value={r.rating} />
                  </Row>
                  {r.trip_title ? <T variant="caption">{r.trip_title} · {timeAgo(r.created_at)}</T> : null}
                  {r.comment ? <T style={{ marginTop: 6 }}>{r.comment}</T> : null}
                  {r.captain_reply ? (
                    <View style={styles.reply}>
                      <T variant="label">Reply from {c.name.split(" ")[0]}</T>
                      <T variant="small" style={{ marginTop: 2 }}>{r.captain_reply}</T>
                    </View>
                  ) : null}
                </Card>
              ))
            ) : (
              <Empty icon="star-outline" title="No reviews yet" body="Be the first to travel with this Captain." />
            ))}
        </View>
        </View>
      </Animated.ScrollView>
      {firstService ? (
        <Appear delay={300} style={[styles.footer, { bottom: Math.max(insets.bottom, space.md) }]}>
          <View style={{ flex: 1, paddingLeft: 6 }}>
            <T variant="caption" color="rgba(255,255,255,0.6)">From</T>
            <T variant="title" color={palette.white} style={{ fontSize: 21, lineHeight: 25 }}>{money(c.from_price)}</T>
          </View>
          <Button title={picked ? `Book ${longDate(picked)}` : "Book your trip"} icon="calendar" onPress={() => (c.services.length === 1 ? book(firstService.id, picked) : setTab("trips"))} style={{ flex: 1.5 }} />
        </Appear>
      ) : null}
    </View>
  );
}

function GlassIcon({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color?: string; onPress: () => void }) {
  return (
    <Pressy onPress={onPress} haptic scaleTo={0.85} accessibilityLabel={label} style={styles.glass}>
      <Ionicons name={icon} size={21} color={color ?? palette.ink} />
    </Pressy>
  );
}

const styles = StyleSheet.create({
  tier: { flex: 1, backgroundColor: palette.sand, borderRadius: radius.sm, padding: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stats: { flexDirection: "row", flexWrap: "wrap", marginTop: space.lg, backgroundColor: palette.paper, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, paddingVertical: space.sm, ...shadow, shadowOpacity: 0.04 },
  stat: { width: "33.33%", alignItems: "center", paddingVertical: space.sm },
  picked: { marginTop: space.md, padding: space.md, backgroundColor: palette.successSoft, borderRadius: radius.md },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: palette.white, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 12 },
  reply: { marginTop: space.sm, padding: space.md, backgroundColor: palette.sand, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: palette.rickshaw },
  bar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingBottom: 10 },
  barBg: { backgroundColor: palette.paper, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  glass: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", ...shadow, shadowOpacity: 0.12 },
  hero: { height: HERO_H, overflow: "hidden", borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
  identity: { marginTop: -62, alignItems: "center" },
  avatarWrap: { borderRadius: 60, padding: 4, backgroundColor: palette.sand, ...lift, shadowOpacity: 0.2 },
  kpis: { flexDirection: "row", alignSelf: "stretch", marginTop: space.lg, backgroundColor: palette.paper, borderRadius: 22, paddingVertical: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, ...shadow },
  kpi: { flex: 1, alignItems: "center", gap: 2 },
  kpiSep: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: palette.lineStrong },
  footer: {
    position: "absolute", left: space.lg, right: space.lg, flexDirection: "row", alignItems: "center", gap: space.md,
    backgroundColor: palette.night, borderRadius: 26, padding: 8, paddingLeft: space.md, ...lift, shadowOpacity: 0.3,
  },
});
