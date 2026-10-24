import { LiveTripView } from "@goloc/core";
import { useLocalSearchParams } from "expo-router";

export default function Trip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LiveTripView bookingRef={id} role="traveler" />;
}
