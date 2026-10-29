import { api, ApiError, Badge, Button, Card, Chip, Empty, Field, Loading, Row, Screen, Sheet, space, Stepper, T, toast, toastError, Toggle } from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { View } from "react-native";

import { useOptions, useProfile, useRefreshBusiness } from "../../../lib/data";

type Vehicle = { id: string; kind: string; make_model: string; registration_number: string; capacity: number; has_ac: boolean; is_active: boolean; agency_owned: boolean };

export default function Vehicles() {
  const qc = useQueryClient();
  const refresh = useRefreshBusiness();
  const options = useOptions();
  const agency = useProfile().data?.agency;
  const q = useQuery({ queryKey: ["vehicles"], queryFn: () => api.get<Vehicle[]>("/captain/vehicles/") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: "car", make_model: "", registration_number: "", capacity: 4, has_ac: true });
  const add = useMutation({
    mutationFn: () => api.post<Vehicle>("/captain/vehicles/", form),
    onSuccess: () => {
      setOpen(false);
      setForm({ kind: "car", make_model: "", registration_number: "", capacity: 4, has_ac: true });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      refresh();
      toast("Vehicle added — upload your licence and RC under Documents", "success");
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/captain/vehicles/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      refresh();
    },
    onError: toastError,
  });
  const err = add.error as ApiError | null;
  if (q.isLoading) return <Loading />;

  return (
    <Screen title="Vehicles" footer={agency ? undefined : <Button title="Add vehicle" icon="add" onPress={() => setOpen(true)} />}>
      <T variant="caption" style={{ marginBottom: space.md }}>
        {agency
          ? `${agency.name} gives you a car. Upload your driving licence under Documents; the agency handles the car's papers.`
          : "Guiding on foot? You don't need a vehicle. If you drive guests, add it here — we'll ask for your licence and RC."}
      </T>
      {(q.data ?? []).length === 0 ? (
        <Empty icon="car-outline" title="No vehicles" />
      ) : (
        <View style={{ gap: space.md }}>
          {q.data!.map((v) => (
            <Card key={v.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <T variant="h2">{v.make_model}</T>
                <Badge label={v.registration_number} />
              </Row>
              <T variant="caption">{options.data?.vehicle_kinds.find((k) => k.value === v.kind)?.label ?? v.kind} · {v.capacity} seats{v.has_ac ? " · AC" : ""}{v.agency_owned ? " · agency car" : ""}</T>
              {v.agency_owned ? null : <Button title="Remove" kind="ghost" small onPress={() => remove.mutate(v.id)} style={{ alignSelf: "flex-start", marginTop: space.sm }} />}
            </Card>
          ))}
        </View>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Add a vehicle">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.lg }}>
          {(options.data?.vehicle_kinds ?? []).map((k) => <Chip key={k.value} label={k.label} active={form.kind === k.value} onPress={() => setForm({ ...form, kind: k.value })} />)}
        </View>
        <Field label="Make & model" placeholder="e.g. Maruti Dzire" value={form.make_model} onChangeText={(v) => setForm({ ...form, make_model: v })} error={err?.field("make_model")} />
        <Field label="Registration number" placeholder="TS09AB4821" autoCapitalize="characters" value={form.registration_number} onChangeText={(v) => setForm({ ...form, registration_number: v })} error={err?.field("registration_number")} />
        <Stepper label="Seats for guests" value={form.capacity} onChange={(v) => setForm({ ...form, capacity: v })} max={30} />
        <Toggle label="Air-conditioned" value={form.has_ac} onChange={(v) => setForm({ ...form, has_ac: v })} />
        <Button title="Add" loading={add.isPending} disabled={!form.make_model.trim() || !form.registration_number.trim()} onPress={() => add.mutate()} style={{ marginTop: space.md }} />
      </Sheet>
    </Screen>
  );
}
