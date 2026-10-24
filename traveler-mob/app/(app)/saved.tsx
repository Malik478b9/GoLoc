import { api, CaptainCard, Empty, ErrorView, Screen, SkeletonList, space } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { View } from "react-native";

import { CaptainRow } from "../../lib/cards";

export default function Saved() {
  const q = useQuery({ queryKey: ["saved"], queryFn: () => api.get<CaptainCard[]>("/captains/saved/") });
  return (
    <Screen title="Saved Captains" onRefresh={q.refetch}>
      {q.isLoading ? <SkeletonList /> : q.error ? <ErrorView error={q.error} onRetry={q.refetch} /> : (q.data ?? []).length === 0 ? (
        <Empty icon="heart-outline" title="No saved Captains" body="Tap the heart on a Captain's profile to keep them here." action="Find Captains" onAction={() => router.push("/explore")} />
      ) : (
        <View style={{ gap: space.md }}>{q.data!.map((c) => <CaptainRow key={c.id} c={c} />)}</View>
      )}
    </Screen>
  );
}
