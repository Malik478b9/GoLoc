import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { fetchCaptainProfile } from "../../api/client";
import type { CaptainPublicProfile, Tier } from "../../types";

const TIER_LABELS: Record<Tier, string> = { normal: "Normal", medium: "Medium", lavish: "Lavish" };

/**
 * Section 3.2 step 2 (CAP-ID, rates, packages) and step 3 CTA
 * ("Book your trip" -> Build My Trip). This is the page a Reel deep-links to.
 */
export default function CaptainProfileScreen({ route, navigation }: any) {
  const { captainId } = route.params;
  const [profile, setProfile] = useState<CaptainPublicProfile | null>(null);

  useEffect(() => {
    fetchCaptainProfile(captainId).then(({ data }) => setProfile(data));
  }, [captainId]);

  if (!profile) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.name}>{profile.business_name}</Text>
        <Text style={styles.capId}>{profile.cap_id}</Text>
        <Text style={styles.meta}>
          ★ {profile.average_rating} · {profile.total_trips} trips · {profile.home_city}
        </Text>
        <Text style={styles.bio}>{profile.bio}</Text>

        <Text style={styles.sectionTitle}>Experiences & Packages</Text>
        {profile.services.map((service) => (
          <View key={service.id} style={styles.serviceCard}>
            <Text style={styles.serviceTitle}>{service.title}</Text>
            <Text style={styles.serviceMeta}>
              {service.service_type === "package" ? `${service.duration_days} days` : "Day experience"}
            </Text>
            <View style={styles.tierRow}>
              {service.pricing_tiers.map((pt) => (
                <TouchableOpacity
                  key={pt.id}
                  style={styles.tierChip}
                  onPress={() =>
                    navigation.navigate("BuildMyTrip", {
                      serviceId: service.id,
                      pricingTierId: pt.id,
                      captain: profile,
                    })
                  }
                >
                  <Text style={styles.tierChipLabel}>{TIER_LABELS[pt.tier]}</Text>
                  <Text style={styles.tierChipPrice}>₹{pt.price_per_person}/pax</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  name: { fontSize: 24, fontWeight: "700", color: "#101828" },
  capId: { fontSize: 12, color: "#98A2B3", marginBottom: 4 },
  meta: { fontSize: 14, color: "#475467", marginBottom: 12 },
  bio: { fontSize: 14, color: "#101828", marginBottom: 24, lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  serviceCard: { backgroundColor: "#F1F3F6", borderRadius: 12, padding: 14, marginBottom: 12 },
  serviceTitle: { fontSize: 16, fontWeight: "600" },
  serviceMeta: { fontSize: 12, color: "#98A2B3", marginBottom: 10 },
  tierRow: { flexDirection: "row", gap: 8 },
  tierChip: { backgroundColor: "#0F766E", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  tierChipLabel: { color: "#fff", fontWeight: "700", fontSize: 12 },
  tierChipPrice: { color: "#CCFBF1", fontSize: 11 },
});
