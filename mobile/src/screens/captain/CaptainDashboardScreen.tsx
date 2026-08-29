import React, { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { apiClient, fetchMyBookings } from "../../api/client";
import type { Booking } from "../../types";

/**
 * Section 4.1 Overview > My Business. Surfaces the pieces of the Captain
 * lifecycle (register -> verify -> go-live -> bookings -> earn -> grow)
 * that need the Captain's attention right now.
 */
export default function CaptainDashboardScreen({ navigation }: any) {
  const [profile, setProfile] = useState<any>(null);
  const [pendingRequests, setPendingRequests] = useState<Booking[]>([]);

  useEffect(() => {
    apiClient.get("/captains/me/").then(({ data }) => setProfile(data));
    fetchMyBookings().then(({ data }) => {
      const list: Booking[] = data.results ?? data;
      setPendingRequests(list.filter((b) => b.status === "requested"));
    });
  }, []);

  const needsVerification = profile?.verification_status !== "verified";
  const isLive = profile?.lifecycle_status === "live";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.tagline}>Your city. Your business. Your income.</Text>

        {needsVerification && (
          <TouchableOpacity
            style={[styles.banner, styles.bannerWarning]}
            onPress={() => navigation.navigate("Verification")}
          >
            <Text style={styles.bannerText}>Complete verification to go live and start earning.</Text>
          </TouchableOpacity>
        )}

        {!needsVerification && !isLive && (
          <TouchableOpacity
            style={[styles.banner, styles.bannerInfo]}
            onPress={() => navigation.navigate("BusinessProfile")}
          >
            <Text style={styles.bannerText}>You're verified — go live to appear in Traveler search.</Text>
          </TouchableOpacity>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.total_trips ?? 0}</Text>
            <Text style={styles.statLabel}>Trips completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.average_rating ?? "—"}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{pendingRequests.length}</Text>
            <Text style={styles.statLabel}>New requests</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>New booking requests</Text>
        {pendingRequests.length === 0 && <Text style={styles.emptyText}>Nothing new right now.</Text>}
        {pendingRequests.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={styles.requestRow}
            onPress={() => navigation.navigate("Requests")}
          >
            <Text style={styles.requestBkg}>{b.bkg_id}</Text>
            <Text style={styles.requestMeta}>
              {b.trip_start_date} · {b.pax_count} pax · ₹{b.total_amount}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7F9" },
  tagline: { fontSize: 20, fontWeight: "700", color: "#C2410C", marginBottom: 16 },
  banner: { borderRadius: 10, padding: 14, marginBottom: 16 },
  bannerWarning: { backgroundColor: "#FEF0C7" },
  bannerInfo: { backgroundColor: "#D1E9FF" },
  bannerText: { fontWeight: "600", color: "#101828" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 14, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 11, color: "#98A2B3", marginTop: 2, textAlign: "center" },
  sectionTitle: { fontWeight: "700", fontSize: 15, marginBottom: 10 },
  emptyText: { color: "#98A2B3", fontSize: 13 },
  requestRow: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8 },
  requestBkg: { fontWeight: "700" },
  requestMeta: { color: "#475467", fontSize: 12, marginTop: 2 },
});
