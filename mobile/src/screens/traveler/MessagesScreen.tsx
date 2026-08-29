import React, { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { WS_BASE_URL } from "../../api/client";
import { useAuthStore } from "../../store/authStore";

interface ChatMessage {
  message: string;
  sender_id: string;
  sent_at: string;
}

/** Connects to apps.chat.consumers.ChatConsumer — one socket per booking. */
export default function MessagesScreen({ route }: any) {
  const { bookingId } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const ws = useRef<WebSocket | null>(null);
  const currentUserId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    let socket: WebSocket;
    (async () => {
      const token = await AsyncStorage.getItem("access_token");
      socket = new WebSocket(`${WS_BASE_URL}/ws/chat/${bookingId}/?token=${token}`);
      ws.current = socket;
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setMessages((prev) => [...prev, data]);
      };
    })();
    return () => socket?.close();
  }, [bookingId]);

  const send = () => {
    if (!draft.trim()) return;
    ws.current?.send(JSON.stringify({ message: draft }));
    setDraft("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.sender_id === currentUserId ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            <Text style={item.sender_id === currentUserId ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
              {item.message}
            </Text>
          </View>
        )}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            onSubmitEditing={send}
          />
          <TouchableOpacity style={styles.sendButton} onPress={send}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  bubble: { maxWidth: "75%", padding: 10, borderRadius: 12, marginBottom: 8 },
  bubbleMine: { backgroundColor: "#0F766E", alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: "#F1F3F6", alignSelf: "flex-start" },
  bubbleTextMine: { color: "#fff" },
  bubbleTextTheirs: { color: "#101828" },
  inputRow: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "#E6E9EF" },
  input: { flex: 1, borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendButton: { justifyContent: "center", paddingHorizontal: 16 },
  sendButtonText: { color: "#0F766E", fontWeight: "700" },
});
