import { Ionicons } from "@expo/vector-icons";
import {
  api, Avatar, Banner, Booking, Button, Card, dateRange, Empty, ErrorView, IconButton, Loading, money, palette, radius, Rating, Row, Section,
  space, Stat, StatusBadge, T, time12, timeLeft, toast, toastError, useUnreadCount,
} from "@goloc/core";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useDashboard, useProfile, useRefreshBusiness } from "../../../lib/data";

function TripCard({ b, highlight }: { b: Booking; highlight?: boolean }) {
  return (
    <Pressable onPress={() => router.push(`/booking/${b.id}`)} style={[styles.trip, highlight && { backgroundColor: palette.night }]}>
      <Row style={{ justifyContent: "space-between" }}>
        <T variant="label" color={highlight ? palette.marigold : undefined}>{b.code}</T>
        <StatusBadge status={b.status} />
      </Row>
      <T variant="h2" color={highlight ? palette.white : undefined} style={{ marginTop: 6 }} numberOfLines={1}>{b.title}</T>
      <T variant="caption" color={highlight ? "#D6E6E1" : undefined}>
        {dateRange(b.start_date, b.end_date)} · {time12(b.start_time)} · {b.traveler.name} · {b.guests} guest{b.guests > 1 ? "s" : ""}
      </T>
      <Row style={{ justifyContent: "space-between", marginTop: space.sm }}>
        <T variant="small" color={highlight ? "#D6E6E1" : undefined}>You earn</T>
        <T variant="bodyBold" color={highlight ? palette.white : undefined}>{money(b.captain_net)}</T>
      </Row>
    </Pressable>
  );
}

export default function Business() {
  const profile = useProfile();
  const dash = useDashboard();
  const unread = useUnreadCount();
  const refresh = useRefreshBusiness();
  const goLive = useMutation({
    mutationFn: (is_live: boolean) => api.post<{ is_live: boolean }>("/captain/go-live/", { is_live }),
    onSuccess: (r) => {
      toast(r.is_live ? "You're live — travelers can book you" : "You're offline", r.is_live ? "success" : "info");
      refresh();
    },
    onError: toastError,
  });

  if (profile.isLoading) return <Loading />;
  if (profile.error) return <ErrorView error={profile.error} onRetry={profile.refetch} />;

  if (!profile.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xxl }}>
          <T variant="label" color={palette.ember}>Welcome, Captain</T>
          <T variant="display" style={{ marginTop: 6 }}>Let's set up your local travel business</T>
          <T style={{ marginTop: space.md }}>Takes about 10 minutes. You'll need a government ID and, if you drive, your licence and vehicle RC.</T>
          <View style={{ marginTop: space.xl, gap: space.md }}>
            {[
              ["person", "Business profile", "Your story, languages and specialties"],
              ["pricetags", "Services & pricing", "Day experiences, guide days, and packages if you do everything"],
              ["shield-checkmark", "Verification", "ID and vehicle documents — reviewed in 24–48h"],
              ["wallet", "Payouts", "UPI or bank — paid after each completed trip"],
            ].map(([i, t, b]) => (
              <Row key={t} gap={14}>
                <View style={styles.stepIcon}><Ionicons name={i as any} size={20} color={palette.ember} /></View>
                <View style={{ flex: 1 }}>
                  <T variant="bodyBold">{t}</T>
                  <T variant="caption">{b}</T>
                </View>
              </Row>
            ))}
          </View>
          <Button title="Start setup" icon="arrow-forward" onPress={() => router.push("/setup/profile")} style={{ marginTop: space.xxl }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const p = profile.data;
  const d = dash.data;
  const approved = p.review_status === "approved";
  const next = d?.upcoming[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={dash.isRefetching} onRefresh={() => { refresh(); unread.refetch(); }} tintColor={palette.ember} />}
      >
        <Row style={{ justifyContent: "space-between" }}>
          <Row gap={12} style={{ flex: 1 }}>
            <Avatar uri={p.avatar} name={p.full_name} size={48} verified={approved} />
            <View style={{ flex: 1 }}>
              <T variant="h2" numberOfLines={1}>{p.full_name}</T>
              <T variant="caption">{p.code} · {p.city_name}</T>
            </View>
          </Row>
          <IconButton name="notifications-outline" badge={unread.data} onPress={() => router.push("/notifications")} />
        </Row>

        <Card style={[styles.live, p.is_live && { backgroundColor: palette.night }]}>
          <View style={{ flex: 1 }}>
            <T variant="h2" color={p.is_live ? palette.white : undefined}>{p.is_live ? "You're live" : "You're offline"}</T>
            <T variant="caption" color={p.is_live ? "#D6E6E1" : undefined}>
              {p.is_live ? "Travelers in your city can find and book you." : approved ? "Go live to start receiving requests." : "You can go live once GoLoc approves you."}
            </T>
          </View>
          <Switch
            value={p.is_live}
            disabled={goLive.isPending || (!p.is_live && !d?.checklist.can_go_live)}
            onValueChange={(v) => goLive.mutate(v)}
            trackColor={{ true: palette.marigold, false: palette.lineStrong }}
            thumbColor={palette.white}
          />
        </Card>

        <View style={{ gap: space.md, marginTop: space.md }}>
          {p.is_on_hold ? <Banner tone="danger" title="Your account is on hold" body={`${p.hold_reason}. Contact support to reactivate.`} /> : null}
          {p.review_status === "pending" ? <Banner tone="info" icon="time" title="Verification in progress" body="We're reviewing your profile and documents — usually within 24–48 hours." /> : null}
          {p.review_status === "rejected" ? (
            <Banner tone="warning" title="A few changes needed" body={p.review_note}>
              <Button title="Fix & resubmit" small kind="secondary" onPress={() => router.push("/checklist")} style={{ marginTop: space.sm, alignSelf: "flex-start" }} />
            </Banner>
          ) : null}
          {d && !approved ? (
            <Card onPress={() => router.push("/checklist")}>
              <Row style={{ justifyContent: "space-between" }}>
                <T variant="h2">Go-live checklist</T>
                <T variant="h2" color={palette.ember}>{d.checklist.percent}%</T>
              </Row>
              <View style={styles.progress}><View style={[styles.progressFill, { width: `${d.checklist.percent}%` }]} /></View>
              <T variant="caption">
                {d.checklist.items.filter((i) => !i.done).length} step{d.checklist.items.filter((i) => !i.done).length === 1 ? "" : "s"} left · tap to continue
              </T>
            </Card>
          ) : null}
        </View>

        {d ? (
          <>
            <Row style={{ flexWrap: "wrap", marginTop: space.lg }} gap={10}>
              <Stat label="This month" value={money(d.wallet.this_month)} hint={`${money(d.wallet.pending_trips)} on upcoming trips`} />
              <Stat label="Wallet" value={money(d.wallet.available)} hint="Ready to withdraw" tone="good" />
            </Row>
            <Row style={{ flexWrap: "wrap", marginTop: 10 }} gap={10}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push("/reviews")}>
                <View style={styles.statLike}>
                  <T variant="caption">Rating</T>
                  <View style={{ marginTop: 6 }}><Rating value={p.rating_avg} count={p.rating_count} /></View>
                  <T variant="small" style={{ marginTop: 4 }}>{p.trips_completed} trips done</T>
                </View>
              </Pressable>
              <Stat label="Profile views" value={String(p.profile_views)} hint={`${d.reel_views} reel views`} />
            </Row>

            <Section title={next ? "Next trip" : "Upcoming"} action={d.upcoming_count > 1 ? `All ${d.upcoming_count}` : undefined} onAction={() => router.push("/bookings")}>
              {next ? (
                <View style={{ gap: 10 }}>
                  <TripCard b={next} highlight />
                  {next.start_date <= new Date().toISOString().slice(0, 10) ? (
                    <Button title={next.status === "in_progress" ? "Open trip console" : "Start trip"} icon="navigate" onPress={() => router.push(`/booking/${next.id}`)} />
                  ) : null}
                </View>
              ) : (
                <Empty icon="calendar-outline" title="No confirmed trips yet" body={p.is_live ? "New requests show up here and on your phone." : "Go live to start getting requests."} />
              )}
            </Section>

            {d.pending_count ? (
              <Section title={`New requests · ${d.pending_count}`} action="Review" onAction={() => router.push("/bookings")}>
                <View style={{ gap: 10 }}>
                  {d.pending_requests.map((b) => (
                    <Card key={b.id} onPress={() => router.push(`/booking/${b.id}`)}>
                      <Row style={{ justifyContent: "space-between" }}>
                        <T variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>{b.title}</T>
                        <T variant="bodyBold" color={palette.ember}>{money(b.captain_net)}</T>
                      </Row>
                      <T variant="caption">{b.code} · {dateRange(b.start_date, b.end_date)} · {b.traveler.name} · {b.guests} guests</T>
                      <T variant="small" color={palette.warning} style={{ marginTop: 4 }}>Respond within {timeLeft(b.request_expires_at)}</T>
                    </Card>
                  ))}
                </View>
              </Section>
            ) : null}
          </>
        ) : dash.isLoading ? null : dash.error ? <ErrorView error={dash.error} onRetry={dash.refetch} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  stepIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: palette.emberSoft, alignItems: "center", justifyContent: "center" },
  live: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg },
  progress: { height: 8, borderRadius: 4, backgroundColor: palette.sand2, marginVertical: space.sm, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: palette.ember },
  trip: { backgroundColor: palette.paper, borderRadius: radius.lg, padding: space.lg },
  statLike: { flex: 1, minWidth: 140, backgroundColor: palette.paper, borderRadius: radius.md, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
});
