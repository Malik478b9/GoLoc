import { api, Booking, dateRange, Empty, ErrorView, money, Paginated, palette, radius, Row, Segmented, SkeletonList, space, StatusBadge, T, time12, timeLeft } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Tab = "requests" | "upcoming" | "past";
const FILTER: Record<Tab, string> = { requests: "requests", upcoming: "upcoming", past: "past" };

export default function Bookings() {
  const [tab, setTab] = useState<Tab>("requests");
  const q = useQuery({
    queryKey: ["bookings", tab],
    queryFn: () => api.get<Paginated<Booking>>("/bookings/", { filter: FILTER[tab], page_size: 50 }),
    refetchInterval: tab === "requests" ? 20000 : undefined,
  });
  const requests = useQuery({ queryKey: ["bookings", "requests"], queryFn: () => api.get<Paginated<Booking>>("/bookings/", { filter: "requests", page_size: 50 }) });
  const rows = (q.data?.results ?? []).filter((b) => (tab === "upcoming" ? b.status !== "requested" : true));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md }}>
        <T variant="title">Bookings</T>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "requests", label: "Requests", count: requests.data?.count },
            { value: "upcoming", label: "Upcoming" },
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
          data={rows}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          onRefresh={q.refetch}
          refreshing={q.isRefetching}
          ListEmptyComponent={
            <Empty
              icon={tab === "requests" ? "mail-open-outline" : "calendar-outline"}
              title={tab === "requests" ? "No new requests" : tab === "upcoming" ? "Nothing scheduled" : "No past bookings"}
              body={tab === "requests" ? "Post reels and keep your availability current to get more requests." : undefined}
            />
          }
          renderItem={({ item: b }) => (
            <Pressable onPress={() => router.push(`/booking/${b.id}`)} style={({ pressed }) => [styles.card, b.status === "requested" && styles.request, pressed && { opacity: 0.85 }]}>
              <Row style={{ justifyContent: "space-between" }}>
                <T variant="label">{b.code}</T>
                <StatusBadge status={b.status} />
              </Row>
              <T variant="h2" numberOfLines={1} style={{ marginTop: 6 }}>{b.title}</T>
              <T variant="caption">{dateRange(b.start_date, b.end_date)} · {time12(b.start_time)} · {b.traveler.name} · {b.guests} guest{b.guests > 1 ? "s" : ""}</T>
              <Row style={{ justifyContent: "space-between", marginTop: space.sm }}>
                {b.status === "requested" ? (
                  <T variant="small" color={palette.warning}>Respond · {timeLeft(b.request_expires_at)}</T>
                ) : b.status === "accepted" ? (
                  <T variant="small" color={palette.info}>Waiting for traveler to pay</T>
                ) : (
                  <View />
                )}
                <T variant="bodyBold">{money(b.captain_net)}</T>
              </Row>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.paper, borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  request: { borderColor: palette.ember, borderWidth: 1.5 },
});
