import { Empty, GroupTripCard, Screen, SkeletonList, space, T } from "@goloc/core";
import { router } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useCity, useGroupTrips } from "../../lib/data";

/** Every open group departure in the traveler's city. */
export default function GroupsScreen() {
  const city = useCity();
  const q = useGroupTrips({ city: city?.slug });
  return (
    <Screen title="Group trips" subtitle={city ? `In ${city.name}` : undefined} onRefresh={q.refetch}>
      <T variant="body" style={{ marginBottom: space.lg }}>
        Join other travelers on a Captain's fixed date. Pay only for your seats.
      </T>
      {q.isLoading ? (
        <SkeletonList rows={3} />
      ) : !q.data?.length ? (
        <Empty icon="people-outline" title="No group trips right now"
          body="Captains post new dates every week. Book a Captain privately, or check back soon." />
      ) : (
        <View style={{ gap: space.lg }}>
          {q.data.map((g) => <GroupTripCard key={g.id} g={g} onPress={() => router.push(`/group/${g.id}`)} />)}
        </View>
      )}
    </Screen>
  );
}
