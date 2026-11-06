import { Ionicons } from "@expo/vector-icons";
import {
  Appear, Button, Empty, Float, fonts, gradients, LinearGradient, palette, Pressy, radius, Row, Section, Sheet, Skeleton, space, T, toastError,
  useAuth, useUnreadCount,
} from "@goloc/core";
import { router } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CaptainRow, CategoryTile, ReelTile } from "../../../lib/cards";
import { changeCity, useCities, useCity, useDiscovery, useDiscoverFeed, useFeed } from "../../../lib/data";
import { PosterRail } from "../../../lib/discover";

const CATEGORIES = ["food", "heritage", "culture", "adventure", "photography", "nature", "shopping", "spiritual"];

const QUICK: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; colors: readonly [string, string]; go: () => void }[] = [
  { icon: "sparkles", title: "Build my trip", sub: "Dates in, match out", colors: gradients.sunset, go: () => router.push("/build-trip") },
  { icon: "people", title: "Find a Captain", sub: "Search & filter", colors: gradients.traveler, go: () => router.push("/explore") },
  { icon: "play", title: "Reels", sub: "See it first", colors: ["#0B63E0", "#0047B6"], go: () => router.push({ pathname: "/reels", params: { start: "0" } }) },
  { icon: "heart", title: "Saved", sub: "Your wishlist", colors: ["#FFB21A", "#FE7902"], go: () => router.push("/saved") },
];

export default function Discover() {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const city = useCity();
  const cities = useCities();
  const unread = useUnreadCount();
  const feed = useFeed(city?.slug);
  const top = useDiscovery({ city: city?.slug, page_size: "6" });
  const discover = useDiscoverFeed(city?.slug);
  const picks = discover.data?.picks ?? [];
  const [cityOpen, setCityOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const first = (user?.full_name || "").split(" ")[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const posts = feed.data?.results ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: palette.sand }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.white}
            progressViewOffset={insets.top}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([feed.refetch(), top.refetch(), discover.refetch()]);
              setRefreshing(false);
            }}
          />
        }
      >
        {/* ---------- hero ---------- */}
        <View style={styles.heroWrap}>
          <LinearGradient colors={gradients.night as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + space.sm }]}>
            <View style={styles.top}>
              <Pressy onPress={() => setCityOpen(true)} style={styles.cityBtn} haptic>
                <View style={styles.cityDot}><Ionicons name="location" size={13} color={palette.night} /></View>
                <T variant="bodyBold" color={palette.white}>{city?.name ?? "Choose city"}</T>
                <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" />
              </Pressy>
              <Row>
                <GlassButton icon="shield-checkmark-outline" label="Safety" onPress={() => router.push("/safety")} />
                <GlassButton icon="notifications-outline" label="Notifications" badge={unread.data} onPress={() => router.push("/notifications")} />
              </Row>
            </View>

            <Appear i={0}>
              <T variant="label" color={palette.marigold} style={{ marginTop: space.xl }}>{greet}{first ? `, ${first}` : ""} 👋</T>
            </Appear>
            <Appear i={1}>
              <T variant="hero" color={palette.white} style={{ marginTop: 6 }}>Where will a{"\n"}local take you next?</T>
            </Appear>
            <Float distance={5} duration={3200} style={styles.heroBadge}>
              <View style={styles.heroBadgeInner}>
                <Ionicons name="shield-checkmark" size={14} color={palette.marigold} />
                <T variant="small" color={palette.white} style={{ fontFamily: fonts.bold }}>Verified locals</T>
              </View>
            </Float>
          </LinearGradient>

          <Appear i={2} style={styles.searchWrap}>
            <Pressy onPress={() => router.push("/explore")} scaleTo={0.98} style={styles.search}>
              <View style={styles.searchIcon}><Ionicons name="search" size={18} color={palette.white} /></View>
              <View style={{ flex: 1 }}>
                <T variant="bodyBold">Search Captains & trips</T>
                <T variant="caption" numberOfLines={1}>Name, city, GLAC-ID, dates, group size</T>
              </View>
              <View style={styles.filterIcon}><Ionicons name="options-outline" size={18} color={palette.ink} /></View>
            </Pressy>
          </Appear>
        </View>

        {/* ---------- quick actions ---------- */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick}>
          {QUICK.map((q, i) => (
            <Appear key={q.title} i={3 + i}>
              <Pressy onPress={q.go} haptic style={styles.quickTile}>
                <LinearGradient colors={q.colors as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.quickIcon}>
                  <Ionicons name={q.icon} size={20} color={palette.white} />
                </LinearGradient>
                <T variant="bodyBold" style={{ marginTop: 10 }}>{q.title}</T>
                <T variant="caption" numberOfLines={1}>{q.sub}</T>
              </Pressy>
            </Appear>
          ))}
        </ScrollView>

        {/* ---------- seasonal posters ---------- */}
        {picks.length ? (
          <PosterRail
            title={discover.data!.headline}
            subtitle={discover.data!.subhead}
            badge={discover.data!.ai ? `AI picks · ${discover.data!.season.label}` : `${discover.data!.season.label} picks`}
            items={picks}
          />
        ) : discover.isLoading ? (
          <Row style={{ paddingHorizontal: space.lg, marginTop: space.xl }} gap={14}>{[0, 1].map((i) => <Skeleton key={i} w={270} h={360} r={28} />)}</Row>
        ) : null}

        {/* ---------- build my trip ---------- */}
        <Appear style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
          <Pressy onPress={() => router.push("/build-trip")} scaleTo={0.98}>
            <LinearGradient colors={gradients.sunset as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buildCard}>
              <View style={styles.buildRing} />
              <View style={[styles.buildRing, { right: -10, top: 50, width: 90, height: 90 }]} />
              <View style={{ flex: 1 }}>
                <View style={styles.buildPill}><T variant="label" color={palette.white} style={{ letterSpacing: 1 }}>2 minutes</T></View>
                <T variant="title" color={palette.white} style={{ marginTop: 8 }}>Build my trip</T>
                <T variant="small" color="rgba(255,255,255,0.9)" style={{ marginTop: 4 }}>Tell us your dates and group. We show only Captains who are free.</T>
              </View>
              <View style={styles.buildArrow}><Ionicons name="arrow-forward" size={22} color={palette.coral} /></View>
            </LinearGradient>
          </Pressy>
        </Appear>

        {/* ---------- reels ---------- */}
        <Section title="Reels from Captains" action={posts.length ? "Watch all" : undefined} onAction={() => router.push({ pathname: "/reels", params: { city: city?.slug, start: "0" } })} style={{ paddingHorizontal: space.lg, marginTop: space.xxl }}>
          <View />
        </Section>
        {feed.isLoading ? (
          <Row style={{ paddingHorizontal: space.lg }} gap={10}>{[0, 1, 2].map((i) => <Skeleton key={i} w={140} h={230} r={20} />)}</Row>
        ) : posts.length ? (
          <FlatList
            horizontal
            data={posts}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.lg, gap: 12 }}
            renderItem={({ item, index }) => (
              <Appear i={index}>
                <ReelTile p={item} onPress={() => router.push({ pathname: "/reels", params: { city: city?.slug, start: String(index) } })} />
              </Appear>
            )}
          />
        ) : (
          <View style={[styles.softNote, { marginHorizontal: space.lg }]}>
            <Ionicons name="film-outline" size={18} color={palette.muted} />
            <T variant="caption" style={{ flex: 1 }}>No reels in {city?.name} yet. Captains post here as they join.</T>
          </View>
        )}

        {/* ---------- categories ---------- */}
        <Section title="What are you into?" style={{ paddingHorizontal: space.lg, marginTop: space.xxl }}>
          <View style={styles.categories}>
            {CATEGORIES.map((c, i) => (
              <Appear key={c} i={i}>
                <CategoryTile value={c} onPress={() => router.push({ pathname: "/explore", params: { category: c } })} />
              </Appear>
            ))}
          </View>
        </Section>

        {/* ---------- captains ---------- */}
        <Section title={`Top Captains in ${city?.name ?? "your city"}`} action="See all" onAction={() => router.push("/explore")} style={{ paddingHorizontal: space.lg, marginTop: space.xxl }}>
          {top.isLoading ? (
            <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={104} r={24} />)}</View>
          ) : (top.data?.results ?? []).length ? (
            <View style={{ gap: 12 }}>{top.data!.results.map((c, i) => <Appear key={c.id} i={i}><CaptainRow c={c} /></Appear>)}</View>
          ) : (
            <Empty icon="people-outline" title="No Captains live here yet" body="Try another city. We're onboarding locals every week." action="Change city" onAction={() => setCityOpen(true)} />
          )}
        </Section>

        {/* ---------- trust ---------- */}
        <Appear style={{ marginHorizontal: space.lg, marginTop: space.xxl }}>
          <LinearGradient colors={gradients.night as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.trust}>
            <T variant="label" color={palette.marigold}>Travel with peace of mind</T>
            <T variant="title" color={palette.white} style={{ marginTop: 6, marginBottom: space.md }}>Every trip, protected.</T>
            {[
              ["shield-checkmark", "Verified Captains", "ID, licence and background checked"],
              ["card", "Secure payments", "Pay in the app. Refunds by policy, automatically."],
              ["warning", "SOS on every trip", "Safety team plus nearby police and hospitals"],
            ].map(([i, t, b]) => (
              <Row key={t} gap={12} style={styles.trustRow}>
                <View style={styles.trustIcon}><Ionicons name={i as any} size={18} color={palette.marigold} /></View>
                <View style={{ flex: 1 }}>
                  <T variant="bodyBold" color={palette.white}>{t}</T>
                  <T variant="caption" color="rgba(255,255,255,0.65)">{b}</T>
                </View>
              </Row>
            ))}
          </LinearGradient>
        </Appear>
      </ScrollView>

      <Sheet visible={cityOpen} onClose={() => setCityOpen(false)} title="Choose a city">
        <ScrollView style={{ maxHeight: 420 }}>
          {(cities.data ?? []).map((c) => {
            const on = c.id === city?.id;
            return (
              <Pressable
                key={c.id}
                onPress={async () => {
                  setCityOpen(false);
                  try {
                    await changeCity(c.id);
                  } catch (e) {
                    toastError(e);
                  }
                }}
                style={[styles.cityRow, on && { backgroundColor: palette.rickshawSoft }]}
              >
                <View style={[styles.cityInitial, on && { backgroundColor: palette.rickshaw }]}>
                  <T variant="bodyBold" color={on ? palette.white : palette.ink2}>{c.name.slice(0, 1)}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="bodyBold">{c.name}</T>
                  <T variant="caption">{c.state}</T>
                </View>
                {on ? <Ionicons name="checkmark-circle" size={22} color={palette.rickshaw} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
        <Button title="Close" kind="ghost" onPress={() => setCityOpen(false)} />
      </Sheet>
    </View>
  );
}

function GlassButton({ icon, label, badge, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; badge?: number; onPress: () => void }) {
  return (
    <Pressy onPress={onPress} scaleTo={0.88} accessibilityLabel={label} style={styles.glass}>
      <Ionicons name={icon} size={20} color={palette.white} />
      {badge ? <View style={styles.glassBadge}><T style={styles.glassBadgeText}>{badge > 9 ? "9+" : badge}</T></View> : null}
    </Pressy>
  );
}

const styles = StyleSheet.create({
  heroWrap: { marginBottom: 34 },
  hero: { paddingHorizontal: space.lg, paddingBottom: 58, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cityBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", paddingLeft: 5, paddingRight: 12, paddingVertical: 5, borderRadius: radius.pill },
  cityDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.marigold, alignItems: "center", justifyContent: "center" },
  glass: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  glassBadge: { position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: palette.coral, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: palette.night },
  glassBadgeText: { color: palette.white, fontSize: 9.5, fontFamily: fonts.bold },
  heroBadge: { position: "absolute", right: space.lg, bottom: 70 },
  heroBadgeInner: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  searchWrap: { position: "absolute", left: space.lg, right: space.lg, bottom: -30 },
  search: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: palette.white, borderRadius: 22, padding: 10, paddingRight: 10,
    shadowColor: palette.ink, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10,
  },
  searchIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: palette.rickshaw, alignItems: "center", justifyContent: "center" },
  filterIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.sand, alignItems: "center", justifyContent: "center" },
  quick: { paddingHorizontal: space.lg, gap: 12, paddingTop: space.sm, paddingBottom: 4 },
  quickTile: { width: 138, backgroundColor: palette.paper, borderRadius: 22, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, shadowColor: palette.ink, shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  quickIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  buildCard: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: 28, padding: space.xl, overflow: "hidden" },
  buildRing: { position: "absolute", right: 40, top: -50, width: 150, height: 150, borderRadius: 75, borderWidth: 18, borderColor: "rgba(255,255,255,0.12)" },
  buildPill: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 },
  buildArrow: { width: 50, height: 50, borderRadius: 25, backgroundColor: palette.white, alignItems: "center", justifyContent: "center" },
  softNote: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.paper, borderRadius: 18, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  categories: { flexDirection: "row", flexWrap: "wrap", rowGap: 16, justifyContent: "space-between" },
  trust: { padding: space.xl, borderRadius: 28 },
  trustRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.1)" },
  trustIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(242,169,59,0.14)", alignItems: "center", justifyContent: "center" },
  cityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 16, marginBottom: 4 },
  cityInitial: { width: 40, height: 40, borderRadius: 14, backgroundColor: palette.sand2, alignItems: "center", justifyContent: "center" },
});
