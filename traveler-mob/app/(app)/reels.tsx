import { Ionicons } from "@expo/vector-icons";
import { api, Avatar, Button, http, Paginated, palette, Post, Rating, Row, space, T, toastError } from "@goloc/core";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackPost } from "../../lib/data";

function ActiveVideo({ uri, paused }: { uri: string; paused: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

function ReelItem({ p, active, height }: { p: Post; active: boolean; height: number }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(p.liked);
  const [likes, setLikes] = useState(p.like_count);

  useEffect(() => {
    if (active) trackPost(p.id, "view");
    setPaused(false);
  }, [active, p.id]);

  const like = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const res = next ? await api.post<{ like_count: number }>(`/social/posts/${p.id}/like/`) : await api.del<{ like_count: number }>(`/social/posts/${p.id}/like/`);
      setLikes(res.like_count);
    } catch (e) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toastError(e);
    }
    qc.invalidateQueries({ queryKey: ["feed"] });
  };

  const openProfile = () => {
    trackPost(p.id, "profile_open");
    router.push(`/captain/${p.captain.id}`);
  };
  const book = () => {
    trackPost(p.id, "booking_start");
    if (p.service_id) router.push(`/book/${p.service_id}`);
    else router.push(`/captain/${p.captain.id}`);
  };

  return (
    <View style={{ height, backgroundColor: "#000" }}>
      {p.kind === "photo" ? (
        <Image source={{ uri: p.media }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      ) : active ? (
        <ActiveVideo uri={p.media} paused={paused} />
      ) : p.thumbnail ? (
        <Image source={{ uri: p.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      ) : null}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused((x) => !x)}>
        {paused ? <Ionicons name="play" size={64} color="#ffffffcc" style={{ alignSelf: "center", marginTop: height / 2 - 40 }} /> : null}
      </Pressable>
      <View style={styles.shade} pointerEvents="none" />

      <View style={[styles.side, { bottom: insets.bottom + 150 }]}>
        <Pressable onPress={like} style={styles.sideBtn} hitSlop={8}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={32} color={liked ? palette.coral : palette.white} />
          <T variant="small" color={palette.white}>{likes}</T>
        </Pressable>
        <Pressable onPress={openProfile} style={styles.sideBtn} hitSlop={8}>
          <Ionicons name="person-circle-outline" size={32} color={palette.white} />
          <T variant="small" color={palette.white}>Profile</T>
        </Pressable>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        <Pressable onPress={openProfile}>
          <Row gap={10}>
            <Avatar uri={p.captain.avatar} name={p.captain.name} size={40} verified />
            <View>
              <T variant="bodyBold" color={palette.white}>{p.captain.name}</T>
              <Row gap={8}>
                <Rating value={p.captain.rating_avg} light />
                <T variant="caption" color="#ffffffcc">{p.captain.code} · {p.city_name}</T>
              </Row>
            </View>
          </Row>
        </Pressable>
        {p.caption ? <T color={palette.white} style={{ marginTop: space.sm }} numberOfLines={3}>{p.caption}</T> : null}
        <Button title="Book your trip" icon="calendar" onPress={book} style={{ marginTop: space.md }} />
      </View>
    </View>
  );
}

export default function Reels() {
  const { city, captain, start, kind } = useLocalSearchParams<{ city?: string; captain?: string; start?: string; kind?: "reel" | "photo" }>();
  const { height, width } = useWindowDimensions();
  // Desktop: a centred 9:16 column, like reels on the web.
  const columnW = Math.min(width, Math.round(height * 0.5625), 520);
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState(Number(start ?? 0));
  const q = useInfiniteQuery({
    queryKey: ["feed", city, captain, kind, "infinite"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      pageParam ? (await http.get<Paginated<Post>>(pageParam)).data : await api.get<Paginated<Post>>("/social/feed/", { city, captain, kind, page_size: 12 }),
    getNextPageParam: (last) => last.next,
  });
  const posts = q.data?.pages.flatMap((p) => p.results) ?? [];
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    if (viewableItems[0]?.index != null) setActive(viewableItems[0].index);
  }).current;
  const getItemLayout = useCallback((_: any, index: number) => ({ length: height, offset: height * index, index }), [height]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={{ flex: 1, width: columnW, alignSelf: "center" }}>
      {q.isLoading ? (
        <ActivityIndicator color={palette.white} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => <ReelItem p={item} active={index === active} height={height} />}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          initialScrollIndex={Math.min(Number(start ?? 0), Math.max(posts.length - 1, 0))}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          onEndReachedThreshold={2}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews
          ListEmptyComponent={<T color={palette.white} center style={{ marginTop: height / 2 }}>No reels yet.</T>}
        />
      )}
      </View>
      <Pressable onPress={() => router.back()} style={[styles.close, { top: insets.top + 8 }]} hitSlop={10}>
        <Ionicons name="close" size={26} color={palette.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 320, backgroundColor: "rgba(0,0,0,0.35)" },
  side: { position: "absolute", right: space.md, alignItems: "center", gap: space.lg },
  sideBtn: { alignItems: "center" },
  bottom: { position: "absolute", left: space.lg, right: 72, bottom: 0 },
  close: { position: "absolute", left: space.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
});
