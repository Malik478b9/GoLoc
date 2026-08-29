import React from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Section 1.1 dual-tagline system + the "Registration UX rule": selecting a
 * role immediately swaps in that role's tagline, before phone entry.
 */
export default function RoleSelectScreen({ navigation }: any) {
  const selectRole = (role: "traveler" | "captain") => {
    navigation.navigate("PhoneEntry", { role });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.brand}>GoLoc</Text>
      <Text style={styles.umbrella}>Local travel, done right.</Text>

      <TouchableOpacity style={[styles.card, styles.travelerCard]} onPress={() => selectRole("traveler")}>
        <Text style={styles.cardLabel}>TRAVELER</Text>
        <Text style={styles.cardTagline}>Local people. Real places. Safe bookings.</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, styles.captainCard]} onPress={() => selectRole("captain")}>
        <Text style={styles.cardLabel}>CAPTAIN</Text>
        <Text style={styles.cardTagline}>Your city. Your business. Your income.</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 24, justifyContent: "center" },
  brand: { color: "#14B8A6", fontSize: 40, fontWeight: "700", textAlign: "center" },
  umbrella: { color: "#94A3B8", fontSize: 14, textAlign: "center", marginBottom: 48 },
  card: { borderRadius: 16, padding: 24, marginBottom: 16 },
  travelerCard: { backgroundColor: "#0F766E" },
  captainCard: { backgroundColor: "#C2410C" },
  cardLabel: { color: "#fff", fontWeight: "700", fontSize: 14, letterSpacing: 1, marginBottom: 8 },
  cardTagline: { color: "#fff", fontSize: 20, fontWeight: "600", lineHeight: 26 },
});
