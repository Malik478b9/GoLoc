import {
  AIField, api, ApiError, Banner, BookingDetail, Button, Card, Chip, dateRange, DateRangeCalendar, Field, Itinerary, ItinerarySummary, Loading, palette, Row, Screen, Segmented, Service, space, Stepper, T, titleCase,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { toLines, TRAVEL_MODES } from "../../../lib/itinerary";

type Tier = "standard" | "normal" | "medium" | "lavish";
type Leg = { mode: string; point: string; time: string; reference: string };
const EMPTY_LEG: Leg = { mode: "", point: "", time: "", reference: "" };

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

export default function NewItinerary() {
  const params = useLocalSearchParams<{ kind?: "template" | "custom"; booking_id?: string; service_id?: string }>();
  const qc = useQueryClient();
  const bookingId = params.booking_id;
  const [kind, setKind] = useState<"template" | "custom">(bookingId ? "custom" : params.kind ?? "template");
  const booking = useQuery({ queryKey: ["booking", bookingId], queryFn: () => api.get<BookingDetail>(`/bookings/${bookingId}/`), enabled: !!bookingId });
  const myServices = useQuery({ queryKey: ["my-services"], queryFn: () => api.get<Service[]>("/captain/services/") });
  const templates = useQuery({ queryKey: ["itineraries", "template"], queryFn: () => api.get<ItinerarySummary[]>("/captain/itineraries/", { kind: "template" }) });

  const [serviceId, setServiceId] = useState<string | undefined>(params.service_id);
  const [basedOn, setBasedOn] = useState<string | undefined>();
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
  const [notes, setNotes] = useState("");
  const [requests, setRequests] = useState("");

  const service = (myServices.data ?? []).find((s) => s.id === serviceId);
  useEffect(() => {
    if (!service) return;
    if (!title) setTitle(service.title);
    if (service.kind === "package") setDays(service.duration_days);
    else setTier((t) => (t === "medium" ? "standard" : t));
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
        inputs: { hotels: toLines(hotels), must_include: toLines(must), avoid: toLines(avoid), vehicle: vehicle.trim(), meals: meals.trim(), notes: notes.trim() },
      }),
    onSuccess: (it) => {
      qc.invalidateQueries({ queryKey: ["itineraries"] });
      router.replace(`/itineraries/${it.id}`);
    },
  });

  if (bookingId && booking.isLoading) return <Loading />;
  const b = booking.data;
  const err = create.error as ApiError | null;
  const ready = bookingId ? true : !!title.trim() && (kind === "template" || (!!start && !!end));
  const tiers: Tier[] = service && service.kind !== "package" ? ["standard", "normal", "medium", "lavish"] : ["normal", "medium", "lavish"];

  return (
    <Screen
      title={kind === "template" ? "New default itinerary" : "New custom itinerary"}
      subtitle="You fill what you know. AI writes the rest."
      footer={<Button title="Build with AI" icon="sparkles" disabled={!ready} loading={create.isPending} onPress={() => create.mutate()} />}
    >
      {b ? (
        <Banner tone="info" icon="person" title={`For ${b.traveler.name} · ${b.code}`} body={`${b.title} · ${dateRange(b.start_date, b.end_date)} · ${b.guests} guest${b.guests > 1 ? "s" : ""} · ${titleCase(b.tier)}`} />
      ) : (
        <Segmented options={[{ value: "template", label: "Default for a trip" }, { value: "custom", label: "Custom for a traveler" }]} value={kind} onChange={setKind} />
      )}

      {!bookingId ? (
        <>
          <T variant="h2" style={{ marginTop: space.lg, marginBottom: space.sm }}>Which trip?</T>
          <Row gap={8} style={{ flexWrap: "wrap", marginBottom: space.md }}>
            {(myServices.data ?? []).filter((s) => s.is_active !== false).map((s) => (
              <Chip key={s.id} label={s.title} active={serviceId === s.id} onPress={() => setServiceId(serviceId === s.id ? undefined : s.id)} />
            ))}
          </Row>
          <Field label="Itinerary title" placeholder="e.g. Ladakh in 6 days" value={title} onChangeText={setTitle} maxLength={140} />
        </>
      ) : null}
      <Field label="Places covered" placeholder="e.g. Leh · Nubra · Pangong" value={destination} onChangeText={setDestination} maxLength={200} hint={bookingId ? "Leave empty to use the trip's places." : undefined} />

      {(templates.data ?? []).filter((t) => t.status === "ready").length && kind === "custom" ? (
        <>
          <T variant="h2" style={{ marginBottom: space.sm }}>Start from your default itinerary</T>
          <Row gap={8} style={{ flexWrap: "wrap", marginBottom: space.md }}>
            {templates.data!.filter((t) => t.status === "ready").map((t) => (
              <Chip key={t.id} label={t.title} active={basedOn === t.id} onPress={() => setBasedOn(basedOn === t.id ? undefined : t.id)} />
            ))}
          </Row>
          {bookingId && !basedOn ? <T variant="caption" style={{ marginTop: -6, marginBottom: space.md }}>Not picked: we use your default for this trip automatically if you have one.</T> : null}
        </>
      ) : null}

      {!bookingId ? (
        <>
          <T variant="h2" style={{ marginBottom: space.sm }}>Comfort level</T>
          <Row gap={8} style={{ marginBottom: space.md }}>
            {tiers.map((t) => <Chip key={t} label={titleCase(t)} active={tier === t} onPress={() => setTier(t)} />)}
          </Row>
          <T variant="caption" style={{ marginTop: -6, marginBottom: space.md }}>
            {tier === "lavish" ? "4–5★ or boutique stays, fine dining, private SUV, VIP tickets." : tier === "medium" ? "3★ hotels, good local restaurants, private AC cab." : tier === "normal" ? "Guesthouses or homestays, local eateries, shared or basic transport." : "A day experience or guide day with no stay."}
          </T>
          {kind === "custom" ? (
            <Card style={{ marginBottom: space.md }}>
              <T variant="h2">Traveler's arrival and departure</T>
              <T variant="caption" style={{ marginBottom: space.md }}>Tap the arrival day, then the departure day.</T>
              <DateRangeCalendar start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
            </Card>
          ) : (
            <Card style={{ marginBottom: space.md }}><Stepper label="Days" value={days} onChange={setDays} min={1} max={30} /></Card>
          )}
          <Card style={{ marginBottom: space.md }}><Stepper label="Travelers" value={guests} onChange={setGuests} min={1} max={20} /></Card>
        </>
      ) : null}

      <LegFields title="Arrival" leg={arrival} onChange={setArrival} />
      <LegFields title="Departure" leg={departure} onChange={setDeparture} />

      <T variant="title" style={{ marginTop: space.sm }}>Your details</T>
      <T variant="caption" style={{ marginBottom: space.md }}>The AI keeps these exactly as you write them. Leave anything empty and it suggests something to fit the comfort level.</T>
      <Field label="Hotels you use (one per line)" multiline placeholder={"Night 1–2: The Grand Dragon, Leh\nNight 3: Nubra Organic Retreat"} value={hotels} onChangeText={setHotels} />
      <Field label="Must-include places (one per line)" multiline placeholder={"Pangong Lake\nKhardung La\nDiskit Monastery"} value={must} onChangeText={setMust} />
      <Field label="Places to skip (one per line)" multiline value={avoid} onChangeText={setAvoid} />
      <Field label="Vehicle" placeholder="e.g. Toyota Innova Crysta, AC" value={vehicle} onChangeText={setVehicle} maxLength={500} />
      <Field label="Meals" placeholder="e.g. Pure veg, Jain options, breakfast at hotel" value={meals} onChangeText={setMeals} maxLength={500} />
      <AIField purpose="itinerary_notes" context={{ title, destination, tier }} label="Anything else the AI should know" multiline placeholder="Permits, acclimatisation day, festival dates, your own tips…" value={notes} onChangeText={setNotes} maxLength={500} />
      {kind === "custom" ? (
        <AIField purpose="itinerary_requests" context={{ title, destination, tier }} label="Traveler's requests" multiline placeholder="Vegetarian, slow pace, elderly parent, anniversary dinner…" value={requests} onChangeText={setRequests} maxLength={2000} />
      ) : null}
      {err ? <Banner tone="danger" title={err.message} /> : null}
      <T variant="caption" color={palette.muted} style={{ marginTop: space.sm }}>Writing a detailed plan takes about a minute. You can edit everything afterwards.</T>
    </Screen>
  );
}
