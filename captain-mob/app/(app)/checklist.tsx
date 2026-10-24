import { Ionicons } from "@expo/vector-icons";
import { api, Banner, Button, Card, Loading, palette, Row, Screen, space, T, toast, toastError } from "@goloc/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";

import { Checklist, useProfile, useRefreshBusiness } from "../../lib/data";

const LINKS: Record<string, string> = {
  profile: "/setup/profile",
  photo: "/setup/profile",
  service: "/setup/services",
  availability: "/setup/availability",
  documents: "/setup/documents",
  payout: "/setup/payout",
};

export default function ChecklistScreen() {
  const profile = useProfile();
  const refresh = useRefreshBusiness();
  const q = useQuery({ queryKey: ["checklist"], queryFn: () => api.get<Checklist>("/captain/checklist/") });
  const submit = useMutation({
    mutationFn: () => api.post("/captain/submit/"),
    onSuccess: () => {
      refresh();
      toast("Submitted! We'll review within 24–48 hours.", "success");
      router.back();
    },
    onError: toastError,
  });
  if (q.isLoading) return <Loading />;
  const c = q.data!;
  const status = profile.data?.review_status;

  return (
    <Screen
      title="Go-live checklist"
      subtitle={`${c.percent}% complete`}
      onRefresh={q.refetch}
      footer={c.can_submit ? <Button title="Submit for verification" icon="send" loading={submit.isPending} onPress={() => submit.mutate()} /> : undefined}
    >
      {status === "pending" ? <Banner tone="info" icon="time" title="Submitted — in review" body="You'll get a notification as soon as we're done." /> : null}
      {status === "rejected" ? <Banner tone="warning" title="Changes requested" body={profile.data?.review_note} /> : null}
      {status === "approved" ? <Banner tone="success" title="You're approved" body="Switch on Go live from your Business tab." /> : null}
      <View style={{ gap: 10, marginTop: space.md }}>
        {c.items.map((i, idx) => {
          const link = LINKS[i.key];
          return (
            <Pressable key={i.key} disabled={!link} onPress={() => link && router.push(link as any)}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: i.done ? palette.success : palette.sand2 }}>
                  {i.done ? <Ionicons name="checkmark" size={18} color={palette.white} /> : <T variant="small">{idx + 1}</T>}
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="bodyBold" style={i.done ? { color: palette.muted } : undefined}>{i.label}</T>
                  {i.key === "approved" && !i.done ? <T variant="caption">GoLoc reviews your profile and documents after you submit.</T> : null}
                </View>
                {link ? <Ionicons name="chevron-forward" size={18} color={palette.muted} /> : null}
              </Card>
            </Pressable>
          );
        })}
      </View>
      {!c.can_submit && status !== "pending" && status !== "approved" ? (
        <Row gap={6} style={{ marginTop: space.lg }}>
          <Ionicons name="information-circle" size={16} color={palette.muted} />
          <T variant="caption" style={{ flex: 1 }}>Finish every step above to submit for verification.</T>
        </Row>
      ) : null}
    </Screen>
  );
}
