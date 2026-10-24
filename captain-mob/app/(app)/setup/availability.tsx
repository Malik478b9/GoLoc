import { Ionicons } from "@expo/vector-icons";
import { api, Button, Calendar, Card, Field, Loading, longDate, palette, Row, Screen, Section, Sheet, space, Stepper, T, toast, toastError } from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Pressable, Switch, View } from "react-native";

import { useRefreshBusiness } from "../../../lib/data";

type Slot = { weekday: number; is_available: boolean; start_time: string; end_time: string };
type Availability = { weekly: Slot[]; blocked: { id: number; date: string; reason: string }[]; max_bookings_per_day: number };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 5 AM – 10 PM

const hh = (t: string) => Number(t.slice(0, 2));
const fmt = (h: number) => `${((h + 11) % 12) + 1} ${h >= 12 ? "PM" : "AM"}`;

function HourPicker({ value, onChange, min = 0 }: { value: number; onChange: (h: number) => void; min?: number }) {
  return (
    <Row gap={10}>
      <Pressable hitSlop={8} onPress={() => onChange(Math.max(min, value - 1))}><Ionicons name="remove-circle-outline" size={24} color={palette.ember} /></Pressable>
      <T variant="bodyBold" style={{ minWidth: 52, textAlign: "center" }}>{fmt(value)}</T>
      <Pressable hitSlop={8} onPress={() => onChange(Math.min(23, value + 1))}><Ionicons name="add-circle-outline" size={24} color={palette.ember} /></Pressable>
    </Row>
  );
}

export default function AvailabilityScreen() {
  const qc = useQueryClient();
  const refresh = useRefreshBusiness();
  const q = useQuery({ queryKey: ["availability"], queryFn: () => api.get<Availability>("/captain/availability/") });
  const [weekly, setWeekly] = useState<Slot[]>([]);
  const [capacity, setCapacity] = useState(1);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockDate, setBlockDate] = useState<string | undefined>();
  const [blockReason, setBlockReason] = useState("");

  useEffect(() => {
    if (q.data) {
      setWeekly(q.data.weekly);
      setCapacity(q.data.max_bookings_per_day);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.put<Availability>("/captain/availability/", { weekly, max_bookings_per_day: capacity }),
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
  const update = (weekday: number, patch: Partial<Slot>) => setWeekly((w) => w.map((s) => (s.weekday === weekday ? { ...s, ...patch } : s)));

  if (q.isLoading) return <Loading />;
  return (
    <Screen title="Availability" footer={<Button title="Save weekly schedule" loading={save.isPending} onPress={() => save.mutate()} />}>
      <Card style={{ gap: 4 }}>
        {weekly.map((s) => (
          <View key={s.weekday} style={{ paddingVertical: 8, borderBottomWidth: s.weekday < 6 ? 0.5 : 0, borderBottomColor: palette.line }}>
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="bodyBold">{DAYS[s.weekday]}</T>
              <Switch value={s.is_available} onValueChange={(v) => update(s.weekday, { is_available: v })} trackColor={{ true: palette.ember, false: palette.lineStrong }} thumbColor={palette.white} />
            </Row>
            {s.is_available ? (
              <Row style={{ justifyContent: "space-between", marginTop: 6 }}>
                <HourPicker value={hh(s.start_time)} onChange={(h) => update(s.weekday, { start_time: `${String(h).padStart(2, "0")}:00` })} min={HOURS[0]} />
                <T variant="caption">to</T>
                <HourPicker value={hh(s.end_time)} onChange={(h) => update(s.weekday, { end_time: `${String(h).padStart(2, "0")}:00` })} min={hh(s.start_time) + 1} />
              </Row>
            ) : (
              <T variant="caption">Day off</T>
            )}
          </View>
        ))}
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
