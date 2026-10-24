import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api } from "./api/client";
import { routeForNotification } from "./components/Inbox";
import { EAS_PROJECT_ID } from "./config";
import { queryClient } from "./query";

type NotificationsModule = typeof import("expo-notifications");

const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let notifications: NotificationsModule | null | undefined;

/**
 * expo-notifications is loaded lazily and never inside Expo Go: Expo Go no
 * longer ships its native part, and importing it there crashes the whole app
 * at startup ("Cannot find native module 'ExpoTopicSubscriptionModule'").
 */
function loadNotifications(): NotificationsModule | null {
  if (notifications !== undefined) return notifications;
  notifications = null;
  if (IN_EXPO_GO) return null;
  try {
    const N: NotificationsModule = require("expo-notifications");
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
    });
    notifications = N;
  } catch {
    notifications = null;
  }
  return notifications;
}

/**
 * Registers this phone for push once signed in, refreshes data when a push
 * lands, and routes notification taps. Push needs a development/production
 * build with an EAS project id; in Expo Go it quietly skips and the in-app
 * inbox (polled) still works.
 */
export function usePushNotifications(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const Notifications = loadNotifications();
    if (!Notifications) return;
    (async () => {
      try {
        if (!Device.isDevice || !EAS_PROJECT_ID) return;
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", { name: "GoLoc", importance: Notifications.AndroidImportance.HIGH });
        }
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== "granted") return;
        const token = (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data;
        await api.post("/notifications/devices/", { expo_token: token, platform: Platform.OS });
      } catch {
        // Push is a nice-to-have; never block the app on it.
      }
    })();

    const received = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ["unread"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((res) => {
      const to = routeForNotification((res.notification.request.content.data ?? {}) as Record<string, string>);
      if (to) router.push(to as any);
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [signedIn]);
}

/**
 * While `active`, sends this phone's location for the booking every ~10 s
 * (or 25 m moved). Used by the Captain trip console and the traveler's live
 * trip screen so each side and the safety team can see the other.
 */
export function useLocationBroadcast(bookingRef: string | undefined, active: boolean) {
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [last, setLast] = useState<Location.LocationObject | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!active || !bookingRef) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setPermission(status === "granted" ? "granted" : "denied");
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 25 },
        (loc) => {
          setLast(loc);
          const now = Date.now();
          if (now - lastSent.current < 8000) return;
          lastSent.current = now;
          api
            .post(`/trips/${bookingRef}/location/`, {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              accuracy: loc.coords.accuracy ? Math.round(loc.coords.accuracy) : null,
              heading: loc.coords.heading,
              speed: loc.coords.speed,
            })
            .catch(() => {});
        },
      );
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [bookingRef, active]);

  return { permission, last };
}

/** Best-effort current position for SOS (falls back to last known, then nothing). */
export async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const known = await Location.getLastKnownPositionAsync();
    const pos = (await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ])) as Location.LocationObject | null;
    const p = pos ?? known;
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
  } catch {
    return null;
  }
}
