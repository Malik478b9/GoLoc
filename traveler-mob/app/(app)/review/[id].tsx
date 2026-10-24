import { Ionicons } from "@expo/vector-icons";
import { api, BookingDetail, Button, Field, Loading, palette, Row, Screen, space, T, toast, toastError } from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable } from "react-native";

const LABELS = ["", "Poor", "Okay", "Good", "Great", "Unforgettable"];

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const b = useQuery({ queryKey: ["booking", id], queryFn: () => api.get<BookingDetail>(`/bookings/${id}/`) });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const submit = useMutation({
    mutationFn: () => api.post("/reviews/", { booking_id: id, rating, comment }),
    onSuccess: () => {
      toast("Thanks for your review!", "success");
      qc.invalidateQueries({ queryKey: ["booking", id] });
      router.back();
    },
    onError: toastError,
  });
  if (b.isLoading) return <Loading />;
  return (
    <Screen title="Rate your trip" subtitle={b.data?.title} footer={<Button title="Submit review" disabled={!rating} loading={submit.isPending} onPress={() => submit.mutate()} />}>
      <T variant="title" center style={{ marginTop: space.xl }}>How was your trip with {b.data?.captain.name.split(" ")[0]}?</T>
      <Row style={{ justifyContent: "center", marginVertical: space.xl }} gap={10}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
            <Ionicons name={n <= rating ? "star" : "star-outline"} size={42} color={palette.marigold} />
          </Pressable>
        ))}
      </Row>
      <T variant="bodyBold" center style={{ marginBottom: space.xl }}>{LABELS[rating]}</T>
      <Field label="Tell other travelers (optional)" multiline value={comment} onChangeText={setComment} maxLength={1000} placeholder="What made it special? Anything to improve?" />
    </Screen>
  );
}
