import { api, BookingDetail, Button, ConfirmSheet, LiveTripView, money, openChat, Row, toast, toastError } from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Linking } from "react-native";

/** Trip console: shares the Captain's location, shows the traveler, stops, help, SOS and Complete. */
export default function TripConsole() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const b = useQuery({ queryKey: ["booking", id], queryFn: () => api.get<BookingDetail>(`/bookings/${id}/`) });
  const [confirm, setConfirm] = useState(false);
  const complete = useMutation({
    mutationFn: () => api.post<BookingDetail>(`/bookings/${id}/complete/`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["booking", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast(`Trip completed · ${money(res.captain_net)} added to your wallet`, "success");
      router.replace(`/booking/${id}`);
    },
    onError: toastError,
  });

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
              {data.status === "in_progress" ? <Button title="Complete trip" icon="checkmark-done" onPress={() => setConfirm(true)} /> : null}
              {data.status === "confirmed" ? <Button title="Start trip with PIN" icon="key" onPress={() => router.replace(`/booking/${id}`)} /> : null}
            </>
          ) : null
        }
      />
      <ConfirmSheet
        visible={confirm}
        title="Complete this trip?"
        body={`Only when every stop is done and your guests are dropped off. ${money(data?.captain_net)} goes to your wallet.`}
        confirm="Yes, trip completed"
        loading={complete.isPending}
        onConfirm={() => complete.mutate()}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
