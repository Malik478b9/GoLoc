import { Ionicons } from "@expo/vector-icons";
import {
  api, Avatar, Banner, BookingDetail, Button, Card, ConfirmSheet, dateRange, Divider, ErrorView, Field, Loading, money, openChat,
  palette, Rating, Row, Screen, shareText, SOSButton, space, StatusBadge, T, time12, timeAgo, timeLeft, TIER_LABEL, toast, toastError, useCheckout,
  todayIST, PinCode,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

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

  const consent = useMutation({
    mutationFn: (share: boolean) => api.post<BookingDetail>(`/bookings/${id}/share-contact/`, { share }),
    onSuccess: (b) => {
      qc.setQueryData(["booking", id], b);
      toast(b.traveler_shares_contact ? "Your Captain can now see your number" : "Your number is hidden again", "success");
    },
    onError: toastError,
  });

  const [endOpen, setEndOpen] = useState(false);
  const endTrip = useMutation({
    mutationFn: () => api.post<BookingDetail>(`/bookings/${id}/complete/`),
    onSuccess: (b) => {
      setEndOpen(false);
      qc.setQueryData(["booking", id], b);
      refresh();
      toast("Trip ended. Hope you had a great time!", "success");
    },
    onError: toastError,
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Screen title="Booking"><ErrorView error={q.error} onRetry={q.refetch} /></Screen>;
  const b = q.data;
  const a = b.actions;
  const tripDay = b.start_date <= todayIST();

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

      {b.guest_details?.some((g) => g.name) ? (
        <Card style={{ marginTop: space.md }}>
          <T variant="label" style={{ marginBottom: space.sm }}>Travellers · {b.guest_details.length}</T>
          {b.guest_details.map((g, i) => (
            <Row key={i} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
              <T variant="bodyBold">{g.name || `Guest ${i + 1}`}{i === 0 ? " (you)" : ""}</T>
              {g.phone ? <T variant="caption">{g.phone}</T> : null}
            </Row>
          ))}
        </Card>
      ) : null}

      {/* ----- what happens next ----- */}
      <View style={{ marginTop: space.lg, gap: space.md }}>
        {b.status === "requested" && (
          <Banner tone="info" icon="hourglass" title={`Waiting for ${b.captain.name} to accept`} body={`They have ${timeLeft(b.request_expires_at)} to respond. You'll pay only after they accept.`} />
        )}
        {b.status === "accepted" && (
          <Card style={{ borderColor: palette.warning, borderWidth: 1.5 }}>
            <T variant="h2">{b.group ? `${b.guests} seat${b.guests > 1 ? "s" : ""} held for you` : `${b.captain.name} accepted 🎉`}</T>
            <T variant="caption">
              {b.group
                ? `Pay ${money(b.total)} within ${timeLeft(b.payment_due_at)} or the seats go back to others. Paying unlocks trip insurance, live tracking and SOS.`
                : `Pay ${money(b.total)} within ${timeLeft(b.payment_due_at)} to confirm. Paying unlocks trip insurance, live tracking and SOS.`}
            </T>
            <Button title={`Pay ${money(b.total)}`} icon="lock-closed" loading={checkout.starting} onPress={() => checkout.start(b.id)} style={{ marginTop: space.md }} />
          </Card>
        )}
        {b.status === "confirmed" && b.start_pin ? (
          <PinCard
            label="Your trip PIN"
            pin={b.start_pin}
            body="Tell this to your Captain when you meet. It starts your trip. Never share it before you meet."
            footer={<Row gap={8}><Ionicons name="shield-checkmark" size={16} color={palette.marigold} /><T variant="small" color={palette.onDark}>Insured · {b.insurance_policy_no}</T></Row>}
          />
        ) : null}
        {b.status === "in_progress" && (
          b.end_pin ? (
            <PinCard
              label="Your end PIN"
              pin={b.end_pin}
              body="Give this to your Captain only when the trip is really over: every stop done and you've been dropped off. It completes the trip and releases their payment."
              footer={a.complete ? <Button title="Or end the trip myself" icon="flag" kind="secondary" small onPress={() => setEndOpen(true)} style={{ alignSelf: "center" }} /> : undefined}
            />
          ) : (
            <Card style={styles.pinCard}>
              <View style={styles.pinIcon}><Ionicons name="time-outline" size={22} color={palette.marigold} /></View>
              <T variant="h2" color={palette.white} center>Trip in progress</T>
              <T variant="small" color={palette.onDarkMuted} center style={{ marginTop: 6 }}>
                Your trip runs until {dateRange(b.can_complete_from, b.can_complete_from)}. Your end PIN appears here on that day. Your Captain can't finish the trip without it.
              </T>
            </Card>
          )
        )}
        {b.group ? (
          <Card onPress={() => router.push(`/group/${b.group!.id}`)}>
            <Row gap={space.md}>
              <View style={styles.groupIcon}><Ionicons name="people" size={20} color={palette.rickshaw} /></View>
              <View style={{ flex: 1 }}>
                <T variant="bodyBold">Group trip · {b.group.code}</T>
                <T variant="caption">
                  {b.group.seats_taken != null ? `${b.group.seats_taken} of ${b.group.seats} seats taken. ` : ""}
                  You travel with other GoLoc travelers. Everyone has their own PIN.
                </T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.muted} />
            </Row>
          </Card>
        ) : null}
        {(b.status === "in_progress" || (b.status === "confirmed" && tripDay)) && (
          <Button title={b.status === "in_progress" ? "Open live trip" : "Track your Captain"} icon="navigate" onPress={() => router.push(`/trip/${b.id}`)} />
        )}
        {a.sos ? <SOSButton bookingRef={b.id} /> : null}
        {b.share_url ? (
          <Button title="Share trip with family" icon="share-social" kind="secondary" onPress={() => shareText(`I'm on a GoLoc trip (${b.code}) with ${b.captain.name}. Follow live: ${b.share_url}`)} />
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

      {/* ----- itinerary ----- */}
      {b.itinerary ? (
        <Card style={{ marginTop: space.lg }} onPress={() => router.push(`/itinerary/${b.itinerary!.id}`)}>
          <Row gap={space.md}>
            <Ionicons name="document-text" size={26} color={palette.rickshaw} />
            <View style={{ flex: 1 }}>
              <T variant="label">Your itinerary</T>
              <T variant="h2">{b.itinerary.title}</T>
              <T variant="caption">Day by day from {b.captain.name}: stays, meals, tickets and timings.</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.muted} />
          </Row>
        </Card>
      ) : null}

      {/* ----- privacy: the traveler decides if the Captain sees their number ----- */}
      {a.share_contact ? (
        <Card style={{ marginTop: space.lg }}>
          <Row gap={space.md}>
            <Ionicons name={b.traveler_shares_contact ? "call" : "eye-off-outline"} size={22} color={palette.rickshaw} />
            <View style={{ flex: 1 }}>
              <T variant="bodyBold">{b.traveler_shares_contact ? `${b.captain.name.split(" ")[0]} can see your number` : "Your number is hidden"}</T>
              <T variant="caption">
                {b.traveler_shares_contact
                  ? "They can call you about this trip. You can hide it again any time."
                  : `${b.captain.name.split(" ")[0]} only sees your name. Share your number if you'd like them to call you.`}
              </T>
            </View>
          </Row>
          <Button
            title={b.traveler_shares_contact ? "Hide my number" : "Share my number with my Captain"}
            icon={b.traveler_shares_contact ? "eye-off-outline" : "call-outline"}
            small
            kind={b.traveler_shares_contact ? "ghost" : "secondary"}
            loading={consent.isPending}
            onPress={() => consent.mutate(!b.traveler_shares_contact)}
            style={{ marginTop: space.md, alignSelf: "flex-start" }}
          />
        </Card>
      ) : null}

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
        visible={endOpen}
        title="End this trip?"
        body={`Only if your trip with ${b.captain.name} is finished. This completes the booking and releases their payment.`}
        confirm="Yes, end the trip"
        loading={endTrip.isPending}
        onConfirm={() => endTrip.mutate()}
        onClose={() => setEndOpen(false)}
      />
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

function PinCard({ label, pin, body, footer }: { label: string; pin: string; body: string; footer?: React.ReactNode }) {
  return (
    <Card style={styles.pinCard}>
      <View style={styles.pinIcon}><Ionicons name="key" size={20} color={palette.marigold} /></View>
      <T variant="label" color={palette.marigold} center>{label}</T>
      <View style={{ alignItems: "center", marginVertical: space.lg }}>
        <PinCode pin={pin} />
      </View>
      <T variant="small" color={palette.onDarkMuted} center style={{ paddingHorizontal: space.sm }}>{body}</T>
      {footer ? (
        <>
          <View style={styles.pinRule} />
          <View style={{ alignItems: "center" }}>{footer}</View>
        </>
      ) : null}
    </Card>
  );
}

const Detail = ({ label, value }: { label: string; value: string }) => (
  <View style={{ marginBottom: space.md }}>
    <T variant="label">{label}</T>
    <T style={{ marginTop: 2 }}>{value}</T>
  </View>
);

const styles = StyleSheet.create({
  pinCard: { backgroundColor: palette.night, paddingVertical: space.xl, alignItems: "stretch" },
  pinIcon: {
    width: 44, height: 44, borderRadius: 22, alignSelf: "center", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,178,26,0.14)", marginBottom: space.md,
  },
  pinRule: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.16)", marginVertical: space.lg },
  groupIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.rickshawSoft, alignItems: "center", justifyContent: "center" },
  line: { justifyContent: "space-between", paddingVertical: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
