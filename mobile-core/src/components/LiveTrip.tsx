import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "../api/client";
import type { EmergencyService, LiveTrip } from "../api/types";
import { time12, timeAgo } from "../format";
import { currentPosition, useLocationBroadcast } from "../hooks";
import { palette, radius, space } from "../theme";
import { ConfirmSheet, toast, toastError } from "../ui/feedback";
import { Field } from "../ui/inputs";
import { ErrorView, Header, Loading } from "../ui/layout";
import { Badge, Button, Card, Row, T, useAccent } from "../ui/primitives";
import { MapView, MapMarker } from "./MapView";

export function EmergencyList({ items }: { items: EmergencyService[] }) {
  return (
    <View style={{ gap: 8 }}>
      {items.map((s) => (
        <Pressable key={`${s.name}${s.phone}`} onPress={() => Linking.openURL(`tel:${s.phone}`)} style={({ pressed }) => [styles.emergency, pressed && { opacity: 0.7 }]}>
          <View style={[styles.emIcon, { backgroundColor: s.kind === "police" ? palette.infoSoft : s.kind === "emergency" ? palette.coralSoft : palette.warningSoft }]}>
            <Ionicons
              name={s.kind === "police" ? "shield" : s.kind === "hospital" ? "medkit" : s.kind === "ambulance" ? "pulse" : s.kind === "emergency" ? "alert-circle" : "call"}
              size={18}
              color={s.kind === "police" ? palette.info : s.kind === "emergency" ? palette.coral : palette.warning}
            />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="bodyBold">{s.name}</T>
            <T variant="caption">{s.distance_km != null ? `${s.distance_km} km · ` : ""}{s.address || (s.national ? "Nationwide" : "")}</T>
          </View>
          <Row gap={4}>
            <Ionicons name="call" size={16} color={palette.rickshaw} />
            <T variant="bodyBold" color={palette.rickshaw}>{s.phone}</T>
          </Row>
        </Pressable>
      ))}
    </View>
  );
}

/** SOS button + confirmation. Shared by both apps; the server enforces pay-to-protect. */
export function SOSButton({ bookingRef, compact }: { bookingRef: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code: string; message: string; emergency: EmergencyService[] } | null>(null);

  const raise = async () => {
    setBusy(true);
    try {
      const pos = await currentPosition();
      const res = await api.post<{ code: string; message: string; emergency: EmergencyService[] }>(`/trips/${bookingRef}/sos/`, { ...(pos ?? {}), message });
      setResult(res);
      toast(`SOS ${res.code} sent — safety team alerted`, "success");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button title={compact ? "SOS" : "Emergency SOS"} icon="warning" kind="danger" onPress={() => setOpen(true)} small={compact} />
      <ConfirmSheet
        visible={open && !result}
        title="Send SOS?"
        body="GoLoc's safety team gets your live location and will call you right away. Your trip partner is alerted too."
        confirm="Send SOS now"
        danger
        loading={busy}
        onConfirm={raise}
        onClose={() => setOpen(false)}
      >
        <Field placeholder="What's happening? (optional)" value={message} onChangeText={setMessage} maxLength={300} />
        <Button title="Call 112 instead" kind="secondary" icon="call" onPress={() => Linking.openURL("tel:112")} style={{ marginBottom: space.md }} />
      </ConfirmSheet>
      <ConfirmSheet
        visible={!!result}
        title={`SOS ${result?.code ?? ""} sent`}
        body={result?.message}
        confirm="OK"
        onConfirm={() => {
          setResult(null);
          setOpen(false);
        }}
        onClose={() => {
          setResult(null);
          setOpen(false);
        }}
      >
        <ScrollView style={{ maxHeight: 280, marginBottom: space.md }}>
          <EmergencyList items={result?.emergency ?? []} />
        </ScrollView>
      </ConfirmSheet>
    </>
  );
}

/**
 * Live trip screen for both apps: map with both parties, stops, emergency
 * numbers, SOS. `broadcast` shares this phone's location while open.
 */
export function LiveTripView({ bookingRef, role, actions }: { bookingRef: string; role: "traveler" | "captain"; actions?: React.ReactNode }) {
  const accent = useAccent();
  const q = useQuery({ queryKey: ["live", bookingRef], queryFn: () => api.get<LiveTrip>(`/trips/${bookingRef}/live/`), refetchInterval: 5000 });
  const sharing = q.data?.status === "in_progress" || q.data?.status === "confirmed";
  const { permission, last } = useLocationBroadcast(bookingRef, !!sharing);

  if (q.isLoading) return <Loading label="Connecting to your trip…" />;
  if (q.error) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }}>
      <Header title="Live trip" />
      <ErrorView error={q.error} onRetry={q.refetch} />
    </SafeAreaView>
  );
  const d = q.data!;
  const me = last ? { lat: last.coords.latitude, lng: last.coords.longitude } : role === "captain" ? d.captain_location : d.traveler_location;
  const other = role === "captain" ? d.traveler_location : d.captain_location;
  const markers: MapMarker[] = [];
  if (role === "captain") {
    if (me) markers.push({ id: "captain", ...me, label: "You", color: accent.main });
    if (other) markers.push({ id: "traveler", lat: other.lat, lng: other.lng, label: "T", color: palette.ink });
  } else {
    if (other) markers.push({ id: "captain", lat: other.lat, lng: other.lng, label: "C", color: palette.ember });
    if (me) markers.push({ id: "traveler", ...me, label: "You", color: accent.main });
  }
  const otherAt = (role === "captain" ? d.traveler_location : d.captain_location)?.at;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <Header title={d.title} subtitle={`${d.code} · ${d.status === "in_progress" ? "In progress" : `Starts ${time12(d.start_time)}`}`} right={<SOSButton bookingRef={bookingRef} compact />} />
      <MapView markers={markers} style={{ height: 300 }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 48 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Badge label={d.status === "in_progress" ? "LIVE" : "TRIP DAY"} bg={palette.successSoft} fg={palette.success} icon="radio" />
          <T variant="caption">
            {otherAt ? `${role === "captain" ? "Traveler" : "Captain"} seen ${timeAgo(otherAt)}` : `${role === "captain" ? "Traveler" : "Captain"} location not shared yet`}
          </T>
        </Row>
        {permission === "denied" ? (
          <Card style={{ backgroundColor: palette.warningSoft }}>
            <T variant="bodyBold" color={palette.warning}>Location is off</T>
            <T variant="small">Turn on location for GoLoc so your {role === "captain" ? "traveler" : "Captain"} and our safety team can see you.</T>
            <Button title="Open settings" small kind="secondary" onPress={() => Linking.openSettings()} style={{ marginTop: space.sm, alignSelf: "flex-start" }} />
          </Card>
        ) : null}
        {actions}
        {d.meeting_point ? (
          <Card>
            <T variant="label">Meeting point</T>
            <T variant="bodyBold" style={{ marginTop: 4 }}>{d.meeting_point}</T>
          </Card>
        ) : null}
        {(d.stops.length || d.itinerary.length) ? (
          <Card>
            <T variant="label" style={{ marginBottom: space.sm }}>{d.stops.length ? "Stops" : "Itinerary"}</T>
            {(d.stops.length ? d.stops : d.itinerary).map((s, i) => (
              <Row key={i} style={{ paddingVertical: 6 }} gap={12}>
                <View style={[styles.stopDot, { backgroundColor: accent.soft }]}><T variant="small" color={accent.main}>{i + 1}</T></View>
                <T style={{ flex: 1 }}>{s}</T>
              </Row>
            ))}
          </Card>
        ) : null}
        <T variant="h2" style={{ marginTop: space.sm }}>Nearby help</T>
        <EmergencyList items={d.emergency} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  emergency: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.paper, padding: space.md, borderRadius: radius.md },
  emIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  stopDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
