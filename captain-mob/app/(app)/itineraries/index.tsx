import { api, Badge, Button, Empty, ItinerarySummary, palette, PosterCard, Row, Screen, Segmented, SkeletonList, space, T } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, View } from "react-native";

import { STATUS_BADGE } from "../../../lib/itinerary";

export default function Itineraries() {
  const [kind, setKind] = useState<"template" | "custom">("template");
  const q = useQuery({
    queryKey: ["itineraries", kind],
    queryFn: () => api.get<ItinerarySummary[]>("/captain/itineraries/", { kind }),
    refetchInterval: (query) => ((query.state.data ?? []).some((i) => i.status === "generating") ? 4000 : false),
  });
  const rows = q.data ?? [];

  return (
    <Screen
      title="Itineraries"
      subtitle="AI drafts, you finish"
      onRefresh={q.refetch}
      footer={<Button title={kind === "template" ? "New default itinerary" : "New custom itinerary"} icon="sparkles" onPress={() => router.push({ pathname: "/itineraries/new", params: { kind } })} />}
    >
      <Segmented
        options={[{ value: "template", label: "Default (profile)" }, { value: "custom", label: "Custom (travelers)" }]}
        value={kind}
        onChange={setKind}
      />
      <T variant="caption" style={{ marginTop: space.sm, marginBottom: space.md }}>
        {kind === "template"
          ? "Your standard plan for each trip. Publish it and travelers see it on your profile before booking."
          : "Made for one traveler: their dates, comfort level and requests. Start one from any booking, or here."}
      </T>
      {q.isLoading ? (
        <SkeletonList rows={3} />
      ) : rows.length === 0 ? (
        <Empty
          icon="document-text-outline"
          title={kind === "template" ? "No default itineraries yet" : "No custom itineraries yet"}
          body="Tell the AI the trip, your hotels and must-see places. It writes the day-by-day plan and a poster."
        />
      ) : (
        <View style={{ gap: space.md }}>
          {rows.map((it) => {
            const badge = STATUS_BADGE[it.status];
            return (
              <Pressable key={it.id} onPress={() => router.push(`/itineraries/${it.id}`)}>
                <PosterCard poster={it.poster} it={it} compact />
                <Row style={{ justifyContent: "space-between", marginTop: 6, paddingHorizontal: 4 }}>
                  <T variant="caption">{it.code}{it.start_date ? ` · arrives ${it.start_date}` : ""}</T>
                  <Row gap={6}>
                    {it.is_published ? <Badge label={it.kind === "template" ? "On profile" : "Shared"} bg={palette.successSoft} fg={palette.success} /> : null}
                    <Badge label={badge.label} bg={badge.bg} fg={badge.fg} />
                  </Row>
                </Row>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
