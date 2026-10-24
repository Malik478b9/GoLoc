import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";

import { api } from "../api/client";
import type { Booking, Notification, Paginated, Ticket } from "../api/types";
import { timeAgo, titleCase } from "../format";
import { palette, radius, space } from "../theme";
import { toast, toastError } from "../ui/feedback";
import { Field, Segmented } from "../ui/inputs";
import { Empty, ErrorView, Screen, SkeletonList } from "../ui/layout";
import { Badge, Button, Card, Chip, Row, T, useAccent } from "../ui/primitives";

/** Where a notification tap should land. Shared by the inbox and push taps. */
export function routeForNotification(data: Record<string, string>) {
  if (data.conversation_id) return `/chat/${data.conversation_id}`;
  if (data.booking_id) return `/booking/${data.booking_id}`;
  if (data.ticket_id) return "/support";
  if (data.payout_id) return "/earnings";
  return null;
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["unread"],
    queryFn: () => api.get<{ unread: number }>("/notifications/unread/"),
    refetchInterval: 30000,
    select: (d) => d.unread,
  });
}

export function NotificationsScreen() {
  const accent = useAccent();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<Paginated<Notification> & { unread: number }>("/notifications/") });
  const readAll = useMutation({
    mutationFn: () => api.post("/notifications/read/", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.setQueryData(["unread"], { unread: 0 });
    },
  });
  return (
    <Screen
      title="Notifications"
      scroll={false}
      padded={false}
      headerRight={q.data?.unread ? <Button title="Mark all read" kind="ghost" small onPress={() => readAll.mutate()} /> : null}
    >
      {q.isLoading ? (
        <View style={{ padding: space.lg }}><SkeletonList /></View>
      ) : q.error ? (
        <ErrorView error={q.error} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={q.data?.results ?? []}
          keyExtractor={(n) => String(n.id)}
          onRefresh={q.refetch}
          refreshing={q.isRefetching}
          ListEmptyComponent={<Empty icon="notifications-outline" title="You're all caught up" />}
          renderItem={({ item }) => {
            const to = routeForNotification(item.data);
            return (
              <Pressable
                onPress={() => {
                  if (!item.read_at) api.post("/notifications/read/", { ids: [item.id] }).then(() => qc.invalidateQueries({ queryKey: ["unread"] }));
                  if (to) router.push(to as any);
                }}
                style={({ pressed }) => [styles.note, !item.read_at && { backgroundColor: accent.soft }, pressed && { opacity: 0.8 }]}
              >
                <View style={[styles.dot, { backgroundColor: item.kind.startsWith("sos") ? palette.coral : item.read_at ? "transparent" : accent.main }]} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyBold">{item.title}</T>
                  <T variant="caption">{item.body}</T>
                  <T variant="caption" style={{ marginTop: 4, fontSize: 11 }}>{timeAgo(item.created_at)}</T>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const CATEGORIES = [
  ["payment", "Payment / refund"],
  ["cancellation", "Cancellation"],
  ["service", "Service quality"],
  ["safety", "Safety concern"],
  ["payout", "Payout"],
  ["account", "Account"],
  ["other", "Something else"],
] as const;

export function SupportScreen({ role }: { role: "traveler" | "captain" }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"new" | "mine">("mine");
  const [category, setCategory] = useState<string>("payment");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => api.get<Paginated<Ticket>>("/support/tickets/") });
  const bookings = useQuery({ queryKey: ["bookings", "past-for-support"], queryFn: () => api.get<Paginated<Booking>>("/bookings/", { page_size: 10 }), enabled: tab === "new" });
  const create = useMutation({
    mutationFn: () => api.post<Ticket>("/support/tickets/", { category, subject, description, booking_id: bookingId }),
    onSuccess: (t) => {
      toast(`${t.code} opened. We'll get back to you soon.`, "success");
      setSubject("");
      setDescription("");
      setTab("mine");
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: toastError,
  });

  return (
    <Screen title="Help & disputes" onRefresh={tickets.refetch}>
      <Segmented value={tab} onChange={setTab} options={[{ value: "mine", label: "My tickets" }, { value: "new", label: "New request" }]} />
      <View style={{ height: space.lg }} />
      {tab === "mine" ? (
        tickets.isLoading ? <SkeletonList rows={3} /> : (tickets.data?.results ?? []).length === 0 ? (
          <Empty icon="help-buoy-outline" title="No tickets" body="Raise a request if anything went wrong — payments, cancellations, safety or payouts." action="New request" onAction={() => setTab("new")} />
        ) : (
          <View style={{ gap: space.md }}>
            {tickets.data!.results.map((t) => (
              <Card key={t.id}>
                <Row style={{ justifyContent: "space-between" }}>
                  <T variant="label">{t.code}{t.booking_code ? ` · ${t.booking_code}` : ""}</T>
                  <Badge label={titleCase(t.status)} bg={t.status === "resolved" ? palette.successSoft : palette.infoSoft} fg={t.status === "resolved" ? palette.success : palette.info} />
                </Row>
                <T variant="bodyBold" style={{ marginTop: 6 }}>{t.subject}</T>
                <T variant="caption">{titleCase(t.category)} · {timeAgo(t.created_at)}</T>
                {t.resolution ? (
                  <View style={styles.resolution}>
                    <T variant="small">{t.resolution}</T>
                    {t.refund_amount ? <T variant="small" color={palette.success} style={{ marginTop: 4 }}>Refund: ₹{t.refund_amount.toLocaleString("en-IN")}</T> : null}
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        )
      ) : (
        <View>
          {category === "safety" ? (
            <Card style={{ backgroundColor: palette.coralSoft, marginBottom: space.md }}>
              <Row><Ionicons name="warning" size={18} color={palette.coral} /><T variant="bodyBold" color={palette.coral}>In danger right now? Call 112.</T></Row>
            </Card>
          ) : null}
          <T variant="small" style={{ marginBottom: 8 }}>What's it about?</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.lg }}>
            {CATEGORIES.filter(([v]) => role === "captain" || v !== "payout").map(([v, l]) => (
              <Chip key={v} label={l} active={category === v} onPress={() => setCategory(v)} />
            ))}
          </View>
          {(bookings.data?.results ?? []).length ? (
            <>
              <T variant="small" style={{ marginBottom: 8 }}>Related booking (optional)</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.lg }}>
                {bookings.data!.results.map((b) => (
                  <Chip key={b.id} label={`${b.code} · ${b.title.slice(0, 18)}`} active={bookingId === b.id} onPress={() => setBookingId(bookingId === b.id ? null : b.id)} />
                ))}
              </View>
            </>
          ) : null}
          <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={120} placeholder="Short summary" />
          <Field label="Details" value={description} onChangeText={setDescription} multiline maxLength={3000} placeholder="What happened? Include times and amounts if relevant." />
          <Button title="Submit" disabled={subject.trim().length < 4 || description.trim().length < 10} loading={create.isPending} onPress={() => create.mutate()} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  resolution: { marginTop: space.sm, padding: space.md, backgroundColor: palette.sand, borderRadius: radius.sm },
});
