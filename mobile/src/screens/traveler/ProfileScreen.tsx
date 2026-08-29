import React from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAuthStore } from "../../store/authStore";

/** Section 3.1 Account group: Profile, with Saved Captains / Reviews as sub-links. */
export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.name}>{user?.full_name || user?.phone_number}</Text>
      <Text style={styles.role}>Traveler</Text>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("SavedCaptains")}>
        <Text style={styles.rowLabel}>Saved Captains</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("MyReviews")}>
        <Text style={styles.rowLabel}>My Reviews</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={logout}>
        <Text style={[styles.rowLabel, { color: "#B42318" }]}>Log out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  name: { fontSize: 20, fontWeight: "700", marginTop: 12 },
  role: { color: "#98A2B3", marginBottom: 24 },
  row: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#F1F3F6" },
  rowLabel: { fontSize: 15, fontWeight: "500" },
});
