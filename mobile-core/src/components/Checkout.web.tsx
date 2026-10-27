import React, { useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import { toast, toastError } from "../ui/feedback";

type Order = { checkout_url: string; result_path: string };
export type PayResult = "success" | "failed" | "cancelled" | "error";

/**
 * Desktop/browser checkout: the payment page opens in a popup window and
 * reports back with postMessage when it finishes (see backend result_page).
 * If the popup is closed without a result, we still refetch — the booking
 * is the source of truth.
 */
export function useCheckout(onDone: (r: PayResult) => void) {
  const [starting, setStarting] = useState(false);
  const popup = useRef<Window | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.goloc === "pay" && !done.current) {
        done.current = true;
        onDone((e.data.status as PayResult) ?? "error");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onDone]);

  const start = async (bookingRef: string) => {
    // Open the window synchronously inside the click, or browsers block it as a popup.
    const win = window.open("", "goloc-pay", "width=480,height=760");
    popup.current = win;
    done.current = false;
    setStarting(true);
    try {
      const order = await api.post<Order>(`/payments/bookings/${bookingRef}/order/`);
      if (win && !win.closed) {
        win.location.href = order.checkout_url;
      } else {
        toast("Allow pop-ups for GoLoc to pay, or pay from the phone app.", "error");
        return;
      }
      const timer = window.setInterval(() => {
        if (popup.current?.closed) {
          window.clearInterval(timer);
          if (!done.current) {
            done.current = true;
            onDone("cancelled");
          }
        }
      }, 800);
    } catch (e) {
      win?.close();
      toastError(e);
    } finally {
      setStarting(false);
    }
  };

  return { start, starting, element: null as React.ReactNode };
}
