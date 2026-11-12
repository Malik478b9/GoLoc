import { Ionicons } from "@expo/vector-icons";
import {
  api, Avatar, Banner, BookingDetail, Button, Card, dateRange, ErrorView, Field, GroupTrip, Loading, longDate, money, palette,
  Rating, Row, Screen, SeatsBar, space, Stepper, T, time12, toast, toastError, useAuth,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

type Guest = { name: string; phone: string };
const tenDigits = (phone?: string | null) => (phone ?? "").replace(/\D/g, "").slice(-10);

/** One group departure: what it is, who leads it, how full it is. Joining holds seats; payment (with offers) is on the booking. */
export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["group", id], queryFn: () => api.get<GroupTrip>(`/groups/${id}/`), refetchInterval: 30_000 });
  const { user } = useAuth();
  const [seats, setSeats] = useState(1);
  const [people, setPeople] = useState<Guest[]>([{ name: user?.full_name ?? "", phone: tenDigits(user?.phone_number) }]);
  useEffect(() => {
    setPeople((cur) => (cur.length === seats ? cur : Array.from({ length: seats }, (_, i) => cur[i] ?? { name: "", phone: "" })));
  }, [seats]);
  const setPerson = (i: number, patch: Partial<Guest>) => setPeople((cur) => cur.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const missingName = people.findIndex((g) => g.name.trim().length < 2);
  const badPhone = people.findIndex((g, i) => (i === 0 ? tenDigits(g.phone).length !== 10 : g.phone.trim() !== "" && tenDigits(g.phone).length !== 10));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["group", id] });
    qc.invalidateQueries({ queryKey: ["groups"] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
  };
  const join = useMutation({
    mutationFn: () => api.post<BookingDetail>(`/groups/${id}/join/`, {
      guests: seats,
      guest_details: people.map((g) => ({ name: g.name.trim(), phone: g.phone.trim() })),
    }),
    onSuccess: (b) => {
      refresh();
      toast(b.discount ? `Seats held · ${b.coupon?.code} saves you ${money(b.discount)}` : "Seats held. Pay to confirm.", "success");
      router.replace(`/booking/${b.id}`);
    },
    onError: (e) => {
      refresh();
      toastError(e);
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Screen title="Group trip"><ErrorView error={q.error} onRetry={q.refetch} /></Screen>;
  const g = q.data;
  const mine = g.my_booking && !["cancelled", "declined", "expired"].includes(g.my_booking.status) ? g.my_booking : null;
  const canJoin = g.state === "open" && !mine;
  const maxSeats = Math.max(1, Math.min(g.seats_left, 10));
  const fare = g.price_per_seat * seats;
  const insurance = g.insurance_per_seat * seats;

  const footer = mine ? (
    <Button title={mine.status === "accepted" ? "Pay to keep your seats" : "Open my booking"} icon="arrow-forward"
      onPress={() => router.push(`/booking/${mine.id}`)} />
  ) : canJoin ? (
    <Row gap={space.md}>
      <View style={{ flex: 1 }}>
        <T variant="caption">{seats} seat{seats > 1 ? "s" : ""} + insurance</T>
        <T variant="title">{money(fare + insurance)}</T>
      </View>
      <Button title="Hold my seats" icon="people" style={{ flex: 1.3 }} loading={join.isPending}
        disabled={missingName >= 0 || badPhone >= 0} onPress={() => join.mutate()} />
    </Row>
  ) : undefined;

  return (
    <Screen title="Group trip" subtitle={g.code} onRefresh={q.refetch} footer={footer}>
      {g.service.cover_image ? <Image source={{ uri: g.service.cover_image }} style={styles.cover} /> : null}
      <T variant="display" style={{ marginTop: space.lg }}>{g.title}</T>
      <T variant="body" style={{ marginTop: 4 }}>
        {longDate(g.start_date)}{g.days > 1 ? ` → ${longDate(g.end_date)}` : ""}
      </T>
      <Row gap={space.lg} style={{ marginTop: space.md, flexWrap: "wrap" }}>
        <Fact icon="time-outline" text={`Starts ${time12(g.start_time)}`} />
        <Fact icon="calendar-outline" text={g.days > 1 ? `${g.days} days` : `${g.service.duration_hours} hours`} />
        <Fact icon="location-outline" text={g.city_name} />
      </Row>

      {g.state === "cancelled" ? (
        <View style={{ marginTop: space.lg }}><Banner tone="danger" icon="close-circle" title="This group trip was cancelled" body={g.cancel_reason || "Everyone who paid got a full refund."} /></View>
      ) : g.state === "full" && !mine ? (
        <View style={{ marginTop: space.lg }}><Banner tone="info" icon="people" title="This group is full" body="Check the Captain's other dates, or book them privately." /></View>
      ) : g.state === "departed" || g.state === "finished" ? (
        <View style={{ marginTop: space.lg }}><Banner tone="info" icon="flag" title="This group has left" body="Look for the next date below on the Captain's profile." /></View>
      ) : null}
      {mine ? (
        <View style={{ marginTop: space.lg }}>
          <Banner tone="success" icon="checkmark-circle" title={`You're in · ${mine.guests} seat${mine.guests > 1 ? "s" : ""}`}
            body={mine.status === "accepted" ? "Your seats are held. Pay soon or they go back to others." : "See your trip PIN and live tracking in your booking."} />
        </View>
      ) : null}

      <Card style={{ marginTop: space.lg }}>
        <Row style={{ justifyContent: "space-between", marginBottom: space.md }}>
          <T variant="h2">Seats</T>
          <T variant="bodyBold">{money(g.price_per_seat)} <T variant="caption">/ seat</T></T>
        </Row>
        <SeatsBar g={g} />
        {!g.will_run && g.state === "open" ? (
          <T variant="caption" style={{ marginTop: space.md }}>
            The trip runs once {g.min_seats} seats are paid. If not, it's cancelled the day before and you get a full refund.
          </T>
        ) : null}
      </Card>

      <Card style={{ marginTop: space.md }} onPress={() => router.push(`/captain/${g.captain.id}`)}>
        <Row gap={space.md}>
          <Avatar uri={g.captain.avatar} name={g.captain.name} size={48} verified={g.captain.is_verified} />
          <View style={{ flex: 1 }}>
            <T variant="caption">Your Captain</T>
            <T variant="bodyBold">{g.captain.name}</T>
            <Row gap={8}>
              {g.captain.rating_count ? <Rating value={g.captain.rating_avg} count={g.captain.rating_count} /> : null}
              {g.captain.languages?.length ? <T variant="caption" numberOfLines={1}>{g.captain.languages.slice(0, 3).join(", ")}</T> : null}
            </Row>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.muted} />
        </Row>
      </Card>

      {g.note || g.service.description ? (
        <Card style={{ marginTop: space.md }}>
          <T variant="h2" style={{ marginBottom: space.sm }}>About this trip</T>
          {g.note ? <T>{g.note}</T> : null}
          {g.service.description ? <T variant="caption" style={{ marginTop: g.note ? space.sm : 0 }}>{g.service.description}</T> : null}
        </Card>
      ) : null}

      {(g.service.stops?.length || g.service.itinerary?.length) ? (
        <Card style={{ marginTop: space.md }}>
          <T variant="h2" style={{ marginBottom: space.sm }}>{g.service.stops?.length ? "Stops" : "Day by day"}</T>
          {(g.service.stops?.length ? g.service.stops : g.service.itinerary).map((s, i) => (
            <Row key={i} gap={space.md} style={{ alignItems: "flex-start", paddingVertical: 5 }}>
              <View style={styles.num}><T variant="small" color={palette.rickshaw}>{i + 1}</T></View>
              <T style={{ flex: 1 }}>{s}</T>
            </Row>
          ))}
        </Card>
      ) : null}

      {g.meeting_point ? (
        <Card style={{ marginTop: space.md }}>
          <Fact icon="flag-outline" text={`Meet at ${g.meeting_point}`} />
        </Card>
      ) : null}

      <Card style={{ marginTop: space.md }}>
        <T variant="h2" style={{ marginBottom: space.sm }}>Travelling with strangers, safely</T>
        <Fact icon="key-outline" text="Everyone gets their own trip PIN. Your Captain checks each person in." />
        <Fact icon="shield-checkmark-outline" text="Trip insurance, live tracking and SOS for every traveler." />
        <Fact icon="eye-off-outline" text="Other travelers never see your number. Your Captain sees names only." />
        <Fact icon="cash-outline" text="Cancelled by the Captain or not enough people? Full refund." />
      </Card>

      {canJoin ? (
        <Card style={{ marginTop: space.md }}>
          <T variant="h2" style={{ marginBottom: space.md }}>Join this group</T>
          <Stepper label="Seats" value={seats} onChange={setSeats} min={1} max={maxSeats} />
          {people.map((p, i) => (
            <View key={i} style={{ marginTop: space.md }}>
              <T variant="label" style={{ marginBottom: space.sm }}>{i === 0 ? "Seat 1 · You" : `Seat ${i + 1}`}</T>
              <Field label="Full name" placeholder={i === 0 ? "Your name" : "As on their ID"} value={p.name} onChangeText={(v) => setPerson(i, { name: v })}
                autoCapitalize="words" maxLength={80} error={i === missingName && p.name.length > 0 ? "Add at least 2 letters" : undefined} />
              <Field label={i === 0 ? "Mobile" : "Mobile (optional)"} prefix="+91" keyboardType="phone-pad" placeholder="98765 43210" maxLength={14}
                value={p.phone} onChangeText={(v) => setPerson(i, { phone: v })}
                error={i === badPhone && p.phone.length > 0 ? "Enter a 10-digit mobile number" : undefined} />
            </View>
          ))}
          <View style={styles.rule} />
          <Row style={styles.line}><T variant="small">{seats} × {money(g.price_per_seat)}</T><T variant="small">{money(fare)}</T></Row>
          <Row style={styles.line}><T variant="small">Trip insurance</T><T variant="small">{money(insurance)}</T></Row>
          <Row style={styles.line}><T variant="bodyBold">Total</T><T variant="bodyBold">{money(fare + insurance)}</T></Row>
          {seats >= 4 ? <T variant="small" color={palette.success} style={{ marginTop: space.sm }}>Booking 4 seats? Your first time, the 4th seat is free (PAY3GET4).</T> : null}
          <T variant="caption" style={{ marginTop: space.sm }}>Your seats are held for 30 minutes. Apply coupons or gift vouchers on the next step, then pay.</T>
        </Card>
      ) : null}
      <T variant="caption" center style={{ marginTop: space.lg }}>{dateRange(g.start_date, g.end_date)} · {g.code}</T>
    </Screen>
  );
}

function Fact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <Row gap={8} style={{ paddingVertical: 4, alignItems: "flex-start" }}>
      <Ionicons name={icon} size={17} color={palette.rickshaw} style={{ marginTop: 2 }} />
      <T variant="small" style={{ flex: 1 }}>{text}</T>
    </Row>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", height: 200, borderRadius: 24 },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.rickshawSoft, alignItems: "center", justifyContent: "center" },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: palette.lineStrong, marginVertical: space.lg },
  line: { justifyContent: "space-between", paddingVertical: 3 },
});
