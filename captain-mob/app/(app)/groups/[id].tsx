import { Ionicons } from "@expo/vector-icons";
import {
  api, Badge, Banner, Button, Card, ConfirmSheet, dateRange, ErrorView, Field, GroupTraveler, GroupTrip, Loading, longDate, money,
  palette, PinInput, Row, Screen, SeatsBar, Sheet, space, StatusBadge, T, time12, toast, toastError, useT,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";

type Detail = GroupTrip & { travelers: GroupTraveler[]; earnings: number };
type PinStep = { traveler: GroupTraveler; action: "start" | "complete" };

/** One departure: who's coming, check each traveler in with their PIN, finish each with their end PIN. */
export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-group", id], queryFn: () => api.get<Detail>(`/captain/groups/${id}/`), refetchInterval: 20_000 });
  const [step, setStep] = useState<PinStep | null>(null);
  const [pin, setPin] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["my-group", id] });
    qc.invalidateQueries({ queryKey: ["my-groups"] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const act = useMutation({
    mutationFn: ({ booking, action, pin: p }: { booking: string; action: string; pin: string }) =>
      api.post(`/bookings/${booking}/${action}/`, { pin: p }),
    onSuccess: (_, v) => {
      toast(v.action === "start" ? t("{name} checked in", { name: step?.traveler.name.split(" ")[0] ?? "" }) : t("Trip completed"), "success");
      setStep(null);
      setPin("");
      refresh();
    },
    onError: toastError,
  });
  const cancel = useMutation({
    mutationFn: () => api.post<Detail>(`/captain/groups/${id}/cancel/`, { reason: reason.trim() }),
    onSuccess: () => {
      setCancelOpen(false);
      toast("Group trip cancelled. Everyone who paid gets a full refund.", "success");
      refresh();
    },
    onError: toastError,
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Screen title="Group trip"><ErrorView error={q.error} onRetry={q.refetch} /></Screen>;
  const g = q.data;
  const paid = g.travelers.filter((x) => ["confirmed", "in_progress", "completed"].includes(x.status));
  const waiting = g.travelers.filter((x) => x.status === "accepted");
  const gone = g.travelers.filter((x) => ["cancelled", "declined"].includes(x.status));
  const checkedIn = paid.filter((x) => x.status !== "confirmed").length;
  const live = g.state !== "cancelled" && g.state !== "finished";

  return (
    <Screen title={g.title} subtitle={g.code} onRefresh={q.refetch}>
      <T variant="title">{longDate(g.start_date)}{g.days > 1 ? ` → ${longDate(g.end_date)}` : ""}</T>
      <T variant="caption" style={{ marginTop: 2 }}>
        {time12(g.start_time)}{g.meeting_point ? ` · ${g.meeting_point}` : ""}
      </T>

      {g.state === "cancelled" ? (
        <View style={{ marginTop: space.lg }}><Banner tone="danger" icon="close-circle" title="Cancelled" body={g.cancel_reason} /></View>
      ) : null}

      <Card style={{ marginTop: space.lg }}>
        <Row style={{ justifyContent: "space-between", marginBottom: space.md }}>
          <T variant="h2">Seats</T>
          <T variant="bodyBold">{money(g.price_per_seat)} <T variant="caption">/ seat</T></T>
        </Row>
        <SeatsBar g={g} />
        <Row style={{ justifyContent: "space-between", marginTop: space.md }}>
          <T variant="caption">You earn (paid seats)</T>
          <T variant="bodyBold" color={palette.success}>{money(g.earnings)}</T>
        </Row>
        {g.state === "open" && !g.will_run ? (
          <T variant="caption" style={{ marginTop: space.sm }}>
            {t("If fewer than {n} seats are paid by {time}, it's cancelled and everyone is refunded.", {
              n: g.min_seats, time: `${dateRange(g.decide_at.slice(0, 10), g.decide_at.slice(0, 10))}`,
            })}
          </T>
        ) : null}
      </Card>

      {paid.length ? (
        <Card style={{ marginTop: space.md }}>
          <Row style={{ justifyContent: "space-between", marginBottom: space.sm }}>
            <T variant="h2">Travelers</T>
            <T variant="caption">{t("{n} of {total} checked in", { n: checkedIn, total: paid.length })}</T>
          </Row>
          {paid.map((x, i) => (
            <View key={x.booking_id} style={[{ paddingVertical: space.md }, i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }]}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <T variant="bodyBold">{x.name}</T>
                  <T variant="caption">
                    {x.guests} {x.guests > 1 ? t("seats") : t("seat")}{x.guest_names.length > 1 ? ` · ${x.guest_names.slice(1).join(", ")}` : ""}
                  </T>
                </View>
                <StatusBadge status={x.status} />
              </Row>
              <Row gap={8} style={{ marginTop: space.sm }}>
                {x.status === "confirmed" ? (
                  <Button title={x.can_start ? "Check in with PIN" : `Starts ${dateRange(g.start_date, g.start_date)}`} icon="key" small
                    disabled={!x.can_start} onPress={() => setStep({ traveler: x, action: "start" })} />
                ) : null}
                {x.status === "in_progress" && x.can_complete ? (
                  <Button title="Finish with end PIN" icon="flag" small onPress={() => setStep({ traveler: x, action: "complete" })} />
                ) : null}
                {x.status === "in_progress" ? (
                  <Button title="Trip console" icon="navigate" small kind="secondary" onPress={() => router.push(`/trip/${x.booking_id}`)} />
                ) : null}
                <Button title="Details" small kind="ghost" onPress={() => router.push(`/booking/${x.booking_id}`)} />
              </Row>
            </View>
          ))}
        </Card>
      ) : live ? (
        <Card style={{ marginTop: space.md, alignItems: "center", paddingVertical: space.xl }}>
          <Ionicons name="people-outline" size={28} color={palette.muted} />
          <T variant="bodyBold" style={{ marginTop: space.sm }}>No one has paid yet</T>
          <T variant="caption" center>Travelers in {g.city_name} see this trip on their home screen and your profile.</T>
        </Card>
      ) : null}

      {waiting.length ? (
        <Card style={{ marginTop: space.md }}>
          <T variant="h2" style={{ marginBottom: space.sm }}>Paying now</T>
          {waiting.map((x) => (
            <Row key={x.booking_id} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
              <T>{x.name} · {x.guests} {x.guests > 1 ? t("seats") : t("seat")}</T>
              <Badge label="Seats held" bg={palette.marigoldSoft} fg={palette.warning} />
            </Row>
          ))}
        </Card>
      ) : null}

      {gone.length ? (
        <T variant="caption" style={{ marginTop: space.md }}>
          {t("{n} cancelled", { n: gone.length })}: {gone.map((x) => x.name).join(", ")}
        </T>
      ) : null}

      {g.state === "open" || g.state === "full" ? (
        <Button title="Cancel this group trip" kind="ghost" onPress={() => setCancelOpen(true)} style={{ marginTop: space.xl }} />
      ) : null}

      <Sheet visible={!!step} onClose={() => { setStep(null); setPin(""); }} title={step?.action === "start" ? "Check in with trip PIN" : "Finish with end PIN"}>
        <T style={{ marginBottom: space.lg }}>
          {step?.action === "start"
            ? t("Ask {name} for the 4-digit trip PIN in their app. This confirms you've met.", { name: step?.traveler.name.split(" ")[0] ?? "" })
            : t("Ask {name} for the 4-digit end PIN in their app, only once their trip is over.", { name: step?.traveler.name.split(" ")[0] ?? "" })}
        </T>
        <PinInput value={pin} onChange={setPin} />
        <Button title={step?.action === "start" ? "Check in" : "Complete trip"} disabled={pin.length !== 4} loading={act.isPending}
          onPress={() => step && act.mutate({ booking: step.traveler.booking_id, action: step.action, pin })} style={{ marginTop: space.lg }} />
      </Sheet>

      <ConfirmSheet visible={cancelOpen} title="Cancel the whole group trip?"
        body={`Everyone who paid (${paid.length}) gets a full refund. Cancelling often can put your account on hold.`}
        confirm="Cancel group trip" danger loading={cancel.isPending} onConfirm={() => cancel.mutate()} onClose={() => setCancelOpen(false)}>
        <Field placeholder="Why? Travelers will see this" value={reason} onChangeText={setReason} maxLength={300} />
      </ConfirmSheet>
    </Screen>
  );
}
