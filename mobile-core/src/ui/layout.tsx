import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, ScrollViewProps, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, palette, space } from "../theme";
import { Button, IconButton, T, useAccent } from "./primitives";

export function Header({ title, subtitle, back = true, right }: { title?: string; subtitle?: string; back?: boolean; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      {back ? <IconButton name="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityLabel="Back" /> : <View style={{ width: 4 }} />}
      <View style={{ flex: 1 }}>
        {title ? <T variant="h2" numberOfLines={1}>{title}</T> : null}
        {subtitle ? <T variant="caption" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * Standard page: safe area + optional header + scroll with pull-to-refresh.
 * `footer` sticks to the bottom above the home indicator (primary actions).
 */
export function Screen({
  title,
  subtitle,
  back = true,
  headerRight,
  children,
  onRefresh,
  scroll = true,
  footer,
  padded = true,
  noHeader,
  contentStyle,
  ...scrollProps
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  onRefresh?: () => Promise<unknown>;
  scroll?: boolean;
  footer?: React.ReactNode;
  padded?: boolean;
  noHeader?: boolean;
  contentStyle?: any;
} & ScrollViewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {!noHeader && (title || back) ? <Header title={title} subtitle={subtitle} back={back} right={headerRight} /> : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[padded && styles.pad, { paddingBottom: footer ? space.lg : insets.bottom + space.xxl }, contentStyle]}
            refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent.main} colors={[accent.main]} /> : undefined}
            {...scrollProps}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, padded && styles.pad, contentStyle]}>{children}</View>
        )}
        {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Section({ title, action, onAction, children, style }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode; style?: any }) {
  const accent = useAccent();
  return (
    <View style={[{ marginTop: space.xl }, style]}>
      <View style={styles.sectionHead}>
        <T variant="h2">{title}</T>
        {action ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <T variant="small" color={accent.main} style={{ fontFamily: fonts.bold }}>{action}</T>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const accent = useAccent();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={accent.main} />
      {label ? <T variant="caption" style={{ marginTop: space.sm }}>{label}</T> : null}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: any; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={palette.muted} />
      <T variant="bodyBold" center style={{ marginTop: space.md }}>{error?.message || "Something went wrong."}</T>
      {onRetry ? <Button title="Try again" kind="secondary" small onPress={onRetry} style={{ marginTop: space.lg }} /> : null}
    </View>
  );
}

export function Empty({ icon = "sparkles-outline", title, body, action, onAction }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body?: string; action?: string; onAction?: () => void }) {
  const accent = useAccent();
  return (
    <View style={[styles.center, { paddingVertical: 48 }]}>
      <View style={[styles.emptyIcon, { backgroundColor: accent.soft }]}>
        <Ionicons name={icon} size={28} color={accent.main} />
      </View>
      <T variant="h2" center style={{ marginTop: space.md }}>{title}</T>
      {body ? <T variant="caption" center style={{ marginTop: 4, maxWidth: 280 }}>{body}</T> : null}
      {action ? <Button title={action} small onPress={onAction} style={{ marginTop: space.lg }} /> : null}
    </View>
  );
}

export function Skeleton({ h = 16, w = "100%", r = 8, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: any }) {
  return <View style={[{ height: h, width: w, borderRadius: r, backgroundColor: palette.sand2 }, style]} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: space.md }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
          <Skeleton h={52} w={52} r={26} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton w="70%" />
            <Skeleton w="45%" h={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sand },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 56 },
  pad: { paddingHorizontal: space.lg, paddingTop: space.sm },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: palette.sand, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});
