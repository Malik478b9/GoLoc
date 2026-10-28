import { api, CaptainCard, Empty, ErrorView, Screen, Segmented, SkeletonList, space, TripPoster, useWide } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { useWindowDimensions, View } from "react-native";

import { CaptainRow } from "../../lib/cards";
import { useCity } from "../../lib/data";
import { PosterTile, useToggleSavedTrip } from "../../lib/discover";

export default function Saved() {
  const wide = useWide();
  const screenW = useWindowDimensions().width;
  const city = useCity();
  const [tab, setTab] = useState<"trips" | "captains">("trips");
  const captains = useQuery({ queryKey: ["saved"], queryFn: () => api.get<CaptainCard[]>("/captains/saved/") });
  const trips = useQuery({ queryKey: ["saved-trips", city?.slug], queryFn: () => api.get<TripPoster[]>("/discover/saved/", { city: city?.slug }) });
  const toggle = useToggleSavedTrip();
  const q = tab === "trips" ? trips : captains;

  return (
    <Screen title="Saved" onRefresh={q.refetch}>
      <Segmented
        options={[{ value: "trips", label: "Trips", count: trips.data?.length }, { value: "captains", label: "Captains", count: captains.data?.length }]}
        value={tab}
        onChange={setTab}
      />
      <View style={{ marginTop: space.lg }}>
        {q.isLoading ? (
          <SkeletonList />
        ) : q.error ? (
          <ErrorView error={q.error} onRetry={q.refetch} />
        ) : tab === "trips" ? (
          (trips.data ?? []).length === 0 ? (
            <Empty icon="heart-outline" title="No saved trips" body="Tap the heart on a trip poster on the home screen to plan it later." action="See trips" onAction={() => router.push("/")} />
          ) : (
            <View style={{ gap: space.md, flexDirection: "row", flexWrap: "wrap" }}>
              {trips.data!.map((p) => <PosterTile key={p.key} p={p} width={wide ? 260 : Math.min(screenW - space.lg * 2, 420)} onToggleSave={toggle} />)}
            </View>
          )
        ) : (captains.data ?? []).length === 0 ? (
          <Empty icon="heart-outline" title="No saved Captains" body="Tap the heart on a Captain's profile to keep them here." action="Find Captains" onAction={() => router.push("/explore")} />
        ) : (
          <View style={{ gap: space.md, flexDirection: wide ? "row" : "column", flexWrap: "wrap" }}>
            {captains.data!.map((c) => <View key={c.id} style={wide ? { width: "49%" } : undefined}><CaptainRow c={c} /></View>)}
          </View>
        )}
      </View>
    </Screen>
  );
}
