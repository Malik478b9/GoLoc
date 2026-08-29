import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { cancelBooking, fetchMyBookings } from "../../api/client";
import type { Booking } from "../../types";

const STATUS_COLORS: Record<string, string> = {
  requested: "#B54708",
  accepted: "#175CD3",
  paid: "#027A48",
  in_progress: "#027A48",
  completed: "#475467",
  cancelled_by_traveler: "#B42318",
  cancelled_by_captain: "#B42318",
  disputed: "#B42318",
};

export function MyBookingsScreen({ navigation }: any) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => fetchMyBookings().then(({ data }) => setBookings(data.results ?? data));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const onCancel = (booking: Booking) => {
    Alert.alert("Cancel booking?", "Refund amount depends on how close you are to the trip date.", [
      { text: "Keep booking", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: () => cancelBooking(booking.id).then(load),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>My Bookings</Text>
      <FlatList
        data={bookings}
        keyExtractor={(b) => b.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              item.sos_active
                ? navigation.navigate("LiveTrip", { bookingId: item.id })
                : undefined
            }
          >
            <View style={styles.cardHeader}>
              <Text style={styles.bkgId}>{item.bkg_id}</Text>
              <Text style={[styles.status, { color: STATUS_COLORS[item.status] }]}>
                {item.status.replace(/_/g, " ")}
              </Text>
            </View>
            <Text style={styles.captain}>Captain {item.captain_cap_id}</Text>
            <Text style={styles.dates}>
              {item.trip_start_date} → {item.trip_end_date} · {item.pax_count} pax
            </Text>
            <Text style={styles.total}>Total ₹{item.total_amount}</Text>
            {["requested", "accepted"].includes(item.status) && (
              <TouchableOpacity onPress={() => onCancel(item)}>
                <Text style={styles.cancelLink}>Cancel booking</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7F9" },
  header: { fontSize: 20, fontWeight: "700", padding: 16, paddingBottom: 0 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E6E9EF" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  bkgId: { fontWeight: "700", color: "#101828" },
  status: { fontWeight: "700", fontSize: 12, textTransform: "capitalize" },
  captain: { color: "#475467", fontSize: 13 },
  dates: { color: "#475467", fontSize: 13, marginTop: 4 },
  total: { fontWeight: "700", marginTop: 8 },
  cancelLink: { color: "#B42318", marginTop: 10, fontSize: 13, fontWeight: "600" },
});
