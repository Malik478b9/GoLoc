import {
  api, Button, Calendar, palette, Card, Chip, Field, GroupTrip, Loading, longDate, money, Row, Screen, space, Stepper, T, time12, toast, toastError,
  useT, VoiceField,
} from "@goloc/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { useMyGroups } from "../../../lib/data";

const TIMES = ["06:00", "07:00", "08:00", "09:00", "10:00", "14:00", "16:00", "18:00"];

/** Post a group departure in four short steps. */
export default function NewGroupTrip() {
  const t = useT();
  const qc = useQueryClient();
  const q = useMyGroups();
  const services = q.data?.services ?? [];
  const [serviceId, setServiceId] = useState<string | undefined>();
  const svc = services.find((s) => s.id === serviceId);
  const [date, setDate] = useState<string | undefined>();
  const [time, setTime] = useState("09:00");
  const [seats, setSeats] = useState(8);
  const [minSeats, setMinSeats] = useState(3);
  const [price, setPrice] = useState("");
  const [meeting, setMeeting] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!serviceId && services.length) setServiceId(services[0].id);
  }, [services, serviceId]);
  useEffect(() => {
    if (!svc) return;
    setPrice(String(svc.suggested_price));
    setTime((svc.start_time || "09:00").slice(0, 5));
  }, [svc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (minSeats > seats) setMinSeats(seats);
  }, [seats, minSeats]);

  const priceNum = Number(price.replace(/\D/g, "")) || 0;
  const post = useMutation({
    mutationFn: () => api.post<GroupTrip>("/captain/groups/", {
      service_id: serviceId, start_date: date, start_time: time, seats, min_seats: minSeats, price_per_seat: priceNum,
      meeting_point: meeting.trim(), note: note.trim(),
    }),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: ["my-groups"] });
      toast("Group trip posted. Travelers can join now.", "success");
      router.replace(`/groups/${g.id}`);
    },
    onError: toastError,
  });

  if (q.isLoading) return <Loading />;
  const ready = !!serviceId && !!date && priceNum > 0;
  const full = priceNum * seats;

  return (
    <Screen title="Post a group trip" footer={
      <Button title={ready ? `Post for ${date ? longDate(date) : ""}` : "Post group trip"} icon="people" disabled={!ready}
        loading={post.isPending} onPress={() => post.mutate()} />
    }>
      <Step n={1} title="Which trip?">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {services.map((s) => <Chip key={s.id} label={s.title} active={s.id === serviceId} onPress={() => setServiceId(s.id)} />)}
        </ScrollView>
      </Step>

      <Step n={2} title="Which day?">
        <Calendar value={date} onChange={setDate} minDate={q.data ? new Date(`${q.data.earliest_date}T00:00:00`) : undefined} />
        {date ? <T variant="bodyBold" style={{ marginTop: space.sm }}>{longDate(date)}{svc && svc.duration_days > 1 ? ` · ${svc.duration_days} ${t("days")}` : ""}</T> : null}
        <T variant="label" style={{ marginTop: space.lg, marginBottom: space.sm }}>Start time</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TIMES.map((x) => <Chip key={x} label={time12(x)} active={time === x} onPress={() => setTime(x)} />)}
        </ScrollView>
      </Step>

      <Step n={3} title="Seats and price">
        <Stepper label="Seats" value={seats} onChange={setSeats} min={2} max={30} />
        <View style={{ height: space.md }} />
        <Stepper label="Needed to run" value={minSeats} onChange={setMinSeats} min={1} max={seats} />
        <T variant="caption" style={{ marginTop: 6, marginBottom: space.md }}>
          {t("If fewer than {n} seats are paid {h} hours before, the trip is cancelled and everyone gets a full refund.", { n: minSeats, h: q.data?.decide_hours ?? 24 })}
        </T>
        <Field label="Price per seat" prefix="₹" keyboardType="number-pad" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ""))} maxLength={7} />
        {priceNum > 0 ? <T variant="caption">{t("Full group: {amount} before GoLoc's fee", { amount: money(full) })}</T> : null}
      </Step>

      <Step n={4} title="Where to meet (optional)">
        <VoiceField label="Meeting point" placeholder="Charminar main gate" value={meeting} onChangeText={setMeeting} maxLength={200} />
        <VoiceField label="Note for travelers" placeholder="Easy walk, wear comfortable shoes. Suits first-timers." value={note} onChangeText={setNote}
          multiline maxLength={1000} />
      </Step>
    </Screen>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: space.lg }}>
      <Row gap={10} style={{ marginBottom: space.md }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: palette.emberSoft, alignItems: "center", justifyContent: "center" }}>
          <T variant="small" color={palette.ember}>{n}</T>
        </View>
        <T variant="h2">{title}</T>
      </Row>
      {children}
    </Card>
  );
}
