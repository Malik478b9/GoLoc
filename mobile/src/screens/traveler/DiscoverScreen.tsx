import React, { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { fetchReelFeed } from "../../api/client";
import type { Reel } from "../../types";

/**
 * Section 3.2 Reels -> book funnel, step 1 (Watch reel) and 2 (Open profile).
 * Tapping a reel calls track_profile_open then navigates to CaptainProfile —
 * this is the analytics the Captain sees on their Insights screen.
 */
export default function DiscoverScreen({ navigation }: any) {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReelFeed()
      .then(({ data }) => setReels(data.results ?? data))
      .finally(() => setLoading(false));
  }, []);

  const openProfile = (reel: Reel) => {
    navigation.navigate("CaptainProfile", { captainId: reel.captain, fromReelId: reel.id });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Where will a local take you next?</Text>
      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: 8 }}
        refreshing={loading}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.tile} onPress={() => openProfile(item)}>
            <Image source={{ uri: item.thumbnail_url }} style={styles.thumbnail} />
            <View style={styles.overlay}>
              <Text style={styles.captainName} numberOfLines={1}>
                {item.captain_business_name}
              </Text>
              <Text style={styles.caption} numberOfLines={2}>
                {item.caption}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7F9" },
  header: { fontSize: 20, fontWeight: "700", color: "#101828", padding: 16 },
  tile: { flex: 1, margin: 6, borderRadius: 12, overflow: "hidden", aspectRatio: 0.7, backgroundColor: "#000" },
  thumbnail: { flex: 1 },
  overlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, backgroundColor: "rgba(0,0,0,0.45)" },
  captainName: { color: "#fff", fontWeight: "700", fontSize: 13 },
  caption: { color: "#E2E8F0", fontSize: 11 },
});
