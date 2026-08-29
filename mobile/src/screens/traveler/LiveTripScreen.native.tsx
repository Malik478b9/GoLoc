import React, { useEffect, useRef, useState } from "react";
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { WS_BASE_URL } from "../../api/client";

interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Section 3.1 Travel > Live Trip + Safety & SOS, both over the same
 * WebSocket connection to apps.safety.consumers.TripTrackingConsumer.
 * The connection is refused server-side unless Booking.sos_active is True
 * (BR-5: pay-to-protect) — see the backend consumer's connect() method.
 */
export default function LiveTripScreen({ route }: any) {
  const { bookingId } = route.params;
  const [path, setPath] = useState<LatLng[]>([]);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let socket: WebSocket;

    const connect = async () => {
      const token = await AsyncStorage.getItem("access_token");
      socket = new WebSocket(`${WS_BASE_URL}/ws/trip/${bookingId}/?token=${token}`);
      ws.current = socket;

      socket.onopen = () => setConnected(true);
      socket.onclose = () => setConnected(false);
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "trip.update") {
          setPath((prev) => [...prev, { latitude: data.lat, longitude: data.lng }]);
        }
      };
    };

    connect();
    return () => socket?.close();
  }, [bookingId]);

  const raiseSOS = () => {
    Alert.alert(
      "Confirm SOS",
      "This alerts GoLoc's safety team and shares your live location immediately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send SOS",
          style: "destructive",
          onPress: () => {
            const last = path[path.length - 1];
            ws.current?.send(
              JSON.stringify({ type: "sos", lat: last?.latitude, lng: last?.longitude })
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: path[0]?.latitude ?? 17.385,
          longitude: path[0]?.longitude ?? 78.4867,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <Polyline coordinates={path} strokeColor="#0F766E" strokeWidth={4} />
        {path.length > 0 && <Marker coordinate={path[path.length - 1]} title="Captain" />}
      </MapView>

      <View style={styles.statusPill}>
        <Text style={styles.statusText}>{connected ? "Live tracking active" : "Connecting…"}</Text>
      </View>

      <TouchableOpacity style={styles.sosButton} onPress={raiseSOS}>
        <Text style={styles.sosText}>SOS</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusPill: {
    position: "absolute", top: 16, alignSelf: "center",
    backgroundColor: "rgba(16,24,40,0.85)", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14,
  },
  statusText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  sosButton: {
    position: "absolute", bottom: 40, alignSelf: "center",
    width: 88, height: 88, borderRadius: 44, backgroundColor: "#B42318",
    justifyContent: "center", alignItems: "center", elevation: 6,
  },
  sosText: { color: "#fff", fontWeight: "800", fontSize: 20, letterSpacing: 1 },
});
