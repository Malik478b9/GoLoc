import { api, Booking, Empty, ErrorView, Paginated, palette, Segmented, SkeletonList, space, T } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BookingRow } from "../../../lib/cards";

type Tab = "upcoming" | "active" | "past";

export default function Trips() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const q = useQuery({
    queryKey: ["bookings", tab],
    queryFn: () => api.get<Paginated<Booking>>("/bookings/", { filter: tab, page_size: 50 }),
    refetchInterval: tab === "active" ? 15000 : undefined,
  });
  const active = useQuery({ queryKey: ["bookings", "active"], queryFn: () => api.get<Paginated<Booking>>("/bookings/", { filter: "active" }) });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md }}>
        <T variant="title">My trips</T>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "active", label: "Live", count: active.data?.count },
            { value: "past", label: "Past" },
          ]}
        />
      </View>
      {q.isLoading ? (
        <View style={{ padding: space.lg }}><SkeletonList /></View>
      ) : q.error ? (
        <ErrorView error={q.error} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={q.data?.results ?? []}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => <BookingRow b={item} />}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          onRefresh={q.refetch}
          refreshing={q.isRefetching}
          ListEmptyComponent={
            tab === "upcoming" ? (
              <Empty icon="map-outline" title="No trips planned" body="Find a Captain or let us match one to your plan." action="Build my trip" onAction={() => router.push("/build-trip")} />
            ) : (
              <Empty icon="time-outline" title={tab === "active" ? "No trip in progress" : "No past trips yet"} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}
