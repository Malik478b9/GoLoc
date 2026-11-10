import { Button, Empty, GroupTripCard, Loading, Screen, space, T } from "@goloc/core";
import { router } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useMyGroups } from "../../../lib/data";

/** The Captain's group departures: upcoming first, then past. */
export default function MyGroupTrips() {
  const q = useMyGroups();
  if (q.isLoading) return <Loading />;
  const d = q.data;
  const canPost = !!d?.services.length;
  return (
    <Screen
      title="Group trips"
      onRefresh={q.refetch}
      footer={<Button title="Post a group trip" icon="add" disabled={!canPost} onPress={() => router.push("/groups/new")} />}
    >
      <T variant="body" style={{ marginBottom: space.lg }}>
        Pick a date, set the seats and a price per seat. Travelers who don't know each other join and pay. You check each one in with their PIN.
      </T>
      {!canPost ? (
        <Empty icon="pricetags-outline" title="Add a day experience or package first"
          body="Group trips use one of your trips. Guide days can't be shared." action="Services & pricing"
          onAction={() => router.push("/setup/services")} />
      ) : !d?.upcoming.length && !d?.past.length ? (
        <Empty icon="people-outline" title="No group trips yet" body="Post a date and travelers in your city can join it." />
      ) : null}
      {d?.upcoming.length ? (
        <View style={{ gap: space.lg }}>
          <T variant="label">Upcoming</T>
          {d.upcoming.map((g) => <GroupTripCard key={g.id} g={g} showCaptain={false} onPress={() => router.push(`/groups/${g.id}`)} />)}
        </View>
      ) : null}
      {d?.past.length ? (
        <View style={{ gap: space.lg, marginTop: space.xxl }}>
          <T variant="label">Past</T>
          {d.past.map((g) => <GroupTripCard key={g.id} g={g} showCaptain={false} onPress={() => router.push(`/groups/${g.id}`)} />)}
        </View>
      ) : null}
    </Screen>
  );
}
