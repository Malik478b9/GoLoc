import {
  api, Banner, BookingDetail, Button, Card, ConfirmSheet, dateRange, Divider, ErrorView, Field, Loading, money, openChat, palette, radius, Row,
  Screen, Sheet, space, StatusBadge, T, time12, timeAgo, timeLeft, TIER_LABEL, toast, toastError,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Linking, StyleSheet, TextInput, View } from "react-native";

export default function CaptainBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["booking", id],
    queryFn: () => api.get<BookingDetail>(`/bookings/${id}/`),
    refetchInterval: (query) => (query.state.data?.status === "accepted" ? 10000 : false),
  });
  const [sheet, setSheet] = useState<null | "decline" | "cancel" | "start">(null);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");

  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: any }) => api.post<BookingDetail>(`/bookings/${id}/${action}/`, body ?? {}),
    onSuccess: (b, { action }) => {
      qc.setQueryData(["booking", id], b);
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setSheet(null);
      setReason("");
      setPin("");
      const msg: Record<string, string> = {
        accept: "Accepted — the traveler has been asked to pay",
        decline: "Request declined",
        cancel: "Trip cancelled — the traveler gets a full refund",
        start: "Trip started — have a great one!",
        complete: `Trip completed · ${money(b.captain_net)} added to your wallet`,
      };
      toast(msg[action] ?? "Done", "success");
      if (action === "start") router.push(`/trip/${b.id}`);
    },
    onError: toastError,
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Screen title="Booking"><ErrorView error={q.error} onRetry={q.refetch} /></Screen>;
  const b = q.data;
  const a = b.actions;
  const today = new Date().toISOString().slice(0, 10);
  const isTripDay = b.start_date <= today;

  const footer =
    a.accept ? (
      <Row gap={10}>
        <Button title="Decline" kind="secondary" style={{ flex: 1 }} onPress={() => setSheet("decline")} />
        <Button title="Accept" style={{ flex: 2 }} loading={act.isPending} onPress={() => act.mutate({ action: "accept" })} />
      </Row>
    ) : a.start ? (
      <Button title={isTripDay ? "Start trip with PIN" : `Starts ${dateRange(b.start_date, b.start_date)}`} icon="key" disabled={!isTripDay} onPress={() => setSheet("start")} />
    ) : a.complete ? (
      <Row gap={10}>
        <Button title="Trip console" kind="secondary" icon="navigate" style={{ flex: 1 }} onPress={() => router.push(`/trip/${b.id}`)} />
        <Button title="Complete trip" style={{ flex: 1 }} loading={act.isPending} onPress={() => act.mutate({ action: "complete" })} />
      </Row>
    ) : undefined;

  return (
    <Screen title={b.code} subtitle={b.title} onRefresh={q.refetch} footer={footer}>
      <Row style={{ justifyContent: "space-between" }}>
        <StatusBadge status={b.status} />
        <T variant="caption">Requested {timeAgo(b.created_at)}</T>
      </Row>
      <T variant="title" style={{ marginTop: space.sm }}>{b.title}</T>
      <T variant="caption">
        {dateRange(b.start_date, b.end_date)} · {time12(b.start_time)} · {b.guests} guest{b.guests > 1 ? "s" : ""}
        {b.tier !== "standard" ? ` · ${TIER_LABEL[b.tier]} tier` : ""}
      </T>

      <View style={{ marginTop: space.lg, gap: space.md }}>
        {b.status === "requested" && <Banner tone="warning" icon="time" title={`Respond within ${timeLeft(b.request_expires_at)}`} body="Requests expire automatically. Quick replies rank you higher." />}
        {b.status === "accepted" && <Banner tone="info" icon="card" title="Waiting for payment" body={`The traveler has ${timeLeft(b.payment_due_at)} to pay. You'll get a notification when it's confirmed.`} />}
        {b.status === "confirmed" && <Banner tone="success" title="Confirmed & paid" body="On the trip day, ask the traveler for their 4-digit trip PIN to start." />}
        {b.status === "completed" && <Banner tone="success" title={`${money(b.captain_net)} credited to your wallet`} body="Withdraw any time from Earnings." />}
        {["cancelled", "declined", "expired"].includes(b.status) && (
          <Banner tone="danger" title={b.status === "expired" ? "Expired" : `Cancelled by ${b.cancelled_by || "you"}`} body={b.cancel_reason} />
        )}
        {a.track && b.status === "in_progress" ? <Button title="Open trip console" icon="navigate" kind="dark" onPress={() => router.push(`/trip/${b.id}`)} /> : null}
      </View>

      {!["cancelled", "declined", "expired"].includes(b.status) ? (
        <Card style={{ marginTop: space.lg }}>
          <T variant="label">Itinerary</T>
          {b.itinerary ? (
            <>
              <T variant="h2" style={{ marginTop: 4 }}>{b.itinerary.title}</T>
              <T variant="caption">{b.itinerary.code} · {b.itinerary.is_published ? "Shared with the traveler" : b.itinerary.status === "generating" ? "AI is writing…" : "Not shared yet"}</T>
              <Button title="Open itinerary" icon="document-text" small kind="secondary" onPress={() => router.push(`/itineraries/${b.itinerary!.id}`)} style={{ marginTop: space.md, alignSelf: "flex-start" }} />
            </>
          ) : (
            <>
              <T variant="caption" style={{ marginTop: 4 }}>Build a day-by-day plan for {b.traveler.name}: their dates, comfort level and requests. AI drafts it from your default itinerary; you finish and share it.</T>
              <Button title="Build itinerary with AI" icon="sparkles" small onPress={() => router.push({ pathname: "/itineraries/new", params: { booking_id: b.id } })} style={{ marginTop: space.md, alignSelf: "flex-start" }} />
            </>
          )}
        </Card>
      ) : null}

      <Card style={{ marginTop: space.lg }}>
        <T variant="label">Traveler</T>
        <Row style={{ justifyContent: "space-between", marginTop: 4 }}>
          <T variant="h2">{b.traveler.name}</T>
          {b.traveler.phone ? <Button title="Call" icon="call" small kind="secondary" onPress={() => Linking.openURL(`tel:${b.traveler.phone}`)} /> : null}
        </Row>
        {!b.traveler.phone ? <T variant="caption">Phone number is shared once the trip is paid.</T> : null}
        <Button title="Message traveler" icon="chatbubble-ellipses" small kind="secondary" onPress={() => openChat({ booking_id: b.id })} style={{ marginTop: space.md }} />
      </Card>

      <Card style={{ marginTop: space.md }}>
        {b.meeting_point ? <Detail label="Meeting point" value={b.meeting_point} /> : null}
        {b.note ? <Detail label="Note from traveler" value={b.note} /> : null}
        {b.tier !== "standard" && b.service_snapshot.tier_inclusions?.[b.tier]?.length ? (
          <View style={{ marginBottom: space.md }}>
            <T variant="label" style={{ marginBottom: 4 }}>You arrange ({TIER_LABEL[b.tier]})</T>
            {b.service_snapshot.tier_inclusions[b.tier].map((i) => <T key={i} variant="small">• {i}</T>)}
          </View>
        ) : null}
        <T variant="label" style={{ marginBottom: 4 }}>Earnings</T>
        <Row style={styles.line}><T variant="small">Trip fare</T><T variant="small">{money(b.fare)}</T></Row>
        <Row style={styles.line}><T variant="small">GoLoc commission</T><T variant="small">− {money(b.fare - (b.captain_net ?? 0))}</T></Row>
        <Divider style={{ marginVertical: 6 }} />
        <Row style={styles.line}><T variant="bodyBold">You earn</T><T variant="bodyBold" color={palette.ember}>{money(b.captain_net)}</T></Row>
        <T variant="caption" style={{ marginTop: 4 }}>Credited to your wallet when the trip is completed.</T>
      </Card>

      <Card style={{ marginTop: space.md }}>
        <T variant="label" style={{ marginBottom: space.sm }}>Timeline</T>
        {b.events.map((e, i) => (
          <Row key={i} gap={10} style={{ alignItems: "flex-start", paddingVertical: 5 }}>
            <View style={[styles.dot, { backgroundColor: e.kind === "sos" ? palette.coral : palette.ember }]} />
            <View style={{ flex: 1 }}>
              <T variant="small">{e.message}</T>
              <T variant="caption" style={{ fontSize: 11 }}>{timeAgo(e.created_at)}</T>
            </View>
          </Row>
        ))}
      </Card>

      {a.cancel ? <Button title="Cancel this trip" kind="ghost" onPress={() => setSheet("cancel")} style={{ marginTop: space.lg }} /> : null}

      <ConfirmSheet
        visible={sheet === "decline" || sheet === "cancel"}
        title={sheet === "decline" ? "Decline this request?" : "Cancel this trip?"}
        body={sheet === "cancel" ? "The traveler gets a 100% refund. Frequent cancellations lower your ranking and can lead to a hold." : "Let the traveler know why — they'll see your message."}
        confirm={sheet === "decline" ? "Decline" : "Cancel trip"}
        danger
        loading={act.isPending}
        onConfirm={() => act.mutate({ action: sheet!, body: { reason } })}
        onClose={() => setSheet(null)}
      >
        <Field placeholder={sheet === "decline" ? "e.g. Fully booked that day" : "Reason (required)"} value={reason} onChangeText={setReason} maxLength={300} />
      </ConfirmSheet>

      <Sheet visible={sheet === "start"} onClose={() => setSheet(null)} title="Enter trip PIN">
        <T style={{ marginBottom: space.lg }}>Ask {b.traveler.name.split(" ")[0]} for the 4-digit PIN shown in their app. This confirms you've met.</T>
        <TextInput value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" maxLength={4} autoFocus style={styles.pin} placeholder="••••" placeholderTextColor={palette.lineStrong} />
        <Button title="Start trip" disabled={pin.length !== 4} loading={act.isPending} onPress={() => act.mutate({ action: "start", body: { pin } })} style={{ marginTop: space.lg }} />
        <Button title="Cancel" kind="ghost" onPress={() => setSheet(null)} />
      </Sheet>
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
  line: { justifyContent: "space-between", paddingVertical: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  pin: { fontSize: 36, letterSpacing: 20, textAlign: "center", fontWeight: "800", backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.lineStrong, paddingVertical: 14, color: palette.ink },
});
