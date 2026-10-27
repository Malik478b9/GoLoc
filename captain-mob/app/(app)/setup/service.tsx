import { Ionicons } from "@expo/vector-icons";
import {
  AIField, api, ApiError, assetPart, Banner, Button, Card, Chip, COMPATIBLE, ConfirmSheet, Field, Loading, palette, radius, Row, Screen, Service, space, Stepper, T, titleCase, toast, toastError, Toggle,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useOptions, useRefreshBusiness } from "../../../lib/data";

const TIERS = ["normal", "medium", "lavish"] as const;
const num = (v: string) => v.replace(/\D/g, "");
const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

export default function ServiceEditor() {
  const { id, kind: kindParam } = useLocalSearchParams<{ id?: string; kind?: "experience" | "guide" | "package" }>();
  const qc = useQueryClient();
  const refresh = useRefreshBusiness();
  const options = useOptions();
  const existing = useQuery({ queryKey: ["my-service", id], queryFn: () => api.get<Service>(`/captain/services/${id}/`), enabled: !!id });
  const kind = existing.data?.kind ?? kindParam ?? "experience";
  const pkg = kind === "package";
  const guide = kind === "guide";

  const [f, setF] = useState({
    title: "", description: "", category: "", price: "", included_guests: 2, extra_guest_price: "", duration_hours: 4, start_time: "09:00",
    max_guests: 4, stops: "", duration_days: 4, normal_price: "", medium_price: "", lavish_price: "", itinerary: "",
    inc_normal: "", inc_medium: "", inc_lavish: "", is_active: true,
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const s = existing.data;
    if (!s) return;
    setF({
      title: s.title, description: s.description, category: s.category, price: String(s.price || ""), included_guests: s.included_guests,
      extra_guest_price: String(s.extra_guest_price || ""), duration_hours: s.duration_hours, start_time: s.start_time.slice(0, 5),
      max_guests: s.max_guests, stops: s.stops.join("\n"), duration_days: s.duration_days, normal_price: String(s.normal_price || ""),
      medium_price: String(s.medium_price || ""), lavish_price: String(s.lavish_price || ""), itinerary: s.itinerary.join("\n"),
      inc_normal: (s.tier_inclusions.normal ?? []).join("\n"), inc_medium: (s.tier_inclusions.medium ?? []).join("\n"),
      inc_lavish: (s.tier_inclusions.lavish ?? []).join("\n"), is_active: s.is_active ?? true,
    });
  }, [existing.data]);

  const payload = () => ({
    kind, title: f.title.trim(), description: f.description.trim(), category: f.category, max_guests: f.max_guests, is_active: f.is_active,
    ...(pkg
      ? {
          duration_days: f.duration_days, normal_price: Number(f.normal_price) || 0, medium_price: Number(f.medium_price) || 0,
          lavish_price: Number(f.lavish_price) || 0, itinerary: lines(f.itinerary),
          tier_inclusions: { normal: lines(f.inc_normal), medium: lines(f.inc_medium), lavish: lines(f.inc_lavish) },
        }
      : {
          price: Number(f.price) || 0, included_guests: f.included_guests, extra_guest_price: Number(f.extra_guest_price) || 0,
          duration_hours: f.duration_hours, start_time: f.start_time, stops: lines(f.stops),
        }),
  });

  const save = useMutation({
    mutationFn: () => (id ? api.patch<Service>(`/captain/services/${id}/`, payload()) : api.post<Service>("/captain/services/", payload())),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-services"] });
      qc.invalidateQueries({ queryKey: ["my-service", id] });
      refresh();
      toast("Service saved", "success");
      router.back();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/captain/services/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-services"] });
      refresh();
      router.back();
    },
    onError: toastError,
  });

  const pickCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 9], quality: 0.8, ...COMPATIBLE });
    if (res.canceled || !id) return;
    const a = res.assets[0];
    const form = new FormData();
    form.append("image", await assetPart(a.uri, "cover.jpg"));
    try {
      await api.upload(`/captain/services/${id}/cover/`, form);
      qc.invalidateQueries({ queryKey: ["my-service", id] });
      toast("Cover updated", "success");
    } catch (e) {
      toastError(e);
    }
  };

  if (id && existing.isLoading) return <Loading />;
  const err = save.error as ApiError | null;
  const fe = (k: string) => err?.field(k);

  return (
    <Screen
      title={id ? "Edit service" : pkg ? "New package" : guide ? "New guide day" : "New day experience"}
      footer={<Button title="Save" loading={save.isPending} disabled={!f.title.trim() || !f.category} onPress={() => save.mutate()} />}
    >
      {id ? (
        <Pressable onPress={pickCover} style={{ height: 150, borderRadius: radius.lg, overflow: "hidden", backgroundColor: palette.sand2, marginBottom: space.lg, alignItems: "center", justifyContent: "center" }}>
          {existing.data?.cover_image ? <Image source={{ uri: existing.data.cover_image }} style={{ position: "absolute", inset: 0 } as any} contentFit="cover" /> : null}
          <Row gap={6} style={{ backgroundColor: "#00000055", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}>
            <Ionicons name="image" size={16} color="#fff" />
            <T variant="small" color="#fff">{existing.data?.cover_image ? "Change cover" : "Add cover photo"}</T>
          </Row>
        </Pressable>
      ) : null}

      <AIField purpose="service_title" context={{ kind, category: f.category, description: f.description }} label="Title" value={f.title} onChangeText={(v) => set({ title: v })} maxLength={120} placeholder={pkg ? "e.g. Leh · Ladakh Explorer" : guide ? "e.g. Explore Hyderabad with a local" : "e.g. Old City Food Trail"} error={fe("title")} />
      <T variant="small" style={{ marginBottom: 8, fontWeight: "700" }}>Category</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.lg }}>
        {(options.data?.categories ?? []).map((c) => <Chip key={c} label={titleCase(c)} active={f.category === c} onPress={() => set({ category: c })} />)}
      </View>
      <AIField purpose="service_description" context={{ kind, title: f.title, category: f.category, stops: f.stops, days: pkg ? f.duration_days : undefined, hours: f.duration_hours }} label="Description" value={f.description} onChangeText={(v) => set({ description: v })} multiline maxLength={2000} placeholder="What travelers will experience" />
      <Card style={{ marginBottom: space.md }}><Stepper label="Max guests" value={f.max_guests} onChange={(v) => set({ max_guests: v })} max={20} /></Card>

      {pkg ? (
        <>
          <Card style={{ marginBottom: space.md }}><Stepper label="Days" value={f.duration_days} onChange={(v) => set({ duration_days: v })} min={2} max={30} /></Card>
          <T variant="h2" style={{ marginTop: space.sm }}>Per-person price by tier</T>
          <T variant="caption" style={{ marginBottom: space.md }}>Must rise from Normal to Medium to Lavish. GoLoc keeps ~18%; you arrange everything included.</T>
          {TIERS.map((t) => (
            <View key={t}>
              <Field label={`${titleCase(t)} price`} prefix="₹" keyboardType="number-pad" value={f[`${t}_price`]} onChangeText={(v) => set({ [`${t}_price`]: num(v) } as any)} error={fe(`${t}_price`)} />
              <AIField purpose="tier_inclusions" context={{ title: f.title, tier: t, days: f.duration_days, description: f.description }} label={`${titleCase(t)} includes (one per line)`} multiline value={f[`inc_${t}`]} onChangeText={(v) => set({ [`inc_${t}`]: v } as any)}
                placeholder={t === "normal" ? "Guesthouse stay\nLocal meals (2/day)\nShared cab" : t === "medium" ? "3★ hotel\nHotel + local food\nPrivate cab" : "4–5★ boutique stay\nFine dining\nPrivate SUV"} />
            </View>
          ))}
          <AIField purpose="service_itinerary" context={{ title: f.title, days: f.duration_days, description: f.description }} label="Itinerary (one line per day)" multiline value={f.itinerary} onChangeText={(v) => set({ itinerary: v })} placeholder={"Arrive · check-in · easy walk\nMonastery day\nLake day"} />
        </>
      ) : (
        <>
          {guide ? (
            <T variant="caption" style={{ marginBottom: space.md }}>
              Travelers pick their arrival and return dates and pay this price for every day. You meet them each day and guide them in person; they arrange their own stay and transport.
            </T>
          ) : null}
          <Field label={guide ? "Price per day for the group" : "Price for the group"} prefix="₹" keyboardType="number-pad" value={f.price} onChangeText={(v) => set({ price: num(v) })} error={fe("price")} />
          <Card style={{ marginBottom: space.md, gap: space.md }}>
            <Stepper label="Guests included" value={f.included_guests} onChange={(v) => set({ included_guests: v })} max={f.max_guests} />
            <Stepper label={guide ? "Hours with travelers each day" : "Duration (hours)"} value={f.duration_hours} onChange={(v) => set({ duration_hours: v })} max={14} />
          </Card>
          <Field label={guide ? "Extra guest price per day" : "Extra guest price"} prefix="₹" keyboardType="number-pad" value={f.extra_guest_price} onChangeText={(v) => set({ extra_guest_price: num(v) })} />
          <Field label="Usual start time (24h)" value={f.start_time} onChangeText={(v) => set({ start_time: v.replace(/[^\d:]/g, "").slice(0, 5) })} placeholder="09:00" keyboardType="numbers-and-punctuation" error={fe("start_time")} />
          <AIField purpose="service_stops" context={{ title: f.title, kind, category: f.category, description: f.description }} label={guide ? "Places you usually cover (one per line)" : "Stops (one per line)"} multiline value={f.stops} onChangeText={(v) => set({ stops: v })} placeholder={"Charminar\nLaad Bazaar\nPista House"} />
        </>
      )}

      {id ? <Toggle label="Accepting bookings" hint="Pause instead of deleting to keep reviews and history." value={f.is_active} onChange={(v) => set({ is_active: v })} /> : null}
      {err && !err.fields ? <Banner tone="danger" title={err.message} /> : null}
      {fe("kind") ? <Banner tone="danger" title={fe("kind")!} /> : null}
      {err?.fields && Object.keys(err.fields).some((k) => !["title", "kind", "price", "normal_price", "medium_price", "lavish_price", "start_time"].includes(k)) ? (
        <Banner tone="danger" title={err.message} />
      ) : null}
      {id ? <Button title="Delete service" kind="ghost" onPress={() => setConfirmDelete(true)} style={{ marginTop: space.lg }} /> : null}
      <ConfirmSheet visible={confirmDelete} title="Delete this service?" body="If it has bookings it's paused instead, so history stays intact." confirm="Delete" danger loading={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setConfirmDelete(false)} />
    </Screen>
  );
}
