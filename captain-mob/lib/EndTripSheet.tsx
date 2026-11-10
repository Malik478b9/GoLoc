import { api, BookingDetail, Button, money, PinInput, Sheet, space, T, toast, toastError } from "@goloc/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";

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
      qc.invalidateQueries({ queryKey: ["my-group"] });
      qc.invalidateQueries({ queryKey: ["my-groups"] });
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
      <T variant="caption" style={{ marginBottom: space.lg }}>
        Ask {booking.traveler.name || "the traveler"} for the 4-digit end PIN in their GoLoc app. They share it only when every stop is done and they've been dropped off.
      </T>
      <PinInput value={pin} onChange={setPin} />
      <Button title="Complete trip" icon="checkmark-done" disabled={pin.length !== 4} loading={complete.isPending} onPress={() => complete.mutate()} style={{ marginTop: space.lg }} />
      <Button title="Not yet" kind="ghost" onPress={onClose} />
    </Sheet>
  );
}
