import { api, Button, Card, Empty, Field, Paginated, palette, Rating, Review, Row, Screen, Sheet, SkeletonList, space, T, timeAgo, toast, toastError } from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { View } from "react-native";

import { useProfile } from "../../lib/data";

export default function Reviews() {
  const qc = useQueryClient();
  const profile = useProfile();
  const q = useQuery({ queryKey: ["my-reviews"], queryFn: () => api.get<Paginated<Review>>("/reviews/mine/") });
  const [replying, setReplying] = useState<Review | null>(null);
  const [text, setText] = useState("");
  const reply = useMutation({
    mutationFn: () => api.post(`/reviews/${replying!.id}/reply/`, { reply: text }),
    onSuccess: () => {
      setReplying(null);
      setText("");
      qc.invalidateQueries({ queryKey: ["my-reviews"] });
      toast("Reply posted", "success");
    },
    onError: toastError,
  });
  return (
    <Screen title="Reviews" onRefresh={q.refetch}>
      {profile.data ? (
        <Card style={{ alignItems: "center", marginBottom: space.lg }}>
          <T style={{ fontSize: 40, fontWeight: "800", color: palette.ink }}>{Number(profile.data.rating_avg) > 0 ? Number(profile.data.rating_avg).toFixed(2) : "—"}</T>
          <Rating value={profile.data.rating_avg} count={profile.data.rating_count} />
          <T variant="caption" style={{ marginTop: 4 }}>Replying to reviews builds trust with future travelers.</T>
        </Card>
      ) : null}
      {q.isLoading ? <SkeletonList /> : (q.data?.results ?? []).length === 0 ? (
        <Empty icon="star-outline" title="No reviews yet" body="Travelers can review you after a completed trip." />
      ) : (
        <View style={{ gap: space.md }}>
          {q.data!.results.map((r) => (
            <Card key={r.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <T variant="bodyBold">{r.traveler_name}</T>
                <Rating value={r.rating} />
              </Row>
              <T variant="caption">{r.trip_title} · {timeAgo(r.created_at)}</T>
              {r.comment ? <T style={{ marginTop: 6 }}>{r.comment}</T> : null}
              {r.captain_reply ? (
                <View style={{ marginTop: space.sm, padding: space.md, backgroundColor: palette.sand, borderRadius: 10 }}>
                  <T variant="label">Your reply</T>
                  <T variant="small">{r.captain_reply}</T>
                </View>
              ) : (
                <Button title="Reply" small kind="secondary" onPress={() => setReplying(r)} style={{ alignSelf: "flex-start", marginTop: space.sm }} />
              )}
            </Card>
          ))}
        </View>
      )}
      <Sheet visible={!!replying} onClose={() => setReplying(null)} title={`Reply to ${replying?.traveler_name ?? ""}`}>
        <Field multiline value={text} onChangeText={setText} maxLength={1000} placeholder="Thank them, or address their feedback politely." />
        <Button title="Post reply" disabled={!text.trim()} loading={reply.isPending} onPress={() => reply.mutate()} />
      </Sheet>
    </Screen>
  );
}
