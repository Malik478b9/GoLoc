import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React, { createContext, useContext } from "react";
import {
  ActivityIndicator,
  Platform,
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
import { Accent, accents, fonts, palette, radius, shadow, space } from "../theme";

export const AccentContext = createContext<Accent>(accents.traveler);

/** Desktop/tablet layout (sidebar, centred content, dialogs instead of bottom sheets). */
export const WIDE_BREAKPOINT = 900;
export const MAX_CONTENT_WIDTH = 1120;
export const useWide = () => useWindowDimensions().width >= WIDE_BREAKPOINT;
export const useAccent = () => useContext(AccentContext);

// ---------------------------------------------------------------- text
type Variant = "display" | "title" | "h2" | "body" | "bodyBold" | "caption" | "label" | "small";
const TEXT: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: palette.ink },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.2, color: palette.ink },
  h2: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23, color: palette.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: palette.ink2 },
  bodyBold: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: palette.ink },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: palette.muted },
  label: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8, textTransform: "uppercase", color: palette.muted },
  small: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: palette.ink2 },
};

export function T({ variant = "body", style, color, center, ...rest }: TextProps & { variant?: Variant; color?: string; center?: boolean }) {
  return <Text {...rest} style={[TEXT[variant], color ? { color } : null, center && { textAlign: "center" }, style]} />;
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
  return (
    <Pressable onPress={onPress} style={(s: any) => [s.hovered && { opacity: 0.94 }, s.pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] }]}>
      {content}
    </Pressable>
  );
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
  const bg = { primary: accent.main, secondary: palette.white, ghost: "transparent", danger: palette.coral, dark: palette.ink }[kind];
  const fg = { primary: accent.onMain, secondary: palette.ink, ghost: accent.main, danger: palette.white, dark: palette.white }[kind];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={(s: any) => [
        styles.btn,
        Platform.OS === "web" && ({ cursor: off ? "not-allowed" : "pointer" } as any),
        small && styles.btnSmall,
        { backgroundColor: bg },
        kind === "secondary" && { borderWidth: 1, borderColor: palette.lineStrong },
        s.hovered && !off && { opacity: 0.9 },
        s.pressed && { opacity: 0.85 },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Row gap={6} style={{ justifyContent: "center" }}>
          {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
          <Text style={[styles.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
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
}: PressableProps & { name: keyof typeof Ionicons.glyphMap; color?: string; bg?: string; size?: number; badge?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg }, pressed && { opacity: 0.7 }, style]} {...rest}>
      <Ionicons name={name} size={size} color={color} />
      {!!badge && (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeDotText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- chips & badges
export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const accent = useAccent();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? { backgroundColor: accent.main, borderColor: accent.main } : null]}
    >
      <Row gap={5}>
        {icon && <Ionicons name={icon} size={14} color={active ? accent.onMain : palette.ink2} />}
        <Text style={[styles.chipText, active && { color: accent.onMain }]}>{label}</Text>
      </Row>
    </Pressable>
  );
}

export function Badge({ label, bg = palette.sand2, fg = palette.ink2, icon }: { label: string; bg?: string; fg?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={11} color={fg} />}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export const StatusBadge = ({ status }: { status: BookingStatus }) => {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.expired;
  return <Badge label={s.label} bg={s.bg} fg={s.fg} />;
};

export function Avatar({ uri, name, size = 44, verified }: { uri?: string | null; name: string; size?: number; verified?: boolean }) {
  const accent = useAccent();
  return (
    <View>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={150} cachePolicy="memory-disk" />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: accent.soft, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.bold, color: accent.main, fontSize: size * 0.36 }}>{initials(name)}</Text>
        </View>
      )}
      {verified && (
        <View style={[styles.verified, { width: size * 0.36, height: size * 0.36, borderRadius: size }]}>
          <Ionicons name="checkmark" size={size * 0.24} color={palette.white} />
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
      <T variant="caption">{label}</T>
      <T variant="title" style={{ marginTop: 4 }}>{value}</T>
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
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={palette.muted} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.paper, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line, ...shadow },
  btn: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "center" },
  btnSmall: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.sm },
  btnText: { fontFamily: fonts.bold, fontSize: 15 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badgeDot: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: palette.coral, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeDotText: { color: palette.white, fontSize: 10, fontFamily: fonts.bold },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: palette.ink2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" },
  badgeText: { fontFamily: fonts.bold, fontSize: 11 },
  verified: { position: "absolute", right: -2, bottom: -2, backgroundColor: palette.rickshaw, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: palette.paper },
  stat: { flex: 1, minWidth: 140, backgroundColor: palette.paper, borderRadius: radius.md, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  listItem: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 14, paddingHorizontal: space.lg },
  listIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
