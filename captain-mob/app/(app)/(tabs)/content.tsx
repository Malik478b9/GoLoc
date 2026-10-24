import { Ionicons } from "@expo/vector-icons";
import { api, Badge, Button, Empty, palette, Post, radius, Row, Skeleton, space, Stat, T } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Insights = { posts: number; views: number; likes: number; profile_opens: number; booking_starts: number; profile_views: number };

export default function Content() {
  const { width } = useWindowDimensions();
  const tile = (width - space.lg * 2 - 16) / 3;
  const posts = useQuery({ queryKey: ["my-posts"], queryFn: () => api.get<{ results: Post[] }>("/social/mine/", { page_size: 50 }) });
  const insights = useQuery({ queryKey: ["insights"], queryFn: () => api.get<Insights>("/social/mine/insights/") });
  const i = insights.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <FlatList
        data={posts.data?.results ?? []}
        keyExtractor={(p) => p.id}
        numColumns={3}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ padding: space.lg, gap: 8, paddingBottom: 100 }}
        onRefresh={() => {
          posts.refetch();
          insights.refetch();
        }}
        refreshing={posts.isRefetching}
        ListHeaderComponent={
          <View style={{ marginBottom: space.md }}>
            <T variant="title">Reels & posts</T>
            <T variant="caption">Travelers discover you here. Each reel links to your profile and a "Book your trip" button.</T>
            {i ? (
              <>
                <Row style={{ marginTop: space.lg, flexWrap: "wrap" }} gap={8}>
                  <Stat label="Views" value={String(i.views)} />
                  <Stat label="Likes" value={String(i.likes)} />
                </Row>
                <Row style={{ marginTop: 8, flexWrap: "wrap" }} gap={8}>
                  <Stat label="Profile opens" value={String(i.profile_opens)} />
                  <Stat label="Booking starts" value={String(i.booking_starts)} hint={i.views ? `${Math.round((i.booking_starts * 100) / i.views)}% of viewers` : undefined} tone="good" />
                </Row>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          posts.isLoading ? (
            <Row gap={8}>{[0, 1, 2].map((k) => <Skeleton key={k} w={tile} h={tile * 1.6} r={12} />)}</Row>
          ) : (
            <Empty icon="film-outline" title="Post your first reel" body="Short clips of your best spots get the most bookings. 15–45 seconds works great." action="New reel" onAction={() => router.push("/post-new")} />
          )
        }
        renderItem={({ item }) => (
          <Pressable style={[styles.tile, { width: tile, height: tile * 1.6 }]}>
            {item.thumbnail || item.kind === "photo" ? <Image source={{ uri: item.thumbnail || item.media }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
            <View style={styles.meta}>
              <Row gap={4}><Ionicons name="play" size={11} color="#fff" /><T variant="caption" color="#fff" style={{ fontSize: 11 }}>{item.view_count}</T></Row>
              <Row gap={4}><Ionicons name="heart" size={11} color="#fff" /><T variant="caption" color="#fff" style={{ fontSize: 11 }}>{item.like_count}</T></Row>
            </View>
            {item.status === "hidden" ? <View style={{ position: "absolute", top: 6, left: 6 }}><Badge label="Hidden" bg={palette.coral} fg="#fff" /></View> : null}
          </Pressable>
        )}
      />
      <View style={styles.fab}>
        <Button title="New reel or photo" icon="add" onPress={() => router.push("/post-new")} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.sm, overflow: "hidden", backgroundColor: palette.night2 },
  meta: { position: "absolute", left: 6, right: 6, bottom: 6, flexDirection: "row", justifyContent: "space-between" },
  fab: { position: "absolute", left: space.lg, right: space.lg, bottom: space.lg },
});
