import React from "react";
import { Image, ImageStyle, StyleProp } from "react-native";

/**
 * GoLoc logo, two forms (source art lives in /brand at the repo root):
 *   BrandMark   – the pin on its own: small spots, avatars, loaders.
 *   BrandLockup – pin + "GoLoc" wordmark in white, for dark backgrounds (sign-in, headers).
 */
const MARK = require("../../assets/goloc-mark.png");
const LOCKUP_DARK = require("../../assets/goloc-nav-dark.png");
const LOCKUP_RATIO = 1517 / 433; // width / height of goloc-nav-dark.png

export function BrandMark({ size = 40, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={MARK} style={[{ width: size * 0.92, height: size }, style]} resizeMode="contain" accessibilityLabel="GoLoc" />;
}

export function BrandLockup({ height = 44, style }: { height?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={LOCKUP_DARK} style={[{ width: height * LOCKUP_RATIO, height }, style]} resizeMode="contain" accessibilityLabel="GoLoc" />;
}
