import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../api/client";
import type { Conversation, Message, Paginated } from "../api/types";
import { timeAgo } from "../format";
import { fonts, palette, radius, space } from "../theme";
import { toastError } from "../ui/feedback";
import { Empty, ErrorView, Header, SkeletonList } from "../ui/layout";
import { Avatar, Row, T, useAccent } from "../ui/primitives";

export function ConversationList({ emptyBody }: { emptyBody: string }) {
  const q = useQuery({ queryKey: ["conversations"], queryFn: () => api.get<Paginated<Conversation>>("/chat/"), refetchInterval: 20000 });
  if (q.isLoading) return <View style={{ padding: space.lg }}><SkeletonList /></View>;
  if (q.error) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const rows = q.data?.results ?? [];
  return (
    <FlatList
      data={rows}
      keyExtractor={(c) => c.id}
      onRefresh={q.refetch}
      refreshing={q.isRefetching}
      ListEmptyComponent={<Empty icon="chatbubbles-outline" title="No messages yet" body={emptyBody} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/chat/${item.id}`)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.sand2 }]}>
          <Avatar uri={item.other.avatar} name={item.other.name} size={50} />
          <View style={{ flex: 1 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="bodyBold" numberOfLines={1} style={{ flex: 1 }}>{item.other.name}</T>
              {item.last_message_at ? <T variant="caption">{timeAgo(item.last_message_at)}</T> : null}
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="caption" numberOfLines={1} style={{ flex: 1, color: item.unread ? palette.ink : palette.muted }}>
                {item.booking_code ? `${item.booking_code} · ` : ""}
                {item.last_message_preview}
              </T>
              {item.unread ? <View style={styles.unread}><T variant="small" color={palette.white} style={{ fontFamily: fonts.bold }}>{item.unread}</T></View> : null}
            </Row>
          </View>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginLeft: 82 }} />}
    />
  );
}

type Thread = { conversation: Conversation; messages: Message[] };

export function ChatThread({ id }: { id: string }) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [convo, setConvo] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<any>(null);
  const lastId = useRef(0);

  const merge = (incoming: Message[]) => {
    if (!incoming.length) return;
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
    });
  };

  const load = useCallback(async () => {
    try {
      const data = await api.get<Thread>(`/chat/${id}/messages/`, lastId.current ? { after: lastId.current } : undefined);
      setConvo(data.conversation);
      merge(data.messages);
      setError(null);
    } catch (e) {
      if (!lastId.current) setError(e);
    }
  }, [id]);

  // Poll every 4 s only while this screen is visible.
  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 4000);
      return () => {
        clearInterval(t);
        qc.invalidateQueries({ queryKey: ["conversations"] });
      };
    }, [load, qc]),
  );

  useEffect(() => {
    lastId.current = 0;
    setMessages([]);
  }, [id]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      merge([await api.post<Message>(`/chat/${id}/messages/`, { body })]);
    } catch (e) {
      setText(body);
      toastError(e);
    } finally {
      setSending(false);
    }
  };

  const reversed = [...messages].reverse();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <Header
        title={convo?.other.name ?? "Chat"}
        subtitle={convo?.booking_code ? `Booking ${convo.booking_code}` : convo?.other.code ?? undefined}
        right={
          convo?.other.captain_id ? (
            <Pressable onPress={() => router.push(`/captain/${convo.other.captain_id}`)} hitSlop={10} accessibilityLabel="View profile">
              <Ionicons name="person-circle-outline" size={28} color={palette.ink} />
            </Pressable>
          ) : undefined
        }
      />
      {error ? (
        <ErrorView error={error} onRetry={load} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <FlatList
            inverted
            data={reversed}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{ padding: space.lg, gap: 6 }}
            ListFooterComponent={
              <View style={styles.notice}>
                <Ionicons name="shield-checkmark" size={14} color={palette.muted} />
                <T variant="caption" style={{ flex: 1 }}>Keep chats and payments on GoLoc — that's what keeps your trip insured and SOS-protected.</T>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.mine ? [styles.mine, { backgroundColor: accent.main }] : styles.theirs]}>
                <T style={{ color: item.mine ? accent.onMain : palette.ink }}>{item.body}</T>
                <T variant="caption" style={{ color: item.mine ? "#ffffffaa" : palette.muted, fontSize: 11, alignSelf: "flex-end" }}>{timeAgo(item.created_at)}</T>
              </View>
            )}
          />
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={Platform.OS === "web" ? "Message… (Enter to send, Shift+Enter for a new line)" : "Message…"}
              placeholderTextColor={palette.muted}
              style={styles.input}
              multiline
              maxLength={2000}
              onKeyPress={(e: any) => {
                // Desktop: Enter sends, Shift+Enter adds a line.
                if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) {
                  e.preventDefault?.();
                  send();
                }
              }}
            />
            <Pressable onPress={send} disabled={!text.trim() || sending} style={[styles.send, { backgroundColor: text.trim() ? accent.main : palette.lineStrong }]}>
              <Ionicons name="arrow-up" size={20} color={palette.white} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

/** Opens (or creates) the thread with a Captain / for a booking, then navigates to it. */
export async function openChat(body: { captain_id?: string; booking_id?: string }) {
  try {
    const c = await api.post<Conversation>("/chat/", body);
    router.push(`/chat/${c.id}`);
  } catch (e) {
    toastError(e);
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: "center" },
  unread: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: palette.coral, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  bubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, gap: 2 },
  mine: { alignSelf: "flex-end", borderBottomRightRadius: 6 },
  theirs: { alignSelf: "flex-start", backgroundColor: palette.white, borderBottomLeftRadius: 6 },
  notice: { flexDirection: "row", gap: 6, padding: space.md, backgroundColor: palette.sand2, borderRadius: radius.md, marginBottom: space.md },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, backgroundColor: palette.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
  input: { flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: palette.white, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.body, fontSize: 15, color: palette.ink },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
