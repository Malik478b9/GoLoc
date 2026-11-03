import { api, BookingDetail, Button, dateRange, LiveTripView, openChat, Row } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Linking } from "react-native";

import { EndTripSheet } from "../../../lib/EndTripSheet";

/** Trip console: shares the Captain's location, shows the traveler, stops, help, SOS and Complete. */
export default function TripConsole() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const b = useQuery({ queryKey: ["booking", id], queryFn: () => api.get<BookingDetail>(`/bookings/${id}/`) });
  const [ending, setEnding] = useState(false);

  const data = b.data;
  return (
    <>
      <LiveTripView
        bookingRef={id}
        role="captain"
        actions={
          data ? (
            <>
              <Row gap={10}>
                {data.traveler.phone ? <Button title="Call traveler" icon="call" kind="secondary" small style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${data.traveler.phone}`)} /> : null}
                <Button title="Message" icon="chatbubble-ellipses" kind="secondary" small style={{ flex: 1 }} onPress={() => openChat({ booking_id: id })} />
              </Row>
              {data.status === "in_progress" ? (
                data.actions.complete ? (
                  <Button title="Complete trip with end PIN" icon="key" onPress={() => setEnding(true)} />
                ) : (
                  <Button title={`Can be completed on ${dateRange(data.can_complete_from, data.can_complete_from)}`} icon="lock-closed" disabled />
                )
              ) : null}
              {data.status === "confirmed" ? <Button title="Start trip with PIN" icon="key" onPress={() => router.replace(`/booking/${id}`)} /> : null}
            </>
          ) : null
        }
      />
      {data ? <EndTripSheet booking={data} visible={ending} onClose={() => setEnding(false)} onDone={() => router.replace(`/booking/${id}`)} /> : null}
    </>
  );
}
