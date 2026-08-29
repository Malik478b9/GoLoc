import React, { useEffect, useState } from "react";
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { fetchCaptains } from "../../api/client";
import type { CaptainPublicProfile } from "../../types";

/** Section 3.1 Explore > Find Captains — search/browse independent of the reels funnel. */
export default function FindCaptainsScreen({ navigation }: any) {
  const [query, setQuery] = useState("");
  const [captains, setCaptains] = useState<CaptainPublicProfile[]>([]);

  const search = () => {
    fetchCaptains({ q: query }).then(({ data }) => setCaptains(data.results ?? data));
  };

  useEffect(() => {
    search();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search by name, CAP-ID, or specialty"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={search}
      />
      <FlatList
        data={captains}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate("CaptainProfile", { captainId: item.id })}
          >
            <Text style={styles.name}>{item.business_name}</Text>
            <Text style={styles.meta}>
              {item.cap_id} · ★ {item.average_rating} · {item.home_city}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  search: { margin: 16, borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 10, padding: 12 },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F1F3F6" },
  name: { fontWeight: "700", fontSize: 15 },
  meta: { color: "#475467", fontSize: 12, marginTop: 2 },
});
