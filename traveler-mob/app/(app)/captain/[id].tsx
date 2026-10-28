import { Ionicons } from "@expo/vector-icons";
import {
  api, Avatar, Badge, Button, Card, Empty, ErrorView, Header, Loading, money, openChat, Paginated, palette, Post, PosterCard, radius, Rating, Review, Row, Segmented, Service, SkeletonList,
  space, T, timeAgo, titleCase, toastError, useMeasuredWidth,
} from "@goloc/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ReelTile } from "../../../lib/cards";
import { toggleSave, useCaptain, useCompare } from "../../../lib/data";

function ServiceCard({ s }: { s: Service }) {
  const pkg = s.kind === "package";
  const guide = s.kind === "guide";
  return (
    <Card onPress={() => router.push(`/book/${s.id}`)} padded={false} style={{ overflow: "hidden" }}>
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
        <Button title={guide ? "Pick your dates" : "Book your trip"} small style={{ marginTop: space.md }} onPress={() => router.push(`/book/${s.id}`)} />
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <Header
        title={c.name}
        subtitle={`${c.code} · ${c.city_name}`}
        right={
          <Pressable
            hitSlop={10}
            onPress={() => toggleSave(qc, c.id, !!c.saved).catch(toastError)}
            accessibilityLabel={c.saved ? "Unsave" : "Save"}
          >
            <Ionicons name={c.saved ? "heart" : "heart-outline"} size={26} color={c.saved ? palette.coral : palette.ink} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 120 }}>
        <Row gap={space.lg} style={{ marginTop: space.sm }}>
          <Avatar uri={c.avatar} name={c.name} size={84} verified={c.verified} />
          <View style={{ flex: 1 }}>
            <T variant="title">{c.name}</T>
            {c.tagline ? <T variant="caption">{c.tagline}</T> : null}
            <Row gap={12} style={{ marginTop: 6 }}>
              <Rating value={c.rating_avg} count={c.rating_count} />
              <T variant="caption">{c.trips_completed} trips</T>
              <T variant="caption">{c.years_experience} yrs</T>
            </Row>
          </View>
        </Row>
        <Row gap={6} style={{ flexWrap: "wrap", marginTop: space.md }}>
          <Badge
            label={c.captain_type === "guide" ? "Local guide · walks with you" : "Captain · does everything"}
            icon={c.captain_type === "guide" ? "walk" : "briefcase"}
            bg={c.captain_type === "guide" ? palette.marigoldSoft : palette.rickshawSoft}
            fg={c.captain_type === "guide" ? palette.warning : palette.rickshaw}
          />
          {c.verified ? <Badge label="ID verified" icon="shield-checkmark" bg={palette.successSoft} fg={palette.success} /> : null}
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
            (c.services.length ? c.services.map((s) => <ServiceCard key={s.id} s={s} />) : <Empty title="No trips listed yet" />)}
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
      </ScrollView>
      {firstService ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <View style={{ flex: 1 }}>
            <T variant="caption">From</T>
            <T variant="h2">{money(c.from_price)}</T>
          </View>
          <Button title="Book your trip" icon="calendar" onPress={() => (c.services.length === 1 ? router.push(`/book/${firstService.id}`) : setTab("trips"))} style={{ flex: 1.4 }} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tier: { flex: 1, backgroundColor: palette.sand, borderRadius: radius.sm, padding: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stats: { flexDirection: "row", flexWrap: "wrap", marginTop: space.lg, backgroundColor: palette.paper, borderRadius: radius.md, borderWidth: 1, borderColor: palette.line, paddingVertical: space.sm },
  stat: { width: "33.33%", alignItems: "center", paddingVertical: space.sm },
  reply: { marginTop: space.sm, padding: space.md, backgroundColor: palette.sand, borderRadius: radius.sm },
  footer: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: palette.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
});
