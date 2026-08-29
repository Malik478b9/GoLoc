import React, { useEffect, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { apiClient } from "../../api/client";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending completion",
  available: "Available for payout",
  paid_out: "Paid out",
  held: "On hold",
};

/** Section 4.1 Grow > Earnings — reads apps.payments.PayoutLedgerEntry (BR-2). */
export default function EarningsScreen() {
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    apiClient.get("/payments/payouts/me/").then(({ data }) => setEntries(data));
  }, []);

  const available = entries
    .filter((e) => e.status === "available")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Earnings</Text>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Available for payout</Text>
        <Text style={styles.summaryValue}>₹{available.toFixed(2)}</Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.bkg}>{item.booking_bkg_id}</Text>
              <Text style={styles.status}>{STATUS_LABEL[item.status]}</Text>
            </View>
            <Text style={styles.amount}>₹{item.amount}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7F9" },
  header: { fontSize: 18, fontWeight: "700", padding: 16, paddingBottom: 0 },
  summaryCard: { backgroundColor: "#0F766E", borderRadius: 14, margin: 16, padding: 20 },
  summaryLabel: { color: "#CCFBF1", fontSize: 13 },
  summaryValue: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8 },
  bkg: { fontWeight: "700" },
  status: { color: "#98A2B3", fontSize: 12, marginTop: 2 },
  amount: { fontWeight: "700", fontSize: 15 },
});
