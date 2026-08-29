import React, { useEffect, useState } from "react";
import { Alert, FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { apiClient } from "../../api/client";

/** Section 4.1 Operate > Availability. Also bumps last_activity_at server-side (BR-3 hold sweep). */
export default function AvailabilityScreen() {
  const [slots, setSlots] = useState<any[]>([]);
  const [date, setDate] = useState("");

  const load = () => apiClient.get("/captains/me/availability/").then(({ data }) => setSlots(data.results ?? data));

  useEffect(() => {
    load();
  }, []);

  const addSlot = async () => {
    if (!date) return;
    try {
      await apiClient.post("/captains/me/availability/", { date, is_available: true });
      setDate("");
      load();
    } catch {
      Alert.alert("Couldn't add date", "Use format YYYY-MM-DD.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Availability</Text>
      <View style={styles.addRow}>
        <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} />
        <TouchableOpacity style={styles.addButton} onPress={addSlot}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={slots}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowText}>{item.date}</Text>
            <Text style={styles.rowStatus}>{item.is_available ? "Open" : "Blocked"}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7F9" },
  header: { fontSize: 18, fontWeight: "700", padding: 16, paddingBottom: 0 },
  addRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 12 },
  input: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, padding: 10 },
  addButton: { backgroundColor: "#C2410C", borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8 },
  rowText: { fontWeight: "600" },
  rowStatus: { color: "#027A48", fontWeight: "600" },
});
