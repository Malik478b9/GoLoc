import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { apiClient } from "../../api/client";
import type { Service, Tier } from "../../types";

/**
 * Section 4.1 Business setup > Services & Pricing. Lets a Captain create
 * Day experiences or Packages and set Normal/Medium/Lavish pricing (3.3),
 * which is exactly what BookingCreateSerializer prices off of server-side.
 */
export default function ServicesPricingScreen() {
  const [services, setServices] = useState<Service[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [serviceType, setServiceType] = useState<"day_experience" | "package">("day_experience");
  const [prices, setPrices] = useState<Record<Tier, string>>({ normal: "", medium: "", lavish: "" });

  const load = () => apiClient.get("/captains/me/services/").then(({ data }) => setServices(data.results ?? data));

  useEffect(() => {
    load();
  }, []);

  const createService = async () => {
    try {
      const { data: service } = await apiClient.post("/captains/me/services/", {
        title,
        service_type: serviceType,
        duration_days: serviceType === "package" ? 5 : 1,
      });
      for (const [tier, price] of Object.entries(prices)) {
        if (price) {
          await apiClient.post(`/captains/me/services/${service.id}/pricing-tiers/`, {
            tier,
            price_per_person: price,
          });
        }
      }
      setModalOpen(false);
      setTitle("");
      setPrices({ normal: "", medium: "", lavish: "" });
      load();
    } catch {
      Alert.alert("Couldn't save", "Check the fields and try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Services & Pricing</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalOpen(true)}>
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={services}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMeta}>{item.service_type === "package" ? "Package" : "Day experience"}</Text>
            {item.pricing_tiers.map((pt) => (
              <Text key={pt.id} style={styles.priceRow}>
                {pt.tier} — ₹{pt.price_per_person}/pax
              </Text>
            ))}
          </View>
        )}
      />

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New service</Text>
            <TextInput style={styles.input} placeholder="Title" value={title} onChangeText={setTitle} />
            <View style={styles.typeRow}>
              {(["day_experience", "package"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, serviceType === t && styles.typeChipActive]}
                  onPress={() => setServiceType(t)}
                >
                  <Text style={serviceType === t ? styles.typeChipTextActive : styles.typeChipText}>
                    {t === "day_experience" ? "Day experience" : "Package"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {(["normal", "medium", "lavish"] as Tier[]).map((tier) => (
              <TextInput
                key={tier}
                style={styles.input}
                placeholder={`${tier} price per person (₹)`}
                keyboardType="numeric"
                value={prices[tier]}
                onChangeText={(v) => setPrices((p) => ({ ...p, [tier]: v }))}
              />
            ))}
            <TouchableOpacity style={styles.saveButton} onPress={createService}>
              <Text style={styles.saveButtonText}>Save service</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7F9" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  header: { fontSize: 18, fontWeight: "700" },
  addButton: { backgroundColor: "#C2410C", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  addButtonText: { color: "#fff", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTitle: { fontWeight: "700", fontSize: 15 },
  cardMeta: { color: "#98A2B3", fontSize: 12, marginBottom: 8 },
  priceRow: { fontSize: 13, color: "#101828", textTransform: "capitalize" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(16,24,40,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, padding: 12, marginBottom: 10 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  typeChip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  typeChipActive: { backgroundColor: "#C2410C", borderColor: "#C2410C" },
  typeChipText: { color: "#101828" },
  typeChipTextActive: { color: "#fff", fontWeight: "700" },
  saveButton: { backgroundColor: "#0F766E", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  saveButtonText: { color: "#fff", fontWeight: "700" },
  cancelText: { textAlign: "center", color: "#98A2B3", marginTop: 12, marginBottom: 8 },
});
