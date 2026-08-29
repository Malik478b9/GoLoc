import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { apiClient } from "../../api/client";

/**
 * Section 4.1 Business setup > Go-live / Verification.
 * Docs are uploaded to Azure Blob's private KYC container behind a
 * short-lived SAS URL (see backend Section 4.1 architecture note) —
 * this screen only handles picking the file and posting the resulting URL.
 */
export default function VerificationScreen({ navigation }: any) {
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const pickAndSubmit = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"] });
    if (result.canceled) return;

    setUploading(true);
    try {
      // In production: request a signed Azure Blob upload URL from the
      // backend, PUT the file there, then submit the resulting URL below.
      const docsUrl = "https://kyc-docs.blob.core.windows.net/placeholder.pdf";
      await apiClient.post("/captains/me/submit_verification/", { docs_url: docsUrl });
      setSubmitted(true);
    } catch {
      Alert.alert("Upload failed", "Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Verify your identity</Text>
      <Text style={styles.body}>
        Upload a government ID and, if applicable, your vehicle registration. GoLoc's Admin team
        reviews this before you can go live.
      </Text>

      {submitted ? (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>Submitted — awaiting Admin review</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.button} onPress={pickAndSubmit} disabled={uploading}>
          {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Upload documents</Text>}
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  body: { color: "#475467", fontSize: 14, lineHeight: 20, marginBottom: 28 },
  button: { backgroundColor: "#C2410C", borderRadius: 10, padding: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  pendingBadge: { backgroundColor: "#FEF0C7", borderRadius: 10, padding: 14 },
  pendingText: { color: "#B54708", fontWeight: "600", textAlign: "center" },
});
