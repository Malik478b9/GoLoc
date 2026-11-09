import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, PressableProps, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTx } from "../i18n";
import { fonts, gradients, lift, motion, palette } from "../theme";
import { useAccent } from "./accent";

export { LinearGradient };

const APressable = Animated.createAnimatedComponent(Pressable);

/**
 * A Pressable that springs down a little under the finger. Use it for
 * anything tappable that isn't a Button (cards, tiles, rows).
 */
export function Pressy({
  style,
  scaleTo = motion.pressScale,
  haptic,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; scaleTo?: number; haptic?: boolean; children?: React.ReactNode }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => {
        s.value = withSpring(scaleTo, motion.spring);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, motion.spring);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={[Platform.OS === "web" && ({ cursor: "pointer" } as any), style, a]}
    >
      {children}
    </APressable>
  );
}

/** Slides content up into place on first render. `i` staggers items in a list. */
export function Appear({ i = 0, children, style, delay = 0 }: { i?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay + Math.min(i, 10) * motion.stagger).springify().damping(18).stiffness(160)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Gentle endless bob, for hero icons and decorative shapes. */
export function Float({ children, distance = 6, duration = 2600, delay = 0, style }: { children: React.ReactNode; distance?: number; duration?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [t, delay, duration]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0, 1], [distance, -distance]) }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Soft breathing opacity: skeletons and "live" dots. */
export function Pulse({ children, style, min = 0.45 }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; min?: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withSequence(withTiming(min, { duration: 750 }), withTiming(1, { duration: 750 })), -1);
  }, [o, min]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Rounded gradient surface. `kind="accent"` follows the app's accent. */
export function GradientCard({ kind = "accent", style, children, colors }: { kind?: "accent" | "night" | "sunset"; style?: StyleProp<ViewStyle>; children?: React.ReactNode; colors?: readonly [string, string, ...string[]] }) {
  const accent = useAccent();
  const stops = colors ?? (kind === "accent" ? accent.gradient : gradients[kind]);
  return (
    <LinearGradient colors={stops as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: 24, overflow: "hidden" }, style]}>
      {children}
    </LinearGradient>
  );
}

// ---------------------------------------------------------------- tab bar

type TabEvent = { type: "tabPress" | "tabLongPress"; target: string; canPreventDefault?: boolean };

// expo-router's own tabs pass `emitter` + `navigateToTab(routeKey)`; plain
// React Navigation passes `navigation`. Accept both.
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: any }>;
  emitter?: { emit: (e: TabEvent) => { defaultPrevented?: boolean } };
  navigateToTab?: (routeKey: string) => void;
  navigation?: { emit: (e: TabEvent) => { defaultPrevented?: boolean }; navigate: (name: string) => void };
};

/**
 * Floating pill tab bar for phones. The active tab gets a gradient lozenge
 * that springs between tabs; icons pop when chosen. Use with
 * `<Tabs tabBar={(p) => <FloatingTabBar {...p} />}>`.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, navigation }: TabBarProps) {
  const emit = (e: TabEvent) => (emitter ?? navigation)?.emit(e) ?? {};
  const go = (route: { key: string; name: string }) => (navigateToTab ? navigateToTab(route.key) : navigation?.navigate(route.name));
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const tabW = width / Math.max(count, 1);
  const x = useSharedValue(0);

  useEffect(() => {
    if (tabW) x.value = withSpring(state.index * tabW, motion.spring);
  }, [state.index, tabW, x]);

  const blob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={[tab.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={tab.bar} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 12)}>
        {tabW ? (
          <Animated.View style={[tab.blob, { width: tabW }, blob]}>
            <LinearGradient colors={accent.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={tab.blobFill} />
          </Animated.View>
        ) : null}
        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key];
          const focused = state.index === i;
          const label = options.title ?? route.name;
          const onPress = () => {
            const event = emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              Haptics.selectionAsync().catch(() => {});
              go(route);
            }
          };
          return (
            <TabButton
              key={route.key}
              label={label}
              focused={focused}
              badge={options.tabBarBadge}
              icon={options.tabBarIconName}
              renderIcon={options.tabBarIcon}
              onPress={onPress}
              onLongPress={() => emit({ type: "tabLongPress", target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabButton({ label, focused, badge, icon, renderIcon, onPress, onLongPress }: {
  label: string; focused: boolean; badge?: number | string; icon?: keyof typeof Ionicons.glyphMap;
  renderIcon?: (p: { focused: boolean; color: string; size: number }) => React.ReactNode; onPress: () => void; onLongPress: () => void;
}) {
  const tx = useTx();
  const p = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(focused ? 1 : 0, motion.spring);
  }, [focused, p]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(p.value, [0, 1], [1, 1.12]) }, { translateY: interpolate(p.value, [0, 1], [0, -1]) }] }));
  const color = focused ? palette.white : "rgba(255,255,255,0.55)";
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress} style={tab.item}>
      <Animated.View style={iconStyle}>
        {icon ? <Ionicons name={(focused ? icon : `${icon}-outline`) as any} size={21} color={color} /> : renderIcon?.({ focused, color, size: 21 })}
        {badge ? (
          <View style={tab.badge}>
            <Text style={tab.badgeText}>{typeof badge === "number" && badge > 9 ? "9+" : badge}</Text>
          </View>
        ) : null}
      </Animated.View>
      <Text numberOfLines={1} style={[tab.label, { color, fontFamily: focused ? fonts.bold : fonts.medium }]}>{tx(label)}</Text>
    </Pressable>
  );
}

const tab = StyleSheet.create({
  wrap: { backgroundColor: palette.sand, paddingHorizontal: 14, paddingTop: 6 },
  bar: { flexDirection: "row", backgroundColor: palette.night, borderRadius: 26, padding: 6, ...lift },
  blob: { position: "absolute", top: 6, bottom: 6, left: 6, paddingHorizontal: 2 },
  blobFill: { flex: 1, borderRadius: 20 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 3 },
  label: { fontSize: 10.5, letterSpacing: 0.2 },
  badge: { position: "absolute", top: -5, right: -10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: palette.coral, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: palette.night },
  badgeText: { color: palette.white, fontSize: 9, fontFamily: fonts.bold },
});
