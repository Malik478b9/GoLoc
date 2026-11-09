import { BrandLockup, fonts, gradients, LinearGradient, palette, space, T } from "@goloc/core";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

const HOLD_MS = 2200;

/**
 * Opening screen: the GoLoc logo and our promise, then it fades into the app.
 * The native splash uses the same navy, so the hand-over is seamless.
 */
export function IntroSplash() {
  const [done, setDone] = useState(false);
  const logo = useSharedValue(0);
  const line1 = useSharedValue(0);
  const line2 = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    const ease = { duration: 600, easing: Easing.out(Easing.cubic) };
    logo.value = withTiming(1, ease);
    line1.value = withDelay(350, withTiming(1, ease));
    line2.value = withDelay(800, withTiming(1, ease));
    fade.value = withDelay(HOLD_MS, withTiming(0, { duration: 450 }, (ok) => {
      if (ok) runOnJS(setDone)(true);
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const useRise = (v: typeof logo) =>
    useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 14 }] }));
  const logoStyle = useRise(logo);
  const line1Style = useRise(line1);
  const line2Style = useRise(line2);
  const wrapStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (done) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, wrapStyle]} pointerEvents="none">
      <LinearGradient colors={gradients.night as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        <Animated.View style={logoStyle}>
          <BrandLockup height={56} />
        </Animated.View>
        <Animated.View style={[{ marginTop: space.xxl + space.md }, line1Style]}>
          <T style={styles.quote} center>Travel like a local.</T>
        </Animated.View>
        <Animated.View style={[{ marginTop: space.sm }, line2Style]}>
          <T style={styles.sub} center>With a local. Not like a tourist.</T>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 100, backgroundColor: palette.night },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  quote: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: palette.white },
  sub: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 24, color: palette.onDarkMuted },
});
