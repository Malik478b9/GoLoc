import React, { useEffect, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { acceptBooking, completeBooking, fetchMyBookings } from "../../api/client";
import type { Booking } from "../../types";

/** Section 4.1 Operate > Requests / Active Trip. Drives BR-2 (complete -> payout eligible). */
export default function RequestsScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);

  const load = () => fetchMyBookings().then(({ data }) => setBookings(data.results ?? data));

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Requests & trips</Text>
      <FlatList
        data={bookings}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.bkgId}>{item.bkg_id}</Text>
            <Text style={styles.meta}>
              {item.trip_start_date} · {item.pax_count} pax · ₹{item.total_amount}
            </Text>
            <Text style={styles.status}>{item.status.replace(/_/g, " ")}</Text>

            {item.status === "requested" && (
              <TouchableOpacity style={styles.actionButton} onPress={() => acceptBooking(item.id).then(load)}>
                <Text style={styles.actionButtonText}>Accept</Text>
              </TouchableOpacity>
            )}
            {item.status === "in_progress" && (
              <TouchableOpacity style={styles.actionButton} onPress={() => completeBooking(item.id).then(load)}>
                <Text style={styles.actionButtonText}>Mark trip completed</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7F9" },
  header: { fontSize: 18, fontWeight: "700", padding: 16, paddingBottom: 0 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  bkgId: { fontWeight: "700" },
  meta: { color: "#475467", fontSize: 12, marginTop: 2 },
  status: { fontSize: 12, fontWeight: "700", color: "#B54708", marginTop: 6, textTransform: "capitalize" },
  actionButton: { backgroundColor: "#0F766E", borderRadius: 8, padding: 10, alignItems: "center", marginTop: 10 },
  actionButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
