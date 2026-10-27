import {
  api, ApiError, Badge, Banner, Button, ConfirmSheet, ErrorView, Field, Itinerary, ItineraryDocument, Loading, PosterCard, Row, Screen, Segmented,
  palette, shareText, Sheet, space, T, toast, toastError,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";

import { STATUS_BADGE } from "../../../lib/itinerary";

export default function ItineraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"document" | "poster">("document");
  const [reviseOpen, setReviseOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const q = useQuery({
    queryKey: ["itinerary", id],
    queryFn: () => api.get<Itinerary & { error: string; requests: string; booking_code: string | null; edited_by_hand: boolean }>(`/captain/itineraries/${id}/`),
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 3000 : false),
  });
  const done = (it: Itinerary) => {
    qc.setQueryData(["itinerary", id], it);
    qc.invalidateQueries({ queryKey: ["itineraries"] });
  };
  const generate = useMutation({
    mutationFn: (text: string) => api.post<Itinerary>(`/captain/itineraries/${id}/generate/`, { instructions: text }),
    onSuccess: (it) => {
      done(it);
      setReviseOpen(false);
      setInstructions("");
    },
    onError: toastError,
  });
  const publish = useMutation({
    mutationFn: (value: boolean) => api.post<Itinerary>(`/captain/itineraries/${id}/publish/`, { is_published: value }),
    onSuccess: (it) => {
      done(it);
      toast(it.is_published ? (it.kind === "template" ? "Now on your profile" : "Shared with the traveler") : "Unpublished", "success");
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/captain/itineraries/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itineraries"] });
      router.back();
    },
    onError: toastError,
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Screen title="Itinerary"><ErrorView error={q.error} onRetry={q.refetch} /></Screen>;
  const it = q.data;
  const badge = STATUS_BADGE[it.status];
  const ready = it.status === "ready";
  const isTemplate = it.kind === "template";

  return (
    <Screen
      title={it.title}
      subtitle={`${it.code}${it.booking_code ? ` · ${it.booking_code}` : ""}`}
      onRefresh={q.refetch}
      footer={
        ready ? (
          <Row gap={10}>
            <Button title="Edit" icon="create-outline" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/itineraries/edit/${it.id}`)} />
            <Button
              title={it.is_published ? "Unpublish" : isTemplate ? "Show on profile" : "Share with traveler"}
              icon={it.is_published ? "eye-off-outline" : "send"}
              kind={it.is_published ? "secondary" : "primary"}
              style={{ flex: 1.4 }}
              loading={publish.isPending}
              onPress={() => publish.mutate(!it.is_published)}
            />
          </Row>
        ) : undefined
      }
    >
      <Row gap={6} style={{ marginBottom: space.md, flexWrap: "wrap" }}>
        <Badge label={badge.label} bg={badge.bg} fg={badge.fg} />
        <Badge label={isTemplate ? "Default itinerary" : "Custom"} />
        {it.is_published ? <Badge label={isTemplate ? "On your profile" : "Shared"} icon="checkmark-circle" /> : null}
        {it.edited_by_hand ? <Badge label="Edited by you" icon="create" /> : null}
      </Row>

      {it.status === "generating" ? (
        <View style={{ alignItems: "center", paddingVertical: space.xxl, gap: space.md }}>
          <ActivityIndicator />
          <T variant="h2">The AI is writing your itinerary…</T>
          <T variant="caption" center>Day-by-day plan, stays, meals, tickets and a poster. Usually about a minute. You can leave this screen.</T>
        </View>
      ) : it.status === "failed" ? (
        <Banner tone="danger" title="Couldn't write this itinerary" body={it.error || "Try again."}>
          <Button title="Try again" small onPress={() => generate.mutate("")} loading={generate.isPending} style={{ marginTop: space.sm, alignSelf: "flex-start" }} />
        </Banner>
      ) : !ready ? (
        <Button title="Write it with AI" icon="sparkles" onPress={() => generate.mutate("")} loading={generate.isPending} />
      ) : (
        <>
          <Segmented options={[{ value: "document", label: "Full itinerary" }, { value: "poster", label: "Poster" }]} value={tab} onChange={setTab} />
          <Row gap={8} style={{ marginVertical: space.md, flexWrap: "wrap" }}>
            <Button title="Edit with AI" icon="sparkles" small onPress={() => setReviseOpen(true)} />
            {it.share_url ? <Button title="PDF / print" icon="print-outline" small kind="secondary" onPress={() => Linking.openURL(tab === "poster" ? it.poster_url! : it.share_url!)} /> : null}
            {it.share_url ? (
              <Button title="Share link" icon="share-social-outline" small kind="secondary"
                onPress={() => shareText(`${it.title} — my itinerary on GoLoc: ${tab === "poster" ? it.poster_url : it.share_url}`)} />
            ) : null}
          </Row>
          {tab === "poster" ? <PosterCard poster={it.poster} it={it} /> : <ItineraryDocument it={it} content={it.content} />}
          <Button title="Delete itinerary" kind="ghost" onPress={() => setConfirmDelete(true)} style={{ marginTop: space.lg }} />
        </>
      )}

      <Sheet visible={reviseOpen} onClose={() => setReviseOpen(false)} title="Edit the whole itinerary with AI">
        <T variant="caption" style={{ marginBottom: space.md }}>Say what to change. Your hand edits and hotel names are kept.</T>
        <Field multiline value={instructions} onChangeText={setInstructions} maxLength={2000} autoFocus
          placeholder={"Make day 3 slower, add a cooking class\nSwap dinner on day 2 for a rooftop place\nTraveler lands at 18:00 instead"} />
        {generate.error ? <T variant="small" color={palette.coral}>{(generate.error as ApiError).message}</T> : null}
        <Button title="Revise" icon="sparkles" disabled={!instructions.trim()} loading={generate.isPending} onPress={() => generate.mutate(instructions)} />
      </Sheet>
      <ConfirmSheet visible={confirmDelete} title="Delete this itinerary?" body="Travelers it was shared with won't see it any more." confirm="Delete" danger
        loading={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setConfirmDelete(false)} />
    </Screen>
  );
}
