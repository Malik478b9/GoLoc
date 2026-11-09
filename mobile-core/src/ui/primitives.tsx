import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewProps,
  ViewStyle,
  useWindowDimensions,
} from "react-native";

import type { BookingStatus } from "../api/types";
import { initials, STATUS_STYLE } from "../format";
import { fonts, palette, radius, shadow, space } from "../theme";
import { useTx } from "../i18n";
import { useAccent } from "./accent";
import { Pressy } from "./motion";

export { AccentContext, useAccent } from "./accent";

/** Desktop/tablet layout (sidebar, centred content, dialogs instead of bottom sheets). */
export const WIDE_BREAKPOINT = 900;
export const MAX_CONTENT_WIDTH = 1120;
export const useWide = () => useWindowDimensions().width >= WIDE_BREAKPOINT;

// ---------------------------------------------------------------- text
type Variant = "hero" | "display" | "title" | "h2" | "body" | "bodyBold" | "caption" | "label" | "small";
const TEXT: Record<Variant, TextStyle> = {
  hero: { fontFamily: fonts.display, fontSize: 31, lineHeight: 38, letterSpacing: -0.8, color: palette.ink },
  display: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.6, color: palette.ink },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: palette.ink },
  h2: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23, letterSpacing: -0.2, color: palette.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: palette.ink2 },
  bodyBold: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: palette.ink },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: palette.muted },
  label: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: 1, textTransform: "uppercase", color: palette.muted },
  small: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, color: palette.ink2 },
};

export function T({ variant = "body", style, color, center, children, ...rest }: TextProps & { variant?: Variant; color?: string; center?: boolean }) {
  // Plain English text is shown in the person's chosen language when we have it.
  const tx = useTx();
  return <Text {...rest} style={[TEXT[variant], color ? { color } : null, center && { textAlign: "center" }, style]}>{tx(children)}</Text>;
}

// ---------------------------------------------------------------- layout
export const Row = ({ style, gap = space.sm, ...rest }: ViewProps & { gap?: number }) => (
  <View {...rest} style={[{ flexDirection: "row", alignItems: "center", gap }, style]} />
);
export const Spacer = ({ h = space.md, w }: { h?: number; w?: number }) => <View style={{ height: w ? undefined : h, width: w }} />;
export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: palette.lineStrong }, style]} />
);

export function Card({ style, children, onPress, padded = true, ...rest }: ViewProps & { onPress?: () => void; padded?: boolean }) {
  const content = <View style={[styles.card, padded && { padding: space.lg }, style]} {...rest}>{children}</View>;
  if (!onPress) return content;
  return <Pressy onPress={onPress} scaleTo={0.98}>{content}</Pressy>;
}

// ---------------------------------------------------------------- buttons
type BtnKind = "primary" | "secondary" | "ghost" | "danger" | "dark";
export function Button({
  title,
  onPress,
  kind = "primary",
  loading,
  disabled,
  icon,
  small,
  style,
  haptic = true,
}: {
  title: string;
  onPress?: () => void;
  kind?: BtnKind;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}) {
  const accent = useAccent();
  const tx = useTx();
  const bg = { primary: accent.main, secondary: palette.white, ghost: "transparent", danger: palette.coral, dark: palette.night }[kind];
  const fg = { primary: accent.onMain, secondary: palette.ink, ghost: accent.main, danger: palette.white, dark: palette.white }[kind];
  const off = disabled || loading;
  const filled = kind === "primary" || kind === "danger";
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={[
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg },
        kind === "secondary" && styles.btnSecondary,
        filled && !off && { shadowColor: kind === "danger" ? palette.coral : accent.main, shadowOpacity: 0.32, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {kind === "primary" ? (
        <LinearGradient colors={accent.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: small ? radius.sm : radius.md }]} />
      ) : null}
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Row gap={7} style={{ justifyContent: "center" }}>
          {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
          <Text style={[styles.btnText, small && { fontSize: 13 }, { color: fg }]}>{tx(title)}</Text>
        </Row>
      )}
    </Pressy>
  );
}

export function IconButton({
  name,
  onPress,
  color = palette.ink,
  bg = palette.white,
  size = 20,
  badge,
  style,
  ...rest
}: Omit<PressableProps, "style"> & { name: keyof typeof Ionicons.glyphMap; color?: string; bg?: string; size?: number; badge?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressy hitSlop={8} onPress={onPress} scaleTo={0.88} style={[styles.iconBtn, { backgroundColor: bg }, bg === palette.white && styles.iconBtnLift, style]} {...rest}>
      <Ionicons name={name} size={size} color={color} />
      {!!badge && (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeDotText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </Pressy>
  );
}

// ---------------------------------------------------------------- chips & badges
export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const accent = useAccent();
  const tx = useTx();
  return (
    <Pressy onPress={onPress} haptic scaleTo={0.93} style={[styles.chip, active && { borderColor: "transparent" }]}>
      {active ? <LinearGradient colors={accent.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
      <Row gap={5}>
        {icon && <Ionicons name={icon} size={14} color={active ? accent.onMain : palette.ink2} />}
        <Text style={[styles.chipText, active && { color: accent.onMain, fontFamily: fonts.bold }]}>{tx(label)}</Text>
      </Row>
    </Pressy>
  );
}

export function Badge({ label, bg = palette.sand2, fg = palette.ink2, icon }: { label: string; bg?: string; fg?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const tx = useTx();
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={11} color={fg} />}
      <Text style={[styles.badgeText, { color: fg }]}>{tx(label)}</Text>
    </View>
  );
}

export const StatusBadge = ({ status }: { status: BookingStatus }) => {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.expired;
  return <Badge label={s.label} bg={s.bg} fg={s.fg} />;
};

export function Avatar({ uri, name, size = 44, verified, ring }: { uri?: string | null; name: string; size?: number; verified?: boolean; ring?: boolean }) {
  const accent = useAccent();
  const inner = ring ? size - 6 : size;
  const face = uri ? (
    <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} contentFit="cover" transition={200} cachePolicy="memory-disk" />
  ) : (
    <LinearGradient colors={[accent.soft, palette.white]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: inner, height: inner, borderRadius: inner / 2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: fonts.bold, color: accent.main, fontSize: inner * 0.36 }}>{initials(name)}</Text>
    </LinearGradient>
  );
  return (
    <View>
      {ring ? (
        <LinearGradient colors={[palette.marigold, accent.main]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
          <View style={{ padding: 2, borderRadius: size, backgroundColor: palette.paper }}>{face}</View>
        </LinearGradient>
      ) : face}
      {verified && (
        <View style={[styles.verified, { width: size * 0.36, height: size * 0.36, borderRadius: size }]}>
          <Ionicons name="checkmark" size={size * 0.22} color={palette.white} />
        </View>
      )}
    </View>
  );
}

export const Rating = ({ value, count, light }: { value: string | number; count?: number; light?: boolean }) => (
  <Row gap={3}>
    <Ionicons name="star" size={13} color={palette.marigold} />
    <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: light ? palette.white : palette.ink }}>
      {Number(value) > 0 ? Number(value).toFixed(1) : "New"}
    </Text>
    {count != null && count > 0 && <Text style={{ fontFamily: fonts.body, fontSize: 12, color: light ? "#ffffffcc" : palette.muted }}>({count})</Text>}
  </Row>
);

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <View style={styles.stat}>
      <T variant="label">{label}</T>
      <T variant="title" style={{ marginTop: 6 }}>{value}</T>
      {hint ? <T variant="small" color={tone === "good" ? palette.success : tone === "bad" ? palette.coral : palette.muted} style={{ marginTop: 2 }}>{hint}</T> : null}
    </View>
  );
}

export function ListItem({
  icon,
  title,
  subtitle,
  onPress,
  right,
  danger,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  const accent = useAccent();
  return (
    <Pressable onPress={onPress} style={(s: any) => [styles.listItem, (s.pressed || s.hovered) && onPress && { backgroundColor: palette.sand }]}>
      {icon && (
        <View style={[styles.listIcon, { backgroundColor: danger ? palette.coralSoft : accent.soft }]}>
          <Ionicons name={icon} size={18} color={danger ? palette.coral : accent.main} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T variant="bodyBold" color={danger ? palette.coral : undefined}>{title}</T>
        {subtitle ? <T variant="caption" numberOfLines={2}>{subtitle}</T> : null}
      </View>
      {right ?? (onPress ? (
        <View style={styles.listChevron}><Ionicons name="chevron-forward" size={17} color={palette.muted} /></View>
      ) : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.paper, borderRadius: radius.xl, ...shadow },
  btn: { minHeight: 54, borderRadius: radius.md, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "center", overflow: "visible" },
  btnSmall: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.sm },
  btnSecondary: { borderWidth: 1, borderColor: palette.lineStrong },
  btnText: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.1 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  iconBtnLift: { ...shadow, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  badgeDot: { position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: palette.coral, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: palette.white },
  badgeDotText: { color: palette.white, fontSize: 9.5, fontFamily: fonts.bold },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, overflow: "hidden" },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: palette.ink2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  badgeText: { fontFamily: fonts.bold, fontSize: 11 },
  verified: { position: "absolute", right: -2, bottom: -2, backgroundColor: palette.success, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: palette.paper },
  stat: { flex: 1, minWidth: 140, backgroundColor: palette.paper, borderRadius: radius.lg, padding: space.lg, ...shadow },
  listItem: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 16, paddingHorizontal: space.lg },
  listIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  listChevron: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
});
