import { Ionicons } from "@expo/vector-icons";
import {
  api, ApiError, Banner, BookingDetail, Button, Card, Chip, dateRange, DateRangeCalendar, Field, Itinerary, ItinerarySummary, Loading, palette, Pressy,
  radius, Row, Screen, Segmented, Service, space, Stepper, T, titleCase, useT, VoiceButton, VoiceField,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { toLines, TRAVEL_MODES } from "../../../lib/itinerary";

type Tier = "standard" | "normal" | "medium" | "lavish";
type Leg = { mode: string; point: string; time: string; reference: string };
const EMPTY_LEG: Leg = { mode: "", point: "", time: "", reference: "" };

// Plain words for comfort levels; the server keeps its own names.
const TIER_WORDS: Record<Tier, string> = { standard: "Day trip", normal: "Budget", medium: "Comfort", lavish: "Luxury" };

function LegFields({ title, leg, onChange }: { title: string; leg: Leg; onChange: (l: Leg) => void }) {
  return (
    <Card style={{ marginBottom: space.md }}>
      <T variant="h2" style={{ marginBottom: space.sm }}>{title}</T>
      <Row gap={8} style={{ flexWrap: "wrap", marginBottom: space.md }}>
        {TRAVEL_MODES.map((m) => <Chip key={m} label={titleCase(m)} active={leg.mode === m} onPress={() => onChange({ ...leg, mode: leg.mode === m ? "" : m })} />)}
      </Row>
      <Field label="Where" placeholder="e.g. Leh airport (IXL), Secunderabad station" value={leg.point} onChangeText={(v) => onChange({ ...leg, point: v })} maxLength={120} />
      <Row gap={10}>
        <View style={{ flex: 1 }}><Field label="Time" placeholder="10:30" value={leg.time} onChangeText={(v) => onChange({ ...leg, time: v })} maxLength={20} /></View>
        <View style={{ flex: 1.4 }}><Field label="Flight / train no." placeholder="6E 2005" value={leg.reference} onChangeText={(v) => onChange({ ...leg, reference: v })} maxLength={40} /></View>
      </Row>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <Row gap={space.md} style={{ marginBottom: space.md }}>
        <View style={styles.stepNo}><T variant="bodyBold" color={palette.white}>{n}</T></View>
        <T variant="title" style={{ flex: 1 }}>{title}</T>
      </Row>
      {children}
    </View>
  );
}

export default function NewItinerary() {
  const params = useLocalSearchParams<{ kind?: "template" | "custom"; booking_id?: string; service_id?: string }>();
  const qc = useQueryClient();
  const t = useT();
  const bookingId = params.booking_id;
  const [kind, setKind] = useState<"template" | "custom">(bookingId ? "custom" : params.kind ?? "template");
  const booking = useQuery({ queryKey: ["booking", bookingId], queryFn: () => api.get<BookingDetail>(`/bookings/${bookingId}/`), enabled: !!bookingId });
  const myServices = useQuery({ queryKey: ["my-services"], queryFn: () => api.get<Service[]>("/captain/services/") });
  const templates = useQuery({ queryKey: ["itineraries", "template"], queryFn: () => api.get<ItinerarySummary[]>("/captain/itineraries/", { kind: "template" }) });

  const [serviceId, setServiceId] = useState<string | undefined>(params.service_id);
  const [basedOn, setBasedOn] = useState<string | undefined>();
  const [brief, setBrief] = useState("");
  const [more, setMore] = useState(false);
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [tier, setTier] = useState<Tier>("medium");
  const [days, setDays] = useState(3);
  const [guests, setGuests] = useState(2);
  const [start, setStart] = useState<string | undefined>();
  const [end, setEnd] = useState<string | undefined>();
  const [arrival, setArrival] = useState<Leg>(EMPTY_LEG);
  const [departure, setDeparture] = useState<Leg>(EMPTY_LEG);
  const [hotels, setHotels] = useState("");
  const [must, setMust] = useState("");
  const [avoid, setAvoid] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [meals, setMeals] = useState("");
  const [requests, setRequests] = useState("");

  const services = (myServices.data ?? []).filter((s) => s.is_active !== false);
  const service = services.find((s) => s.id === serviceId);
  useEffect(() => {
    if (!service) return;
    setTitle(service.title);
    if (service.kind === "package") setDays(service.duration_days);
    else setTier((x) => (x === "medium" ? "standard" : x));
    if (!must && service.stops.length) setMust(service.stops.join("\n"));
  }, [service?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (booking.data && !requests) setRequests(booking.data.note);
  }, [booking.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useMutation({
    mutationFn: () =>
      api.post<Itinerary>("/captain/itineraries/", {
        kind,
        ...(bookingId
          ? { booking_id: bookingId }
          : {
              service_id: serviceId ?? null, title: title.trim(), tier, days: kind === "custom" && start && end ? undefined : days, guests,
              ...(kind === "custom" ? { start_date: start, end_date: end } : {}),
            }),
        ...(destination.trim() ? { destination: destination.trim() } : {}),
        ...(basedOn ? { based_on_id: basedOn } : {}),
        arrival, departure, requests: requests.trim(),
        inputs: { brief: brief.trim(), hotels: toLines(hotels), must_include: toLines(must), avoid: toLines(avoid), vehicle: vehicle.trim(), meals: meals.trim(), notes: "" },
      }),
    onSuccess: (it) => {
      qc.invalidateQueries({ queryKey: ["itineraries"] });
      router.replace(`/itineraries/${it.id}`);
    },
  });

  if (bookingId && booking.isLoading) return <Loading />;
  const b = booking.data;
  const err = create.error as ApiError | null;
  const needTitle = !bookingId && !service;
  const ready = bookingId ? true : !!title.trim() && (kind === "template" || (!!start && !!end));
  const tiers: Tier[] = service && service.kind !== "package" ? ["standard", "normal", "medium", "lavish"] : ["normal", "medium", "lavish"];
  const readyTemplates = (templates.data ?? []).filter((x) => x.status === "ready");
  let step = 0;

  return (
    <Screen
      title="Make an itinerary"
      subtitle="Speak about the trip. AI writes the full plan."
      footer={<Button title="Make my itinerary" icon="sparkles" disabled={!ready} loading={create.isPending} onPress={() => create.mutate()} />}
    >
      {b ? (
        <Banner tone="info" icon="person" title={`${t("For")} ${b.traveler.name} · ${b.code}`} body={`${b.title} · ${dateRange(b.start_date, b.end_date)} · ${b.guests} ${t("guests")}`} />
      ) : (
        <Segmented options={[{ value: "template", label: "For my trip page" }, { value: "custom", label: "For one traveler" }]} value={kind} onChange={setKind} />
      )}

      {!bookingId ? (
        <Step n={++step} title="Which trip?">
          <Row gap={8} style={{ flexWrap: "wrap" }}>
            {services.map((s) => <Chip key={s.id} label={s.title} active={serviceId === s.id} onPress={() => setServiceId(serviceId === s.id ? undefined : s.id)} />)}
          </Row>
          {needTitle ? <Field label="Trip name" placeholder="e.g. Ladakh in 6 days" value={title} onChangeText={setTitle} maxLength={140} style={{ marginTop: space.md }} /> : null}
        </Step>
      ) : null}

      {!bookingId ? (
        <Step n={++step} title={kind === "custom" ? "Traveler's dates" : "How many days?"}>
          {kind === "custom" ? (
            <Card>
              <T variant="caption" style={{ marginBottom: space.md }}>Tap the arrival day, then the departure day.</T>
              <DateRangeCalendar start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
            </Card>
          ) : (
            <Card><Stepper label="Days" value={days} onChange={setDays} min={1} max={30} /></Card>
          )}
          <Card style={{ marginTop: space.md }}><Stepper label="Travelers" value={guests} onChange={setGuests} min={1} max={20} /></Card>
          <Row gap={8} style={{ marginTop: space.md, flexWrap: "wrap" }}>
            {tiers.map((x) => <Chip key={x} label={TIER_WORDS[x]} active={tier === x} onPress={() => setTier(x)} />)}
          </Row>
        </Step>
      ) : null}

      <Step n={++step} title="Tell us about the trip">
        <T variant="body" style={{ marginBottom: space.md }}>
          Speak like you would to a friend: which places, which hotel, what food, how fast or slow. Any language is fine.
        </T>
        <VoiceButton onText={(x) => setBrief((cur) => (cur.trim() ? `${cur.trim()}\n${x}` : x))} label="Tap and speak" />
        <Field
          multiline
          value={brief}
          onChangeText={setBrief}
          maxLength={3000}
          placeholder="Or type here. e.g. Day 1 pick up at airport, Golconda fort in the evening, stay at Hotel Sitara…"
          style={{ marginTop: space.md, minHeight: 120 }}
        />
      </Step>

      <Pressy onPress={() => setMore(!more)} style={styles.more}>
        <T variant="bodyBold" style={{ flex: 1 }}>More details (optional)</T>
        <Ionicons name={more ? "chevron-up" : "chevron-down"} size={18} color={palette.ink2} />
      </Pressy>

      {more ? (
        <View>
          <Field label="Places covered" placeholder="e.g. Leh · Nubra · Pangong" value={destination} onChangeText={setDestination} maxLength={200} />
          {readyTemplates.length && kind === "custom" ? (
            <>
              <T variant="bodyBold" style={{ marginBottom: space.sm }}>Start from your trip page itinerary</T>
              <Row gap={8} style={{ flexWrap: "wrap", marginBottom: space.md }}>
                {readyTemplates.map((x) => <Chip key={x.id} label={x.title} active={basedOn === x.id} onPress={() => setBasedOn(basedOn === x.id ? undefined : x.id)} />)}
              </Row>
            </>
          ) : null}
          <LegFields title="Arrival" leg={arrival} onChange={setArrival} />
          <LegFields title="Departure" leg={departure} onChange={setDeparture} />
          <VoiceField label="Hotels you use (one per line)" multiline placeholder={"Night 1–2: The Grand Dragon, Leh\nNight 3: Nubra Organic Retreat"} value={hotels} onChangeText={setHotels} />
          <VoiceField label="Must-include places (one per line)" multiline placeholder={"Pangong Lake\nKhardung La\nDiskit Monastery"} value={must} onChangeText={setMust} />
          <VoiceField label="Places to skip (one per line)" multiline value={avoid} onChangeText={setAvoid} />
          <VoiceField label="Vehicle" placeholder="e.g. Toyota Innova Crysta, AC" value={vehicle} onChangeText={setVehicle} maxLength={500} />
          <VoiceField label="Meals" placeholder="e.g. Pure veg, Jain options, breakfast at hotel" value={meals} onChangeText={setMeals} maxLength={500} />
          {kind === "custom" ? (
            <VoiceField label="Traveler's requests" multiline placeholder="Vegetarian, slow pace, elderly parent, anniversary dinner…" value={requests} onChangeText={setRequests} maxLength={2000} />
          ) : null}
        </View>
      ) : null}

      {err ? <Banner tone="danger" title={err.message} /> : null}
      <T variant="caption" color={palette.muted} style={{ marginTop: space.md }}>
        Takes about a minute. The traveler gets it in English; you can read it in your language.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepNo: { width: 30, height: 30, borderRadius: 15, backgroundColor: palette.ember, alignItems: "center", justifyContent: "center" },
  more: { flexDirection: "row", alignItems: "center", marginTop: space.xl, marginBottom: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, backgroundColor: palette.paper, borderRadius: radius.lg },
});
