import { api, Avatar, Button, Card, ErrorView, Itinerary, ItineraryDocument, Loading, PosterCard, Row, Screen, Segmented, shareText, space, T } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Linking, View } from "react-native";

export default function ItineraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<"document" | "poster">("document");
  const q = useQuery({ queryKey: ["itinerary", id], queryFn: () => api.get<Itinerary>(`/itineraries/${id}/`) });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Screen title="Itinerary"><ErrorView error={q.error} onRetry={q.refetch} /></Screen>;
  const it = q.data;
  const custom = it.kind === "custom";

  return (
    <Screen
      title={it.title}
      subtitle={custom ? "Your itinerary" : "Sample itinerary"}
      footer={
        custom ? undefined : (
          <Button title={`Plan this with ${it.captain.name.split(" ")[0]}`} icon="calendar" onPress={() => router.push(`/captain/${it.captain.id}`)} />
        )
      }
    >
      <Card style={{ flexDirection: "row", gap: space.md, alignItems: "center", marginBottom: space.md }} onPress={() => router.push(`/captain/${it.captain.id}`)}>
        <Avatar uri={it.captain.avatar} name={it.captain.name} size={44} verified />
        <View style={{ flex: 1 }}>
          <T variant="bodyBold">{it.captain.name}</T>
          <T variant="caption">{it.captain.captain_type === "guide" ? "Local guide" : "Captain"} · {it.captain.code}</T>
        </View>
      </Card>
      {!custom ? (
        <T variant="caption" style={{ marginBottom: space.md }}>A sample plan. After you book, your Captain tailors it to your dates, comfort level and requests.</T>
      ) : null}
      <Segmented options={[{ value: "document", label: "Full itinerary" }, { value: "poster", label: "At a glance" }]} value={tab} onChange={setTab} />
      {it.share_url ? (
        <Row gap={8} style={{ marginVertical: space.md }}>
          <Button title="PDF / print" icon="print-outline" small kind="secondary" onPress={() => Linking.openURL(tab === "poster" ? it.poster_url! : it.share_url!)} />
          {custom ? <Button title="Share with family" icon="share-social-outline" small kind="secondary" onPress={() => shareText(`My GoLoc itinerary: ${it.share_url}`)} /> : null}
        </Row>
      ) : null}
      {tab === "poster" ? <PosterCard poster={it.poster} it={it} /> : <ItineraryDocument it={it} content={it.content} />}
    </Screen>
  );
}
