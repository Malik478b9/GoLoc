import React, { useState } from "react";
import { ActivityIndicator, Linking, Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { api } from "../api/client";
import { palette } from "../theme";
import { toastError } from "../ui/feedback";
import { Header } from "../ui/layout";

type Order = { checkout_url: string; result_path: string };
export type PayResult = "success" | "failed" | "cancelled" | "error";

/**
 * Opens the server-hosted checkout (Razorpay, or the test page) in a WebView
 * and reports how it ended. The booking itself is the source of truth — the
 * caller refetches it afterwards.
 */
export function useCheckout(onDone: (r: PayResult) => void) {
  const [order, setOrder] = useState<Order | null>(null);
  const [starting, setStarting] = useState(false);

  const start = async (bookingRef: string) => {
    setStarting(true);
    try {
      setOrder(await api.post<Order>(`/payments/bookings/${bookingRef}/order/`));
    } catch (e) {
      toastError(e);
    } finally {
      setStarting(false);
    }
  };

  const finish = (r: PayResult) => {
    setOrder(null);
    onDone(r);
  };

  const element = (
    <Modal visible={!!order} animationType="slide" onRequestClose={() => finish("cancelled")}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }}>
        <Header title="Secure payment" subtitle="Insurance & SOS activate once paid" right={null} />
        {order ? (
          <WebView
            source={{ uri: order.checkout_url }}
            startInLoadingState
            renderLoading={() => (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={palette.rickshaw} />
              </View>
            )}
            onShouldStartLoadWithRequest={(req) => {
              // UPI apps (gpay://, phonepe://, upi://, intent://) must open outside the WebView.
              if (!/^(https?|about|data|blob|javascript):/i.test(req.url)) {
                Linking.openURL(req.url).catch(() => {});
                return false;
              }
              if (req.url.includes(order.result_path)) {
                const status = (req.url.match(/status=(\w+)/)?.[1] ?? "error") as PayResult;
                // Let the result page render for a beat on success, then close.
                setTimeout(() => finish(status), status === "success" ? 900 : 300);
              }
              return true;
            }}
            originWhitelist={["*"]}
            setSupportMultipleWindows={false}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );

  return { start, starting, element };
}
