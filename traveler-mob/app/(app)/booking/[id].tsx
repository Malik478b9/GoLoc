import { Ionicons } from "@expo/vector-icons";
import {
  api, Avatar, Banner, BookingDetail, Button, Card, ConfirmSheet, dateRange, Divider, ErrorView, Field, Loading, money, openChat,
  palette, Rating, Row, Screen, SOSButton, space, StatusBadge, T, time12, timeAgo, timeLeft, TIER_LABEL, toast, toastError, useCheckout,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";

type Preview = { refund_percent: number; refund_amount: number };

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["booking", id],
    queryFn: () => api.get<BookingDetail>(`/bookings/${id}/`),
    refetchInterval: (query) => (["requested", "accepted", "in_progress"].includes(query.state.data?.status ?? "") ? 15000 : false),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["booking", id] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
  };
  const checkout = useCheckout((r) => {
    refresh();
    if (r === "success") toast("Payment received — you're booked!", "success");
    else if (r === "failed") toast("Payment failed. No money was taken.", "error");
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const preview = useQuery({ queryKey: ["cancel-preview", id], queryFn: () => api.get<Preview>(`/bookings/${id}/cancel-preview/`), enabled: cancelOpen });
  const cancel = useMutation({
    mutationFn: () => api.post<BookingDetail>(`/bookings/${id}/cancel/`, { reason }),
    onSuccess: (b) => {
      setCancelOpen(false);
      qc.setQueryData(["booking", id], b);
      refresh();
      toast(b.refund_percent != null ? `Cancelled. ${money(preview.data?.refund_amount ?? 0)} will be refunded.` : "Request cancelled.", "success");
    },
    onError: toastError,
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Screen title="Booking"><ErrorView error={q.error} onRetry={q.refetch} /></Screen>;
  const b = q.data;
  const a = b.actions;
  const tripDay = b.start_date <= new Date().toISOString().slice(0, 10);

  return (
    <Screen title={b.code} subtitle={b.title} onRefresh={q.refetch}>
      <Row style={{ justifyContent: "space-between" }}>
        <StatusBadge status={b.status} />
        <T variant="caption">Booked {timeAgo(b.created_at)}</T>
      </Row>
      <T variant="title" style={{ marginTop: space.sm }}>{b.title}</T>
      <T variant="caption">
        {dateRange(b.start_date, b.end_date)} · {time12(b.start_time)} · {b.guests} guest{b.guests > 1 ? "s" : ""}
        {b.tier !== "standard" ? ` · ${TIER_LABEL[b.tier]}` : ""}
      </T>

      {/* ----- what happens next ----- */}
      <View style={{ marginTop: space.lg, gap: space.md }}>
        {b.status === "requested" && (
          <Banner tone="info" icon="hourglass" title={`Waiting for ${b.captain.name} to accept`} body={`They have ${timeLeft(b.request_expires_at)} to respond. You'll pay only after they accept.`} />
        )}
        {b.status === "accepted" && (
          <Card style={{ borderColor: palette.warning, borderWidth: 1.5 }}>
            <T variant="h2">{b.captain.name} accepted 🎉</T>
            <T variant="caption">Pay {money(b.total)} within {timeLeft(b.payment_due_at)} to confirm. Paying unlocks trip insurance, live tracking and SOS.</T>
            <Button title={`Pay ${money(b.total)}`} icon="lock-closed" loading={checkout.starting} onPress={() => checkout.start(b.id)} style={{ marginTop: space.md }} />
          </Card>
        )}
        {b.status === "confirmed" && (
          <Card style={{ backgroundColor: palette.night }}>
            <T variant="label" color={palette.marigold}>Your trip PIN</T>
            <T style={styles.pin}>{b.start_pin}</T>
            <T variant="small" color="#D6E6E1">Share this with your Captain when you meet — it starts the trip. Never share it before you meet.</T>
            <Divider style={{ backgroundColor: "#ffffff22", marginVertical: space.md }} />
            <Row gap={8}><Ionicons name="shield-checkmark" size={16} color={palette.marigold} /><T variant="small" color={palette.white}>Insured · {b.insurance_policy_no}</T></Row>
          </Card>
        )}
        {(b.status === "in_progress" || (b.status === "confirmed" && tripDay)) && (
          <Button title={b.status === "in_progress" ? "Open live trip" : "Track your Captain"} icon="navigate" onPress={() => router.push(`/trip/${b.id}`)} />
        )}
        {a.sos ? <SOSButton bookingRef={b.id} /> : null}
        {b.share_url ? (
          <Button title="Share trip with family" icon="share-social" kind="secondary" onPress={() => Share.share({ message: `I'm on a GoLoc trip (${b.code}) with ${b.captain.name}. Follow live: ${b.share_url}` })} />
        ) : null}
        {a.review ? <Button title="Rate your trip" icon="star" onPress={() => router.push(`/review/${b.id}`)} /> : null}
        {b.review ? (
          <Card>
            <Row style={{ justifyContent: "space-between" }}><T variant="h2">Your review</T><Rating value={b.review.rating} /></Row>
            {b.review.comment ? <T style={{ marginTop: 4 }}>{b.review.comment}</T> : null}
            {b.review.captain_reply ? <T variant="caption" style={{ marginTop: 6 }}>Reply: {b.review.captain_reply}</T> : null}
          </Card>
        ) : null}
        {["cancelled", "declined", "expired"].includes(b.status) && (
          <Card>
            <T variant="h2">{b.status === "declined" ? "The Captain couldn't take this trip" : b.status === "expired" ? "This booking expired" : `Cancelled by ${b.cancelled_by || "you"}`}</T>
            {b.cancel_reason ? <T variant="caption" style={{ marginTop: 2 }}>{b.cancel_reason}</T> : null}
            {b.refund_percent != null ? (
              <T variant="bodyBold" color={palette.success} style={{ marginTop: space.sm }}>
                Refund: {money(b.refunded)} ({b.refund_percent}% of fare + insurance) — 5–7 working days
              </T>
            ) : null}
            <Button title="Book again" kind="secondary" small onPress={() => router.push(`/book/${b.service_id}`)} style={{ marginTop: space.md, alignSelf: "flex-start" }} />
          </Card>
        )}
      </View>

      {/* ----- captain ----- */}
      <Card style={{ marginTop: space.lg }}>
        <Row gap={space.md}>
          <Avatar uri={b.captain.avatar} name={b.captain.name} size={48} verified />
          <View style={{ flex: 1 }}>
            <T variant="bodyBold">{b.captain.name}</T>
            <T variant="caption">{b.captain.code} · {b.city_name}</T>
          </View>
          {b.captain.phone ? <Button title="Call" icon="call" small kind="secondary" onPress={() => Linking.openURL(`tel:${b.captain.phone}`)} /> : null}
        </Row>
        <Row gap={10} style={{ marginTop: space.md }}>
          <Button title="Message" icon="chatbubble-ellipses" small kind="secondary" style={{ flex: 1 }} onPress={() => openChat({ booking_id: b.id })} />
          <Button title="Profile" icon="person" small kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/captain/${b.captain.id}`)} />
        </Row>
      </Card>

      {/* ----- details ----- */}
      <Card style={{ marginTop: space.md }}>
        {b.meeting_point ? <Detail label="Meeting point" value={b.meeting_point} /> : null}
        {b.note ? <Detail label="Your note" value={b.note} /> : null}
        {(b.service_snapshot.stops?.length || b.service_snapshot.itinerary?.length) ? (
          <View style={{ marginBottom: space.md }}>
            <T variant="label" style={{ marginBottom: 4 }}>{b.service_snapshot.stops?.length ? "Stops" : "Itinerary"}</T>
            {(b.service_snapshot.stops?.length ? b.service_snapshot.stops : b.service_snapshot.itinerary).map((s, i) => (
              <T key={i} variant="small" style={{ paddingVertical: 2 }}>{i + 1}. {s}</T>
            ))}
          </View>
        ) : null}
        {b.tier !== "standard" && b.service_snapshot.tier_inclusions?.[b.tier]?.length ? (
          <View style={{ marginBottom: space.md }}>
            <T variant="label" style={{ marginBottom: 4 }}>Included ({TIER_LABEL[b.tier]})</T>
            {b.service_snapshot.tier_inclusions[b.tier].map((i) => <T key={i} variant="small">✓ {i}</T>)}
          </View>
        ) : null}
        <T variant="label" style={{ marginBottom: 4 }}>Payment</T>
        <Row style={styles.line}><T variant="small">Trip fare</T><T variant="small">{money(b.fare)}</T></Row>
        <Row style={styles.line}><T variant="small">Trip insurance</T><T variant="small">{money(b.insurance_fee)}</T></Row>
        <Row style={styles.line}><T variant="bodyBold">Total</T><T variant="bodyBold">{money(b.total)}</T></Row>
      </Card>

      {/* ----- timeline ----- */}
      <Card style={{ marginTop: space.md }}>
        <T variant="label" style={{ marginBottom: space.sm }}>Timeline</T>
        {b.events.map((e, i) => (
          <Row key={i} gap={10} style={{ alignItems: "flex-start", paddingVertical: 5 }}>
            <View style={[styles.dot, { backgroundColor: e.kind === "sos" ? palette.coral : palette.rickshaw }]} />
            <View style={{ flex: 1 }}>
              <T variant="small">{e.message}</T>
              <T variant="caption" style={{ fontSize: 11 }}>{timeAgo(e.created_at)}</T>
            </View>
          </Row>
        ))}
      </Card>

      <View style={{ marginTop: space.lg, gap: space.sm }}>
        {a.cancel ? <Button title={b.status === "requested" ? "Withdraw request" : "Cancel booking"} kind="ghost" onPress={() => setCancelOpen(true)} /> : null}
        <Button title="Get help with this booking" kind="ghost" icon="help-buoy" onPress={() => router.push("/support")} />
      </View>

      <ConfirmSheet
        visible={cancelOpen}
        title={b.status === "requested" ? "Withdraw this request?" : "Cancel this booking?"}
        body={
          b.status === "confirmed"
            ? preview.data
              ? `You'll get ${money(preview.data.refund_amount)} back (${preview.data.refund_percent}% of the fare + insurance).`
              : "Checking your refund…"
            : "Nothing has been charged yet."
        }
        confirm={b.status === "requested" ? "Withdraw" : "Cancel booking"}
        danger
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        onClose={() => setCancelOpen(false)}
      >
        <Field placeholder="Reason (optional)" value={reason} onChangeText={setReason} maxLength={300} />
      </ConfirmSheet>
      {checkout.element}
    </Screen>
  );
}

const Detail = ({ label, value }: { label: string; value: string }) => (
  <View style={{ marginBottom: space.md }}>
    <T variant="label">{label}</T>
    <T style={{ marginTop: 2 }}>{value}</T>
  </View>
);

const styles = StyleSheet.create({
  pin: { fontSize: 44, letterSpacing: 12, color: palette.white, fontWeight: "800", marginVertical: space.sm },
  line: { justifyContent: "space-between", paddingVertical: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
