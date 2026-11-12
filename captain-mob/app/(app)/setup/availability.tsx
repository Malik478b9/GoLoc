import { Ionicons } from "@expo/vector-icons";
import { api, Button, Calendar, Card, Field, Loading, longDate, palette, Row, Screen, Section, Sheet, space, Stepper, T, toast, toastError } from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useRefreshBusiness } from "../../../lib/data";

type Availability = { blocked: { id: number; date: string; reason: string }[]; max_bookings_per_day: number };

/**
 * Captains work every day, weekends included (that's when most people travel).
 * The only controls: how many trips a day, and the dates you're not available.
 * Going offline (home screen switch) stops all new bookings.
 */
export default function AvailabilityScreen() {
  const qc = useQueryClient();
  const refresh = useRefreshBusiness();
  const q = useQuery({ queryKey: ["availability"], queryFn: () => api.get<Availability>("/captain/availability/") });
  const [capacity, setCapacity] = useState(1);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockDate, setBlockDate] = useState<string | undefined>();
  const [blockReason, setBlockReason] = useState("");

  useEffect(() => {
    if (q.data) setCapacity(q.data.max_bookings_per_day);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.put<Availability>("/captain/availability/", { max_bookings_per_day: capacity }),
    onSuccess: (d) => {
      qc.setQueryData(["availability"], d);
      refresh();
      toast("Availability saved", "success");
    },
    onError: toastError,
  });
  const block = useMutation({
    mutationFn: () => api.post("/captain/availability/blocked/", { date: blockDate, reason: blockReason }),
    onSuccess: () => {
      setBlockOpen(false);
      setBlockDate(undefined);
      setBlockReason("");
      qc.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: toastError,
  });
  const unblock = useMutation({
    mutationFn: (id: number) => api.del(`/captain/availability/blocked/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });

  if (q.isLoading) return <Loading />;
  return (
    <Screen title="Availability" footer={<Button title="Save trips per day" loading={save.isPending} onPress={() => save.mutate()} />}>
      <Card style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
        <Ionicons name="calendar" size={22} color={palette.ember} />
        <View style={{ flex: 1 }}>
          <T variant="bodyBold">You're open every day, weekends too</T>
          <T variant="caption">Most trips happen on weekends and holidays. Block the dates you can't work below, or go offline from your home screen to pause all bookings.</T>
        </View>
      </Card>

      <Card style={{ marginTop: space.md }}>
        <Stepper label="Trips per day" value={capacity} onChange={setCapacity} max={10} />
        <T variant="caption" style={{ marginTop: 6 }}>How many separate bookings you can host on one day (e.g. a morning and an evening walk = 2).</T>
      </Card>

      <Section title="Days off" action="Add" onAction={() => setBlockOpen(true)}>
        {(q.data?.blocked ?? []).length === 0 ? (
          <T variant="caption">No upcoming days off. Block dates for holidays or personal time.</T>
        ) : (
          <View style={{ gap: 8 }}>
            {q.data!.blocked.map((b) => (
              <Row key={b.id} style={{ justifyContent: "space-between", backgroundColor: palette.paper, padding: space.md, borderRadius: 12 }}>
                <View>
                  <T variant="bodyBold">{longDate(b.date)}</T>
                  {b.reason ? <T variant="caption">{b.reason}</T> : null}
                </View>
                <Pressable hitSlop={10} onPress={() => unblock.mutate(b.id)}><Ionicons name="trash-outline" size={20} color={palette.coral} /></Pressable>
              </Row>
            ))}
          </View>
        )}
      </Section>

      <Sheet visible={blockOpen} onClose={() => setBlockOpen(false)} title="Block a date">
        <Calendar value={blockDate} onChange={setBlockDate} disabled={(q.data?.blocked ?? []).map((b) => b.date)} />
        <View style={{ height: space.md }} />
        <Field placeholder="Reason (optional, only you see it)" value={blockReason} onChangeText={setBlockReason} maxLength={120} />
        <Button title="Block date" disabled={!blockDate} loading={block.isPending} onPress={() => block.mutate()} />
      </Sheet>
    </Screen>
  );
}
