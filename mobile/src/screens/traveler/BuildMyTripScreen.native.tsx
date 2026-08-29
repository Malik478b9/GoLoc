import React, { useState } from "react";
import RazorpayCheckout from "react-native-razorpay";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { createBooking, createCheckoutOrder } from "../../api/client";

/**
 * Section 3.2 step 3 (Book your trip) through Section 3.4 (Traveler money:
 * fare + insurance unlocks SOS/insurance once paid — BR-5/BR-6). Fare and
 * insurance are always computed server-side; this screen just collects
 * pax count and dates.
 */
export default function BuildMyTripScreen({ route, navigation }: any) {
  const { serviceId, pricingTierId, captain } = route.params;
  const [pax, setPax] = useState("2");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  const submitAndPay = async () => {
    setLoading(true);
    try {
      const { data: booking } = await createBooking({
        service_id: serviceId,
        pricing_tier_id: pricingTierId,
        pax_count: parseInt(pax, 10),
        trip_start_date: startDate,
        trip_end_date: endDate || startDate,
      });

      const { data: order } = await createCheckoutOrder(booking.id);

      const options = {
        description: `GoLoc booking ${booking.bkg_id}`,
        currency: "INR",
        key: order.razorpay_key_id,
        amount: Math.round(parseFloat(order.amount) * 100),
        order_id: order.razorpay_order_id,
        name: "GoLoc",
      };

      RazorpayCheckout.open(options)
        .then(() => {
          // Payment success arrives via the backend webhook (BR-5), which
          // flips booking.status to PAID and activates SOS/insurance — the
          // My Bookings screen will reflect this on next refresh.
          navigation.navigate("MyBookings");
        })
        .catch(() => {
          Alert.alert("Payment cancelled", "Your booking request is saved as pending payment.");
        });
    } catch (e) {
      Alert.alert("Couldn't create booking", "Please check the dates and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Build my trip</Text>
      <Text style={styles.subtitle}>with {captain?.business_name}</Text>

      <Text style={styles.label}>Travelers</Text>
      <TextInput style={styles.input} keyboardType="number-pad" value={pax} onChangeText={setPax} />

      <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-10-12" />

      <Text style={styles.label}>End date (YYYY-MM-DD, optional for day trips)</Text>
      <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-10-12" />

      <TouchableOpacity style={styles.button} onPress={submitAndPay} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue to payment</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#475467", marginBottom: 24 },
  label: { fontSize: 13, color: "#475467", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 8, padding: 12, fontSize: 15 },
  button: { backgroundColor: "#0F766E", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 32 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
