import React, { useState } from "react";
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

import { requestOTP } from "../../api/client";
import { useAuthStore } from "../../store/authStore";

export function PhoneEntryScreen({ route, navigation }: any) {
  const { role } = route.params;
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const tagline =
    role === "captain"
      ? "Your city. Your business. Your income."
      : "Local people. Real places. Safe bookings.";

  const submit = async () => {
    if (phone.length < 10) {
      Alert.alert("Enter a valid phone number");
      return;
    }
    setLoading(true);
    try {
      await requestOTP(phone, "signup");
      navigation.navigate("OTPVerify", { phone, role });
    } catch (e) {
      Alert.alert("Couldn't send OTP", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.tagline}>{tagline}</Text>
      <Text style={styles.label}>Phone number</Text>
      <TextInput
        style={styles.input}
        keyboardType="phone-pad"
        placeholder="+91 98765 43210"
        placeholderTextColor="#64748B"
        value={phone}
        onChangeText={setPhone}
      />
      <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send OTP</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

export function OTPVerifyScreen({ route }: any) {
  const { phone, role } = route.params;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const loginWithOTP = useAuthStore((s) => s.loginWithOTP);

  const submit = async () => {
    setLoading(true);
    try {
      // Navigation to the role-based tab root happens automatically once
      // useAuthStore().user is set — see navigation/RootNavigator.tsx.
      await loginWithOTP({ phone_number: phone, code, role, full_name: "" });
    } catch (e) {
      Alert.alert("Invalid code", "Please check the OTP and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.label}>Enter the code sent to {phone}</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        placeholder="6-digit code"
        placeholderTextColor="#64748B"
        value={code}
        onChangeText={setCode}
        maxLength={6}
      />
      <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & continue</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 24, justifyContent: "center" },
  tagline: { color: "#14B8A6", fontSize: 20, fontWeight: "600", marginBottom: 32, textAlign: "center" },
  label: { color: "#E2E8F0", fontSize: 14, marginBottom: 8 },
  input: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    color: "#fff",
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  button: { backgroundColor: "#0F766E", borderRadius: 10, padding: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
