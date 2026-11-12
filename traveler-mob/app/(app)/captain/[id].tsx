import { Ionicons } from "@expo/vector-icons";
import {
  api, Appear, Avatar, Badge, Button, CaptainAvailability, Card, Chip, Empty, ErrorView, gradients, Header, lift, LinearGradient, Loading, money, openChat, Paginated, palette, Post, PosterCard,
  Pressy, radius, Rating, Review, Row, Service, shadow, SkeletonList, longDate, space, T, timeAgo, titleCase, toastError, useMeasuredWidth, GroupTripCard,
} from "@goloc/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ReelTile } from "../../../lib/cards";
import { toggleSave, upcoming, useCaptain, useCompare, useGroupTrips, useTripPlan } from "../../../lib/data";

const HERO_H = 240;
const GAP = space.xxl + space.sm;

/**
 * Opens the booking screen with the traveler's dates and group size already filled in:
 * the day picked on the calendar, else the dates they searched with.
 */
const book = (serviceId: string, date?: string) => {
  const plan = useTripPlan.getState();
  const start = date ?? upcoming(plan.start);
  const end = start && start === plan.start ? plan.end : undefined;
  router.push({
    pathname: "/book/[serviceId]",
    params: { serviceId, ...(start ? { date: start } : {}), ...(end ? { end } : {}), ...(plan.guests ? { guests: String(plan.guests) } : {}) },
  });
};

function ServiceCard({ s, date }: { s: Service; date?: string }) {
  const pkg = s.kind === "package";
  const guide = s.kind === "guide";
  return (
    <Card onPress={() => book(s.id, date)} padded={false} style={{ overflow: "hidden" }}>
      {s.cover_image ? <Image source={{ uri: s.cover_image }} style={{ height: 170 }} contentFit="cover" cachePolicy="memory-disk" /> : null}
      <View style={{ padding: space.xl }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Badge
            label={pkg ? `${s.duration_days}D package` : guide ? `Guide · ${s.duration_hours}h a day` : `${s.duration_hours}h experience`}
            bg={palette.rickshawSoft}
            fg={palette.rickshaw}
          />
          <T variant="caption">{titleCase(s.category)} · up to {s.max_guests}</T>
        </Row>
        <T variant="h2" style={{ marginTop: space.md }}>{s.title}</T>
        {s.description ? <T variant="caption" numberOfLines={2} style={{ marginTop: 4 }}>{s.description}</T> : null}
        {pkg ? (
          <Row style={{ marginTop: space.lg }} gap={8}>
            {(["normal", "medium", "lavish"] as const).map((t) => (
              <View key={t} style={styles.tier}>
                <T variant="label">{t}</T>
                <T variant="bodyBold" style={{ marginTop: 4 }}>{money(s[`${t}_price`])}</T>
                <T variant="caption" style={{ fontSize: 11 }}>per person</T>
              </View>
            ))}
          </Row>
        ) : (
          <Row style={{ marginTop: space.lg, justifyContent: "space-between", gap: space.md }}>
            <T variant="caption" style={{ flex: 1 }}>{s.stops.slice(0, 3).join(" → ")}</T>
            <View style={{ alignItems: "flex-end" }}>
              <T variant="h2">{money(s.price)}{guide ? <T variant="caption"> /day</T> : null}</T>
              <T variant="caption" style={{ fontSize: 11 }}>for {s.included_guests} · +{money(s.extra_guest_price)}/extra{guide ? " per day" : ""}</T>
            </View>
          </Row>
        )}
        <Button title={date ? `Book from ${longDate(date)}` : guide ? "Pick your dates" : "Book your trip"} style={{ marginTop: space.lg }} onPress={() => book(s.id, date)} />
      </View>
    </Card>
  );
}

export default function CaptainProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useCaptain(id);
  const groups = useGroupTrips({ captain: q.data?.id });
  const qc = useQueryClient();
  const compare = useCompare();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"trips" | "itineraries" | "reels" | "photos" | "reviews">("trips");
  // A free day tapped on the availability calendar; carried into booking.
  const [picked, setPicked] = useState<string | undefined>(() => upcoming(useTripPlan.getState().start));
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
  const [gridW, onGridLayout] = useMeasuredWidth(useWindowDimensions().width - space.xl * 2);
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
  const firstName = c.name.split(" ")[0];
  const firstService = c.services[0];
  const cover = c.services.find((s) => s.cover_image)?.cover_image;
  const guide = c.captain_type === "guide";

  return (
    <View style={{ flex: 1, backgroundColor: palette.sand }}>
      {/* Top bar floats over the hero, then turns solid with the name as you scroll. */}
      <Animated.View style={[styles.bar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.barBg, barBgStyle]} />
        <RoundIcon icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <Animated.View style={[{ flex: 1, paddingHorizontal: space.md }, barTitleStyle]}>
          <T variant="h2" numberOfLines={1}>{c.name}</T>
          <T variant="caption" numberOfLines={1}>{c.city_name}</T>
        </Animated.View>
        <RoundIcon
          icon={c.saved ? "heart" : "heart-outline"}
          color={c.saved ? palette.coral : undefined}
          label={c.saved ? "Unsave" : "Save"}
          onPress={() => toggleSave(qc, c.id, !!c.saved).catch(toastError)}
        />
      </Animated.View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        <Animated.View style={[styles.hero, heroStyle]}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={300} /> : null}
          <LinearGradient colors={cover ? (gradients.glassDark as any) : (gradients.night as any)} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <View style={{ paddingHorizontal: space.xl }}>
          {/* ---------- identity ---------- */}
          <Appear style={styles.identity}>
            <View style={styles.avatarWrap}>
              <Avatar uri={c.avatar} name={c.name} size={104} verified={c.verified} />
            </View>
            <Row gap={6} style={{ marginTop: space.lg }}>
              <T variant="display" style={{ flexShrink: 1 }} numberOfLines={2}>{c.name}</T>
              {c.is_verified ? <Ionicons name="checkmark-circle" size={20} color={palette.rickshaw} accessibilityLabel="GoLoc Verified" /> : null}
            </Row>
            {c.tagline ? <T variant="body" center style={{ marginTop: space.sm, maxWidth: 320 }}>{c.tagline}</T> : null}
            <T variant="caption" center style={{ marginTop: space.sm }}>
              {guide ? "Local guide" : "Captain"} · {c.city_name} · {c.code}
            </T>
          </Appear>

          {/* ---------- headline numbers ---------- */}
          <View style={styles.kpis}>
            {([
              [Number(c.rating_avg) > 0 ? Number(c.rating_avg).toFixed(1) : "New", c.rating_count ? `${c.rating_count} reviews` : "Rating"],
              [String(c.trips_completed), "Trips"],
              [`${c.years_experience} yr${c.years_experience === 1 ? "" : "s"}`, "Experience"],
            ] as const).map(([value, label]) => (
              <View key={label} style={styles.kpi}>
                <T variant="title" style={{ fontSize: 21, lineHeight: 26 }}>{value}</T>
                <T variant="caption" style={{ marginTop: 2 }}>{label}</T>
              </View>
            ))}
          </View>

          <Row gap={space.md} style={{ marginTop: space.xl }}>
            <Button title="Message" icon="chatbubble-ellipses-outline" kind="secondary" style={{ flex: 1 }} onPress={() => openChat({ captain_id: c.id })} />
            <Button
              title={compare.ids.includes(c.id) ? "In compare" : "Compare"}
              icon="git-compare-outline"
              kind="secondary"
              style={{ flex: 1 }}
              onPress={() => {
                compare.toggle(c.id);
                if (!compare.ids.includes(c.id) && compare.ids.length >= 1) router.push("/compare");
              }}
            />
          </Row>

          {/* ---------- about ---------- */}
          <View style={{ marginTop: GAP }}>
            <T variant="title">About {firstName}</T>
            {c.bio ? <T style={{ marginTop: space.md }}>{c.bio}</T> : null}
            <View style={{ marginTop: space.lg, gap: space.md }}>
              <Fact
                icon={guide ? "walk-outline" : "briefcase-outline"}
                text={guide ? "Walks with you in person. You plan your own stay and travel." : "Handles everything: stay, meals, transport, permits and guiding."}
              />
              {c.verified ? <Fact icon="shield-checkmark-outline" text="ID checked by GoLoc" /> : null}
              {c.languages.length ? <Fact icon="language-outline" text={`Speaks ${c.languages.join(", ")}`} /> : null}
              {c.vehicles.map((v, i) => <Fact key={i} icon="car-outline" text={`${v.make_model} · ${v.capacity} seats${v.has_ac ? " · AC" : ""}`} />)}
              {c.agency_name ? <Fact icon="business-outline" text={`Works with ${c.agency_name}`} /> : null}
              {c.stats?.member_since ? (
                <Fact icon="calendar-outline" text={`On GoLoc since ${new Date(c.stats.member_since).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`} />
              ) : null}
            </View>
          </View>

          {/* ---------- availability ---------- */}
          <Card style={{ marginTop: GAP, padding: space.xl }}>
            <T variant="title">Availability</T>
            <T variant="caption" style={{ marginTop: 4, marginBottom: space.lg }}>
              When {firstName} can take you around {c.city_name}. Tap a green day to book it.
            </T>
            <CaptainAvailability captainId={c.id} selected={picked} onPick={(iso) => setPicked(iso === picked ? undefined : iso)} />
            {picked ? (
              <View style={styles.picked}>
                <T variant="bodyBold">{longDate(picked)}</T>
                {c.services.length === 1 ? (
                  <Button title="Book this day" icon="calendar" small style={{ marginTop: space.md }} onPress={() => book(c.services[0].id, picked)} />
                ) : (
                  <>
                    <T variant="caption" style={{ marginTop: 2, marginBottom: space.md }}>Choose a trip:</T>
                    <View style={{ gap: 8 }}>
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

          {/* ---------- group departures ---------- */}
          {groups.data?.length ? (
            <View style={{ marginTop: GAP }}>
              <T variant="title">Group trips</T>
              <T variant="caption" style={{ marginTop: 4, marginBottom: space.md }}>Join other travelers on {firstName}'s fixed dates. Pay per seat.</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.xl }}
                contentContainerStyle={{ gap: 14, paddingHorizontal: space.xl, paddingBottom: 6 }}>
                {groups.data.map((g) => (
                  <GroupTripCard key={g.id} g={g} width={270} showCaptain={false} onPress={() => router.push(`/group/${g.id}`)} />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* ---------- tabs ---------- */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: GAP, marginHorizontal: -space.xl }} contentContainerStyle={{ gap: 8, paddingHorizontal: space.xl }}>
            {([
              ["trips", "Trips", c.services.length],
              ["itineraries", "Plans", (c.itineraries ?? []).length],
              ["reels", "Reels", c.stats?.reels ?? 0],
              ["photos", "Photos", c.stats?.photos ?? 0],
              ["reviews", "Reviews", c.stats?.reviews ?? c.rating_count],
            ] as const).map(([value, label, count]) => (
              <Chip key={value} label={count ? `${label} · ${count}` : label} active={tab === value} onPress={() => setTab(value)} />
            ))}
          </ScrollView>

          <View style={{ marginTop: space.xl, gap: space.lg }}>
            {tab === "itineraries" && !(c.itineraries ?? []).length ? (
              <Empty
                icon="document-text-outline"
                title="No sample itineraries yet"
                body={`${firstName} has prepared ${c.stats?.itineraries_prepared ?? 0} itinerar${c.stats?.itineraries_prepared === 1 ? "y" : "ies"} for travelers. You get your own after booking.`}
              />
            ) : null}
            {tab === "itineraries" && (c.itineraries ?? []).length ? (
              <View style={{ gap: space.md }}>
                <T variant="caption">How {firstName} plans these trips, day by day. Yours is tailored after you book.</T>
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
                  <Card key={r.id} style={{ padding: space.xl }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <T variant="bodyBold">{r.traveler_name}</T>
                      <Rating value={r.rating} />
                    </Row>
                    {r.trip_title ? <T variant="caption" style={{ marginTop: 2 }}>{r.trip_title} · {timeAgo(r.created_at)}</T> : null}
                    {r.comment ? <T style={{ marginTop: space.md }}>{r.comment}</T> : null}
                    {r.captain_reply ? (
                      <View style={styles.reply}>
                        <T variant="label">Reply from {firstName}</T>
                        <T variant="small" style={{ marginTop: 4 }}>{r.captain_reply}</T>
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
            <T variant="caption" color={palette.onDarkMuted}>From</T>
            <T variant="title" color={palette.white} style={{ fontSize: 21, lineHeight: 25 }}>{money(c.from_price)}</T>
          </View>
          <Button title={picked ? `Book ${longDate(picked)}` : "Book your trip"} icon="calendar" onPress={() => (c.services.length === 1 ? book(firstService.id, picked) : setTab("trips"))} style={{ flex: 1.5 }} />
        </Appear>
      ) : null}
    </View>
  );
}

function Fact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <Row gap={space.md} style={{ alignItems: "flex-start" }}>
      <Ionicons name={icon} size={18} color={palette.rickshaw} style={{ marginTop: 2 }} />
      <T style={{ flex: 1 }}>{text}</T>
    </Row>
  );
}

function RoundIcon({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color?: string; onPress: () => void }) {
  return (
    <Pressy onPress={onPress} haptic scaleTo={0.85} accessibilityLabel={label} style={styles.round}>
      <Ionicons name={icon} size={21} color={color ?? palette.ink} />
    </Pressy>
  );
}

const styles = StyleSheet.create({
  tier: { flex: 1, backgroundColor: palette.sand, borderRadius: radius.md, padding: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  picked: { marginTop: space.lg, padding: space.lg, backgroundColor: palette.successSoft, borderRadius: radius.md },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: palette.white, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 12 },
  reply: { marginTop: space.md, padding: space.md, backgroundColor: palette.sand, borderRadius: radius.md },
  bar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: space.xl, paddingBottom: 10 },
  barBg: { backgroundColor: palette.paper, ...shadow },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.white, alignItems: "center", justifyContent: "center", ...shadow },
  hero: { height: HERO_H, overflow: "hidden" },
  identity: { marginTop: -56, alignItems: "center" },
  avatarWrap: { borderRadius: 60, padding: 4, backgroundColor: palette.sand },
  kpis: { flexDirection: "row", marginTop: space.xl, backgroundColor: palette.paper, borderRadius: radius.xl, paddingVertical: space.lg, ...shadow },
  kpi: { flex: 1, alignItems: "center" },
  footer: {
    position: "absolute", left: space.xl, right: space.xl, flexDirection: "row", alignItems: "center", gap: space.md,
    backgroundColor: palette.night, borderRadius: radius.xl, padding: 8, paddingLeft: space.lg, ...lift,
  },
});
