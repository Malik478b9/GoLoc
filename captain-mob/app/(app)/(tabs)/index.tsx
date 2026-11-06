import { Ionicons } from "@expo/vector-icons";
import {
  api, Appear, Avatar, Banner, Booking, Button, Card, dateRange, Empty, ErrorView, Float, fonts, gradients, LinearGradient, Loading, money, motion,
  palette, Pressy, Pulse, radius, Rating, Row, Section, shadow, space, StatusBadge, T, time12, timeLeft, toast, toastError, useUnreadCount,
} from "@goloc/core";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAgency, useDashboard, useProfile, useRefreshBusiness } from "../../../lib/data";

function TripCard({ b }: { b: Booking }) {
  return (
    <Pressy onPress={() => router.push(`/booking/${b.id}`)} scaleTo={0.98}>
      <LinearGradient colors={gradients.night as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.trip}>
        <View style={styles.tripGlow} />
        <Row style={{ justifyContent: "space-between" }}>
          <T variant="label" color={palette.marigold}>{b.code}</T>
          <StatusBadge status={b.status} />
        </Row>
        <T variant="title" color={palette.white} style={{ marginTop: 8 }} numberOfLines={2}>{b.title}</T>
        <View style={{ gap: 6, marginTop: space.md }}>
          {([
            ["calendar", `${dateRange(b.start_date, b.end_date)} · ${time12(b.start_time)}`],
            ["person", `${b.traveler.name} · ${b.guests} guest${b.guests > 1 ? "s" : ""}`],
          ] as const).map(([icon, text]) => (
            <Row key={icon} gap={8}>
              <Ionicons name={icon} size={14} color="rgba(255,255,255,0.6)" />
              <T variant="small" color="rgba(255,255,255,0.85)">{text}</T>
            </Row>
          ))}
        </View>
        <View style={styles.tripFoot}>
          <T variant="small" color="rgba(255,255,255,0.65)">You earn</T>
          <T variant="title" color={palette.white} style={{ fontSize: 22 }}>{money(b.captain_net)}</T>
        </View>
      </LinearGradient>
    </Pressy>
  );
}

/** Big live/offline switch: the knob springs across and the track lights up. */
function LiveToggle({ live, disabled, busy, onChange }: { live: boolean; disabled: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  const p = useSharedValue(live ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(live ? 1 : 0, motion.spring);
  }, [live, p]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], ["rgba(255,255,255,0.14)", palette.mint]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * 30 }] }));
  return (
    <Pressy disabled={disabled || busy} haptic scaleTo={0.92} onPress={() => onChange(!live)} accessibilityRole="switch" accessibilityState={{ checked: live, disabled }}
      style={{ opacity: disabled ? 0.5 : 1 }}>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]}>
          <Ionicons name={live ? "flash" : "moon"} size={14} color={live ? palette.success : palette.muted} />
        </Animated.View>
      </Animated.View>
    </Pressy>
  );
}

export default function Business() {
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const dash = useDashboard();
  const membership = useAgency();
  const invite = membership.data?.invites[0];
  const unread = useUnreadCount();
  const refresh = useRefreshBusiness();
  const goLive = useMutation({
    mutationFn: (is_live: boolean) => api.post<{ is_live: boolean }>("/captain/go-live/", { is_live }),
    onSuccess: (r) => {
      toast(r.is_live ? "You're live. Travelers can book you" : "You're offline", r.is_live ? "success" : "info");
      refresh();
    },
    onError: toastError,
  });

  if (profile.isLoading) return <Loading />;
  if (profile.error) return <ErrorView error={profile.error} onRetry={profile.refetch} />;

  if (!profile.data) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.night }}>
        <LinearGradient colors={gradients.night as any} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xxl }}>
            <Appear>
              <Float distance={4}>
                <LinearGradient colors={gradients.captain as any} style={styles.welcomeIcon}><Ionicons name="compass" size={30} color={palette.white} /></LinearGradient>
              </Float>
            </Appear>
            <Appear i={1}><T variant="label" color={palette.marigold} style={{ marginTop: space.xl }}>Welcome, Captain</T></Appear>
            <Appear i={2}><T variant="hero" color={palette.white} style={{ marginTop: 6 }}>Let's set up your local travel business</T></Appear>
            <Appear i={3}><T color="rgba(255,255,255,0.75)" style={{ marginTop: space.md }}>Takes about 10 minutes. Keep your government ID handy and, if you drive, your licence and vehicle RC.</T></Appear>
            <View style={{ marginTop: space.xl, gap: 10 }}>
              {[
                ["person", "Business profile", "Your story, languages and specialties"],
                ["pricetags", "Services & pricing", "Day experiences, guide days, and packages"],
                ["shield-checkmark", "Verification", "ID and vehicle documents, reviewed in 24–48h"],
                ["wallet", "Payouts", "UPI or bank, paid after each completed trip"],
              ].map(([i, t, b], n) => (
                <Appear key={t} i={4 + n}>
                  <Row gap={14} style={styles.step}>
                    <View style={styles.stepNum}><T variant="bodyBold" color={palette.night}>{n + 1}</T></View>
                    <View style={{ flex: 1 }}>
                      <T variant="bodyBold" color={palette.white}>{t}</T>
                      <T variant="caption" color="rgba(255,255,255,0.6)">{b}</T>
                    </View>
                    <Ionicons name={i as any} size={20} color={palette.marigold} />
                  </Row>
                </Appear>
              ))}
            </View>
            <Appear i={9}><Button title="Start setup" icon="arrow-forward" onPress={() => router.push("/setup/profile")} style={{ marginTop: space.xxl }} /></Appear>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  const p = profile.data;
  const d = dash.data;
  const approved = p.review_status === "approved";
  const next = d?.upcoming[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <View style={{ flex: 1, backgroundColor: palette.sand }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={dash.isRefetching} onRefresh={() => { refresh(); unread.refetch(); }} tintColor={palette.white} progressViewOffset={insets.top} />}
      >
        {/* ---------- hero ---------- */}
        <LinearGradient colors={gradients.night as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + space.sm }]}>
          <Row style={{ justifyContent: "space-between" }}>
            <Row gap={12} style={{ flex: 1 }}>
              <Avatar uri={p.avatar} name={p.full_name} size={50} verified={approved} ring />
              <View style={{ flex: 1 }}>
                <T variant="caption" color="rgba(255,255,255,0.6)">{greet}</T>
                <T variant="h2" color={palette.white} numberOfLines={1}>{p.full_name}</T>
              </View>
            </Row>
            <Pressy onPress={() => router.push("/notifications")} scaleTo={0.88} accessibilityLabel="Notifications" style={styles.glass}>
              <Ionicons name="notifications-outline" size={20} color={palette.white} />
              {unread.data ? <View style={styles.glassBadge}><T style={styles.glassBadgeText}>{unread.data > 9 ? "9+" : unread.data}</T></View> : null}
            </Pressy>
          </Row>

          <Appear i={1}>
            <T variant="label" color={palette.marigold} style={{ marginTop: space.xl }}>Earned this month</T>
            <T style={styles.bigMoney}>{d ? money(d.wallet.this_month) : "—"}</T>
            {d ? <T variant="small" color="rgba(255,255,255,0.7)">{money(d.wallet.pending_trips)} more on upcoming trips</T> : null}
          </Appear>

          <Appear i={2} style={[styles.liveCard, p.is_live && styles.liveCardOn]}>
            <View style={{ flex: 1 }}>
              <Row gap={8}>
                {p.is_live ? <Pulse style={styles.liveDot} min={0.3} /> : <View style={[styles.liveDot, { backgroundColor: "rgba(255,255,255,0.35)" }]} />}
                <T variant="bodyBold" color={palette.white}>{p.is_live ? "You're live" : "You're offline"}</T>
              </Row>
              <T variant="caption" color="rgba(255,255,255,0.65)" style={{ marginTop: 2 }}>
                {p.is_live ? "Travelers in your city can find and book you." : approved ? "Go live to start receiving requests." : "You can go live once GoLoc approves you."}
              </T>
            </View>
            <LiveToggle live={p.is_live} busy={goLive.isPending} disabled={!p.is_live && !d?.checklist.can_go_live} onChange={(v) => goLive.mutate(v)} />
          </Appear>
        </LinearGradient>

        <View style={{ paddingHorizontal: space.lg }}>
          {/* ---------- stats ---------- */}
          {d ? (
            <View style={styles.statsGrid}>
              {([
                ["wallet", "Wallet", money(d.wallet.available), "Ready to withdraw", gradients.traveler, () => router.push("/earnings")],
                ["star", "Rating", Number(p.rating_avg) > 0 ? Number(p.rating_avg).toFixed(1) : "New", `${p.trips_completed} trips done`, gradients.sunset, () => router.push("/reviews")],
                ["eye", "Profile views", String(p.profile_views), `${d.reel_views} reel views`, ["#0B63E0", "#0047B6"] as const, () => router.push("/content")],
                ["calendar", "Upcoming", String(d.upcoming_count), d.pending_count ? `${d.pending_count} waiting for you` : "All caught up", gradients.captain, () => router.push("/bookings")],
              ] as const).map(([icon, label, value, hint, colors, go], i) => (
                <Appear key={label} i={3 + i} style={styles.statCell}>
                  <Pressy onPress={go} scaleTo={0.96} style={styles.statTile}>
                    <LinearGradient colors={colors as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statIcon}>
                      <Ionicons name={icon} size={17} color={palette.white} />
                    </LinearGradient>
                    <T variant="caption" style={{ marginTop: 10 }}>{label}</T>
                    <T variant="title" style={{ fontSize: 22, lineHeight: 27 }}>{value}</T>
                    <T variant="small" color={palette.muted} numberOfLines={1}>{hint}</T>
                  </Pressy>
                </Appear>
              ))}
            </View>
          ) : null}

          <View style={{ gap: space.md, marginTop: space.lg }}>
            {invite && !p.agency ? (
              <Banner tone="info" icon="business" title={`${invite.agency.name} invited you`} body="Join their team: they set your trips and prices, give you a car and pay you directly.">
                <Button title="View invite" small kind="secondary" onPress={() => router.push("/agency")} style={{ marginTop: space.sm, alignSelf: "flex-start" }} />
              </Banner>
            ) : null}
            {p.is_on_hold ? <Banner tone="danger" title="Your account is on hold" body={`${p.hold_reason}. Contact support to reactivate.`} /> : null}
            {p.review_status === "pending" ? <Banner tone="info" icon="time" title="Verification in progress" body="We're reviewing your profile and documents, usually within 24–48 hours." /> : null}
            {p.review_status === "rejected" ? (
              <Banner tone="warning" title="A few changes needed" body={p.review_note}>
                <Button title="Fix & resubmit" small kind="secondary" onPress={() => router.push("/checklist")} style={{ marginTop: space.sm, alignSelf: "flex-start" }} />
              </Banner>
            ) : null}
            {d && !approved ? (
              <Card onPress={() => router.push("/checklist")}>
                <Row style={{ justifyContent: "space-between" }}>
                  <T variant="h2">Go-live checklist</T>
                  <T variant="title" color={palette.ember} style={{ fontSize: 22 }}>{d.checklist.percent}%</T>
                </Row>
                <View style={styles.progress}>
                  <LinearGradient colors={gradients.captain as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${d.checklist.percent}%` }]} />
                </View>
                <T variant="caption">
                  {d.checklist.items.filter((i) => !i.done).length} step{d.checklist.items.filter((i) => !i.done).length === 1 ? "" : "s"} left · tap to continue
                </T>
              </Card>
            ) : null}
          </View>

          {d ? (
            <>
              {d.pending_count ? (
                <Section title={`New requests · ${d.pending_count}`} action="Review" onAction={() => router.push("/bookings")}>
                  <View style={{ gap: 12 }}>
                    {d.pending_requests.map((b, i) => (
                      <Appear key={b.id} i={i}>
                        <Pressy onPress={() => router.push(`/booking/${b.id}`)} scaleTo={0.98} style={styles.request}>
                          <View style={styles.requestStripe} />
                          <View style={{ flex: 1 }}>
                            <Row style={{ justifyContent: "space-between" }}>
                              <T variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>{b.title}</T>
                              <T variant="title" color={palette.ember} style={{ fontSize: 19 }}>{money(b.captain_net)}</T>
                            </Row>
                            <T variant="caption">{dateRange(b.start_date, b.end_date)} · {b.traveler.name} · {b.guests} guests</T>
                            <Row gap={6} style={styles.timer}>
                              <Pulse><Ionicons name="time" size={13} color={palette.warning} /></Pulse>
                              <T variant="small" color={palette.warning} style={{ fontFamily: fonts.bold }}>Respond within {timeLeft(b.request_expires_at)}</T>
                            </Row>
                          </View>
                        </Pressy>
                      </Appear>
                    ))}
                  </View>
                </Section>
              ) : null}

              <Section title={next ? "Next trip" : "Upcoming"} action={d.upcoming_count > 1 ? `All ${d.upcoming_count}` : undefined} onAction={() => router.push("/bookings")}>
                {next ? (
                  <View style={{ gap: 12 }}>
                    <Appear><TripCard b={next} /></Appear>
                    {next.start_date <= new Date().toISOString().slice(0, 10) ? (
                      <Button title={next.status === "in_progress" ? "Open trip console" : "Start trip"} icon="navigate" onPress={() => router.push(`/booking/${next.id}`)} />
                    ) : null}
                  </View>
                ) : (
                  <Empty icon="calendar-outline" title="No confirmed trips yet" body={p.is_live ? "New requests show up here and on your phone." : "Go live to start getting requests."} />
                )}
              </Section>

              <Pressy onPress={() => router.push("/reviews")} scaleTo={0.98} style={[styles.ratingCard, { marginTop: space.xl }]}>
                <View style={{ flex: 1 }}>
                  <T variant="label">Your reputation</T>
                  <View style={{ marginTop: 6 }}><Rating value={p.rating_avg} count={p.rating_count} /></View>
                </View>
                <T variant="small" color={palette.ember} style={{ fontFamily: fonts.bold }}>See reviews</T>
                <Ionicons name="chevron-forward" size={16} color={palette.ember} />
              </Pressy>
            </>
          ) : dash.isLoading ? null : dash.error ? <ErrorView error={dash.error} onRetry={dash.refetch} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space.lg, paddingBottom: space.xl, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden" },
  glass: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  glassBadge: { position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: palette.coral, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: palette.night },
  glassBadgeText: { color: palette.white, fontSize: 9.5, fontFamily: fonts.bold },
  bigMoney: { fontFamily: fonts.display, fontSize: 44, lineHeight: 52, letterSpacing: -1.2, color: palette.white, marginTop: 2 },
  liveCard: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg, padding: space.md, paddingLeft: space.lg, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  liveCardOn: { backgroundColor: "rgba(43,179,148,0.16)", borderColor: "rgba(43,179,148,0.4)" },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.mint },
  track: { width: 64, height: 34, borderRadius: 17, padding: 2, justifyContent: "center" },
  knob: { width: 30, height: 30, borderRadius: 15, backgroundColor: palette.white, alignItems: "center", justifyContent: "center", ...shadow, shadowOpacity: 0.2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, marginTop: space.lg },
  statCell: { width: "48.5%" },
  statTile: { backgroundColor: palette.paper, borderRadius: 22, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, ...shadow },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  progress: { height: 10, borderRadius: 5, backgroundColor: palette.sand2, marginVertical: space.sm, overflow: "hidden" },
  progressFill: { height: 10, borderRadius: 5 },
  trip: { borderRadius: 26, padding: space.xl, overflow: "hidden" },
  tripGlow: { position: "absolute", right: -50, top: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: palette.ember, opacity: 0.25 },
  tripFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.15)" },
  request: { flexDirection: "row", gap: space.md, backgroundColor: palette.paper, borderRadius: 22, padding: space.lg, paddingLeft: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, overflow: "hidden", ...shadow },
  requestStripe: { width: 4, borderRadius: 2, backgroundColor: palette.ember },
  timer: { marginTop: 8, alignSelf: "flex-start", backgroundColor: palette.warningSoft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  ratingCard: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.paper, borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  welcomeIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  step: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 18, padding: space.md },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.marigold, alignItems: "center", justifyContent: "center" },
});
