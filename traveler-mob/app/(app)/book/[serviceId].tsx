import { Ionicons } from "@expo/vector-icons";
import {
  api, ApiError, Avatar, Banner, BookingDetail, Button, Calendar, CaptainCard, Card, Divider, ErrorView, Field, Loading, longDate, money,
  palette, Quote, radius, Rating, Row, Screen, Service, space, Stepper, T, TIER_LABEL, toast,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

type ServiceInfo = { service: Service; captain: CaptainCard; refund_schedule: { min_hours_before: number; fare_refund_percent: number }[] };
type Tier = "normal" | "medium" | "lavish";

export default function Book() {
  const { serviceId, date: presetDate, guests: presetGuests, tier: presetTier } = useLocalSearchParams<{ serviceId: string; date?: string; guests?: string; tier?: Tier }>();
  const qc = useQueryClient();
  const info = useQuery({ queryKey: ["service", serviceId], queryFn: () => api.get<ServiceInfo>(`/captains/services/${serviceId}/`) });
  const svc = info.data?.service;
  const isPackage = svc?.kind === "package";
  const [tier, setTier] = useState<Tier>(presetTier ?? "medium");
  const [guests, setGuests] = useState(Number(presetGuests ?? 2));
  const [date, setDate] = useState<string | undefined>(presetDate);
  const [meeting, setMeeting] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (svc && guests > svc.max_guests) setGuests(svc.max_guests);
  }, [svc, guests]);

  const calendar = useQuery({
    queryKey: ["calendar", info.data?.captain.id],
    queryFn: () => api.get<{ unavailable: string[] }>(`/captains/${info.data!.captain.id}/calendar/`, { days: 120 }),
    enabled: !!info.data,
  });
  const quote = useQuery({
    queryKey: ["quote", serviceId, isPackage ? tier : "standard", guests],
    queryFn: () => api.post<Quote>("/captains/quote/", { service_id: serviceId, tier: isPackage ? tier : "standard", guests }),
    enabled: !!svc,
    placeholderData: (prev) => prev,
  });

  const request = useMutation({
    mutationFn: () =>
      api.post<BookingDetail>("/bookings/", {
        service_id: serviceId,
        tier: isPackage ? tier : "standard",
        guests,
        start_date: date,
        meeting_point: meeting.trim(),
        note: note.trim(),
      }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast(`Request ${b.code} sent to ${b.captain.name}`, "success");
      router.replace(`/booking/${b.id}`);
    },
  });

  if (info.isLoading) return <Loading />;
  if (info.error || !svc) return <Screen title="Book"><ErrorView error={info.error} onRetry={info.refetch} /></Screen>;
  const c = info.data!.captain;
  const err = request.error as ApiError | null;
  const q = quote.data;

  return (
    <Screen
      title="Book your trip"
      subtitle={svc.title}
      footer={
        <Row style={{ gap: space.lg }}>
          <View style={{ flex: 1 }}>
            <T variant="caption">Total incl. insurance</T>
            <T variant="title">{q ? money(q.total) : "—"}</T>
          </View>
          <Button title={date ? "Send request" : "Pick a date"} disabled={!date || request.isPending} loading={request.isPending} onPress={() => request.mutate()} style={{ flex: 1.3 }} />
        </Row>
      }
    >
      <Card style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
        <Avatar uri={c.avatar} name={c.name} size={48} verified />
        <View style={{ flex: 1 }}>
          <T variant="bodyBold">{c.name}</T>
          <Row gap={8}><Rating value={c.rating_avg} count={c.rating_count} /><T variant="caption">{c.code}</T></Row>
        </View>
      </Card>

      {isPackage ? (
        <View style={{ marginTop: space.xl }}>
          <T variant="h2">Comfort level</T>
          <T variant="caption" style={{ marginBottom: space.md }}>Your Captain books stays, meals and transport to match.</T>
          <View style={{ gap: 10 }}>
            {(["normal", "medium", "lavish"] as Tier[]).map((t) => {
              const active = tier === t;
              return (
                <Pressable key={t} onPress={() => setTier(t)} style={[styles.tier, active && styles.tierActive]}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Row gap={8}>
                      <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? palette.rickshaw : palette.muted} />
                      <T variant="h2">{TIER_LABEL[t]}</T>
                    </Row>
                    <T variant="bodyBold">{money(svc[`${t}_price`])}<T variant="caption"> /person</T></T>
                  </Row>
                  {(svc.tier_inclusions[t] ?? []).length ? (
                    <View style={{ marginTop: 6, marginLeft: 28 }}>
                      {svc.tier_inclusions[t]!.map((i) => <T key={i} variant="caption">✓ {i}</T>)}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Card style={{ marginTop: space.xl }}>
        <Stepper label="Guests" value={guests} onChange={setGuests} min={1} max={svc.max_guests} />
        {!isPackage && guests > svc.included_guests ? (
          <T variant="caption" style={{ marginTop: 6 }}>Includes {svc.included_guests}; {money(svc.extra_guest_price)} per extra guest.</T>
        ) : null}
      </Card>

      <Card style={{ marginTop: space.md }}>
        <T variant="h2" style={{ marginBottom: space.md }}>{isPackage ? `Start date · ${svc.duration_days} days` : "Date"}</T>
        <Calendar value={date} onChange={setDate} disabled={calendar.data?.unavailable ?? []} maxDays={120} />
        {date ? <T variant="bodyBold" style={{ marginTop: space.sm }} color={palette.rickshaw}>{longDate(date)}</T> : null}
      </Card>

      <View style={{ marginTop: space.lg }}>
        <Field label="Meeting point" placeholder={svc.stops[0] ? `e.g. ${svc.stops[0]} main gate` : "Hotel name or landmark"} value={meeting} onChangeText={setMeeting} maxLength={200} />
        <Field label="Note for your Captain (optional)" placeholder="Dietary needs, accessibility, interests…" value={note} onChangeText={setNote} multiline maxLength={1000} />
      </View>

      {q ? (
        <Card>
          <T variant="h2" style={{ marginBottom: space.sm }}>Price breakdown</T>
          <Row style={styles.line}><T>Trip fare{isPackage ? ` · ${guests} × ${money(svc[`${tier}_price`])}` : ""}</T><T variant="bodyBold">{money(q.fare)}</T></Row>
          <Row style={styles.line}><T>Trip insurance · {guests} guest{guests > 1 ? "s" : ""} × {q.days} day{q.days > 1 ? "s" : ""}</T><T variant="bodyBold">{money(q.insurance_fee)}</T></Row>
          <Divider style={{ marginVertical: 8 }} />
          <Row style={styles.line}><T variant="bodyBold">Total</T><T variant="h2">{money(q.total)}</T></Row>
          <T variant="caption" style={{ marginTop: 6 }}>You pay only after the Captain accepts. Paying in-app unlocks insurance, live tracking and SOS.</T>
        </Card>
      ) : null}

      <Card style={{ marginTop: space.md }}>
        <Row gap={8} style={{ marginBottom: 6 }}><Ionicons name="refresh-circle" size={18} color={palette.rickshaw} /><T variant="h2">Cancellation</T></Row>
        {info.data!.refund_schedule.filter((r) => r.min_hours_before > 0).map((r) => (
          <T key={r.min_hours_before} variant="caption">{r.min_hours_before}+ hours before start: {r.fare_refund_percent}% of fare back</T>
        ))}
        <T variant="caption">Under 6 hours: no fare refund. Insurance is always refunded if the trip doesn't start. If the Captain cancels, you get 100% back.</T>
      </Card>

      {err ? <View style={{ marginTop: space.md }}><Banner tone="danger" title={err.message} /></View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tier: { padding: space.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.line, backgroundColor: palette.paper },
  tierActive: { borderColor: palette.rickshaw, backgroundColor: palette.rickshawSoft },
  line: { justifyContent: "space-between", paddingVertical: 4 },
});
