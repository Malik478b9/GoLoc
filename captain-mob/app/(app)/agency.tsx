import { api, Banner, Button, Card, Empty, Loading, longDate, palette, Row, Screen, Sheet, space, T, timeAgo, toast, toastError } from "@goloc/core";
import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import React, { useState } from "react";
import { View } from "react-native";

import { AgencyMembership, useAgency, useProfile, useRefreshBusiness } from "../../lib/data";

/** Join an agency from an invite, see who you work for, or go independent. */
export default function AgencyScreen() {
  const q = useAgency();
  const profile = useProfile();
  const refresh = useRefreshBusiness();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const act = useMutation({
    mutationFn: ({ path }: { path: string; ok: string }) => api.post<AgencyMembership>(path),
    onSuccess: (_d, { ok }) => {
      refresh();
      setConfirmLeave(false);
      toast(ok, "success");
    },
    onError: toastError,
  });

  if (q.isLoading) return <Loading />;
  const m = q.data;
  const agency = m?.agency;

  return (
    <Screen title="Agency" onRefresh={q.refetch}>
      {agency ? (
        <>
          <Card>
            <Row gap={space.md}>
              {agency.logo ? <Image source={{ uri: agency.logo }} style={{ width: 56, height: 56, borderRadius: 12 }} /> : null}
              <View style={{ flex: 1 }}>
                <T variant="label">You work for</T>
                <T variant="title">{agency.name}</T>
                <T variant="caption">{agency.code} · {agency.city_name} · since {longDate(agency.joined_at.slice(0, 10))}</T>
              </View>
            </Row>
          </Card>
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <T variant="h2">How it works</T>
            {[
              "Your agency sets the trips you offer and their prices.",
              "Your agency can give you a car to drive guests in.",
              "Travelers still book you by name. You accept, start and finish trips in this app as usual.",
              "Your agency can give a trip to a colleague, and if you decline one, a free colleague gets it.",
              "Trip earnings go to your agency's wallet. Your agency pays you directly.",
              "You still keep your own GoLoc verification (ID, licence), ratings and reviews.",
            ].map((line) => (
              <Row key={line} gap={8} style={{ alignItems: "flex-start" }}>
                <T color={palette.success}>✓</T>
                <T variant="small" style={{ flex: 1 }}>{line}</T>
              </Row>
            ))}
          </View>
          <Button title="Leave agency and go independent" kind="ghost" style={{ marginTop: space.xl }} onPress={() => setConfirmLeave(true)} />
        </>
      ) : (
        <>
          <Banner tone="info" icon="business" title="You're independent"
            body="You set your own trips and prices and get paid to your own account. If a travel agency invites your number, the invite shows up here." />
          <T variant="h2" style={{ marginTop: space.xl, marginBottom: space.sm }}>Invites</T>
          {!m?.invites.length ? (
            <Empty icon="mail-outline" title="No invites" body="Ask your agency to invite the number you signed in with." />
          ) : (
            <View style={{ gap: space.md }}>
              {m.invites.map((i) => (
                <Card key={i.id}>
                  <T variant="h2">{i.agency.name}</T>
                  <T variant="caption">{i.agency.code} · {i.agency.city_name} · invited {timeAgo(i.created_at)}</T>
                  <T variant="small" style={{ marginTop: space.sm }}>
                    When you join, your own services are paused: you offer {i.agency.name}'s trips at their prices and they receive your trip earnings.
                  </T>
                  {!profile.data ? <T variant="caption" color={palette.coral} style={{ marginTop: 6 }}>Set up your business profile first, then accept.</T> : null}
                  <Row gap={10} style={{ marginTop: space.md }}>
                    <Button title="Decline" kind="secondary" small style={{ flex: 1 }} disabled={act.isPending}
                      onPress={() => act.mutate({ path: `/captain/agency/invites/${i.id}/decline/`, ok: "Invite declined" })} />
                    <Button title={`Join ${i.agency.name}`} small style={{ flex: 2 }} loading={act.isPending} disabled={!profile.data}
                      onPress={() => act.mutate({ path: `/captain/agency/invites/${i.id}/accept/`, ok: `Welcome to ${i.agency.name}` })} />
                  </Row>
                </Card>
              ))}
            </View>
          )}
        </>
      )}

      <Sheet visible={confirmLeave} onClose={() => setConfirmLeave(false)} title="Go independent?">
        <T>Your agency's trips and car are removed and you go offline. To take bookings again, add your own services and a payout account.</T>
        <T variant="caption" style={{ marginTop: space.sm }}>Finish or hand over open agency bookings first.</T>
        <Button title="Leave agency" kind="danger" loading={act.isPending} style={{ marginTop: space.lg }}
          onPress={() => act.mutate({ path: "/captain/agency/leave/", ok: "You're independent now" })} />
      </Sheet>
    </Screen>
  );
}
