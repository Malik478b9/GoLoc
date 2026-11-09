import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, ScrollViewProps, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, palette, space } from "../theme";
import { Float, Pulse } from "./motion";
import { Button, IconButton, T, useAccent } from "./primitives";
import { keyboardBehavior } from "./keyboard";

export function Header({ title, subtitle, back = true, right }: { title?: string; subtitle?: string; back?: boolean; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      {back ? <IconButton name="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityLabel="Back" /> : <View style={{ width: 4 }} />}
      <View style={{ flex: 1 }}>
        {title ? <T variant="title" style={{ fontSize: 22, lineHeight: 28 }} numberOfLines={1}>{title}</T> : null}
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardBehavior}>
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

export function Section({ title, subtitle, action, onAction, children, style }: { title: string; subtitle?: string; action?: string; onAction?: () => void; children: React.ReactNode; style?: any }) {
  const accent = useAccent();
  return (
    <View style={[{ marginTop: space.xxl + space.sm }, style]}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <T variant="title" style={{ fontSize: 20, lineHeight: 26 }}>{title}</T>
          {subtitle ? <T variant="caption" style={{ marginTop: 2 }}>{subtitle}</T> : null}
        </View>
        {action ? (
          <Pressable onPress={onAction} hitSlop={10} style={styles.sectionAction}>
            <T variant="small" color={accent.main} style={{ fontFamily: fonts.bold }}>{action}</T>
            <Ionicons name="chevron-forward" size={14} color={accent.main} />
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
      <Float distance={5}>
        <View style={[styles.emptyIcon, { backgroundColor: accent.soft }]}>
          <Ionicons name={icon} size={30} color={accent.main} />
        </View>
      </Float>
      <T variant="h2" center style={{ marginTop: space.md }}>{title}</T>
      {body ? <T variant="caption" center style={{ marginTop: 4, maxWidth: 280 }}>{body}</T> : null}
      {action ? <Button title={action} small onPress={onAction} style={{ marginTop: space.lg }} /> : null}
    </View>
  );
}

export function Skeleton({ h = 16, w = "100%", r = 8, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: any }) {
  return <Pulse style={[{ height: h, width: w, borderRadius: r, backgroundColor: palette.sand2 }, style]} />;
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
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, minHeight: 64 },
  pad: { paddingHorizontal: space.xl, paddingTop: space.md },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, backgroundColor: palette.paper, shadowColor: palette.ink, shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: -6 }, elevation: 8 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: space.lg, gap: space.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 },
});

/** Actual rendered width of a container (grids on desktop can't use the window width). */
export function useMeasuredWidth(initial: number): [number, (e: { nativeEvent: { layout: { width: number } } }) => void] {
  const [width, setWidth] = useState(initial);
  return [width, (e) => setWidth((w) => (Math.abs(w - e.nativeEvent.layout.width) > 1 ? e.nativeEvent.layout.width : w))];
}
