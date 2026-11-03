import { api, BookingDetail, Button, money, palette, radius, Sheet, space, T, toast, toastError } from "@goloc/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { StyleSheet, TextInput } from "react-native";

/**
 * Finishing a trip needs the traveler's end PIN (shown in their app from the
 * last booked day), so a trip can't be closed without them.
 */
export function EndTripSheet({ booking, visible, onClose, onDone }: { booking: BookingDetail; visible: boolean; onClose: () => void; onDone?: (b: BookingDetail) => void }) {
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const complete = useMutation({
    mutationFn: () => api.post<BookingDetail>(`/bookings/${booking.id}/complete/`, { pin }),
    onSuccess: (b) => {
      qc.setQueryData(["booking", booking.id], b);
      qc.invalidateQueries({ queryKey: ["booking"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      setPin("");
      toast(`Trip completed · ${money(b.captain_net)} ${b.agency_name ? `credited to ${b.agency_name}` : "added to your wallet"}`, "success");
      onClose();
      onDone?.(b);
    },
    onError: (e) => {
      setPin("");
      toastError(e);
    },
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Enter end PIN">
      <T variant="caption" style={{ marginBottom: space.md }}>
        Ask {booking.traveler.name || "the traveler"} for the 4-digit end PIN in their GoLoc app. They share it only when every stop is done and they've been dropped off.
      </T>
      <TextInput
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        style={styles.pin}
        placeholder="••••"
        placeholderTextColor={palette.lineStrong}
      />
      <Button title="Complete trip" icon="checkmark-done" disabled={pin.length !== 4} loading={complete.isPending} onPress={() => complete.mutate()} style={{ marginTop: space.lg }} />
      <Button title="Not yet" kind="ghost" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pin: { fontSize: 36, letterSpacing: 20, textAlign: "center", fontWeight: "800", backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.lineStrong, paddingVertical: 14, color: palette.ink },
});
