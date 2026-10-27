import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";

import { palette, radius, space } from "../theme";
import { Button, T, useWide } from "./primitives";

// ---------------------------------------------------------------- toast
type ToastState = { message: string | null; tone: "info" | "success" | "error"; show: (m: string, tone?: "info" | "success" | "error") => void };

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: "info",
  show: (message, tone = "info") => {
    if (tone === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    if (tone === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    set({ message, tone });
  },
}));

export const toast = (m: string, tone?: "info" | "success" | "error") => useToast.getState().show(m, tone);
export const toastError = (e: any) => toast(e?.message || "Something went wrong.", "error");

export function ToastHost() {
  const { message, tone } = useToast();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-120)).current;
  useEffect(() => {
    if (!message) return;
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 18 }).start();
    const t = setTimeout(() => {
      Animated.timing(y, { toValue: -120, duration: 200, useNativeDriver: true }).start(() => useToast.setState({ message: null }));
    }, 2600);
    return () => clearTimeout(t);
  }, [message, y]);
  if (!message) return null;
  const icon = tone === "success" ? "checkmark-circle" : tone === "error" ? "alert-circle" : "information-circle";
  const color = tone === "success" ? palette.success : tone === "error" ? palette.coral : palette.marigold;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { top: insets.top + 8, transform: [{ translateY: y }] }]}>
      <Ionicons name={icon} size={20} color={color} />
      <T variant="bodyBold" color={palette.white} style={{ flex: 1 }}>{message}</T>
    </Animated.View>
  );
}

// ---------------------------------------------------------------- bottom sheet
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <Modal visible={visible} transparent animationType={wide ? "fade" : "slide"} onRequestClose={onClose} statusBarTranslucent>
      {/* iOS doesn't resize for the keyboard inside a Modal, so lift the sheet ourselves. */}
      <KeyboardAvoidingView style={[{ flex: 1 }, wide && styles.dialogWrap]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={wide ? StyleSheet.absoluteFill : styles.backdrop} onPress={onClose}>
          {wide ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(18,33,31,0.45)" }]} /> : null}
        </Pressable>
        {/* Desktop: a centred dialog. Phone: a bottom sheet. */}
        <View style={[styles.sheet, wide ? styles.dialog : { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          {wide ? null : <View style={styles.grabber} />}
          {title ? <T variant="title" style={{ marginBottom: space.md }}>{title}</T> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Confirmation sheet for anything irreversible (cancel, decline, SOS…). */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirm,
  danger,
  loading,
  onConfirm,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirm: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {body ? <T style={{ marginBottom: space.lg }}>{body}</T> : null}
      {children}
      <Button title={confirm} kind={danger ? "danger" : "primary"} loading={loading} onPress={onConfirm} />
      <Button title="Not now" kind="ghost" onPress={onClose} style={{ marginTop: space.sm }} />
    </Sheet>
  );
}

export function Banner({ tone = "info", icon, title, body, children }: { tone?: "info" | "warning" | "success" | "danger"; icon?: keyof typeof Ionicons.glyphMap; title: string; body?: string; children?: React.ReactNode }) {
  const c = {
    info: [palette.infoSoft, palette.info],
    warning: [palette.warningSoft, palette.warning],
    success: [palette.successSoft, palette.success],
    danger: [palette.coralSoft, palette.coral],
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c[0] }]}>
      <Ionicons name={icon ?? (tone === "success" ? "checkmark-circle" : tone === "danger" ? "warning" : "information-circle")} size={20} color={c[1]} />
      <View style={{ flex: 1 }}>
        <T variant="bodyBold" color={c[1]}>{title}</T>
        {body ? <T variant="small" style={{ marginTop: 2 }}>{body}</T> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { position: "absolute", left: space.lg, right: space.lg, zIndex: 1000, backgroundColor: palette.ink, borderRadius: radius.md, padding: space.md, flexDirection: "row", alignItems: "center", gap: space.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(18,33,31,0.45)" },
  sheet: { backgroundColor: palette.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: space.xl, paddingTop: space.md, maxHeight: "88%" },
  dialogWrap: { alignItems: "center", justifyContent: "center", padding: space.xl },
  dialog: { width: "100%", maxWidth: 520, borderRadius: 24, paddingTop: space.xl, paddingBottom: space.xl, maxHeight: "90%" },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: palette.lineStrong, marginBottom: space.lg },
  banner: { flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.md, alignItems: "flex-start" },
});
