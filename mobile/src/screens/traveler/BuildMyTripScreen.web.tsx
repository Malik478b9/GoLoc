import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function BuildMyTripScreen({ route }: any) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Complete your booking on mobile</Text>
        <Text style={styles.body}>
          Payment checkout is currently available on the GoLoc iOS/Android app only.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { maxWidth: 420 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  body: { color: "#475467", fontSize: 14, lineHeight: 20 },
});