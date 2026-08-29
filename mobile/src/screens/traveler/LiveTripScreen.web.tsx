import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

/**
 * Web fallback for Live Trip tracking. react-native-maps is a native-only
 * module (see the native version of this screen) and cannot bundle for web,
 * so this placeholder ships instead when running via `expo start --web`.
 * A production web build would swap in a JS Google Maps wrapper here.
 */
export default function LiveTripScreen({ route }: any) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Live Trip tracking</Text>
        <Text style={styles.body}>
          Map-based live tracking is only available on the iOS/Android app. Open this booking
          in the GoLoc mobile app to see the live map and SOS button.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7F9", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 24, maxWidth: 420 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  body: { color: "#475467", fontSize: 14, lineHeight: 20 },
});