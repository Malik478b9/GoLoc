/**
 * GoLoc design tokens. Both apps share the sand/paper ground; each app has
 * its own accent (Traveler: marigold + rickshaw green, Captain: ember).
 */
export const palette = {
  ink: "#12211F",
  ink2: "#3D4A47",
  night: "#0E2B2C",
  night2: "#153A38",
  sand: "#F6EFE1",
  sand2: "#EFE4CE",
  paper: "#FBF8F1",
  white: "#FFFFFF",
  muted: "#8A7F6B",
  line: "rgba(18, 33, 31, 0.10)",
  lineStrong: "rgba(18, 33, 31, 0.18)",
  rickshaw: "#2F7A6B",
  rickshawSoft: "#DCEDE7",
  marigold: "#E8A33D",
  marigoldSoft: "#FBEBD0",
  ember: "#C2410C",
  emberSoft: "#FDE5D6",
  coral: "#E15B3F",
  coralSoft: "#FBE1DB",
  success: "#1F7A4D",
  successSoft: "#DDF1E5",
  warning: "#B5650B",
  warningSoft: "#FBEBD0",
  info: "#1F5FAD",
  infoSoft: "#DCE9F8",
};

export type Accent = { main: string; soft: string; onMain: string };

export const accents: Record<"traveler" | "captain", Accent> = {
  traveler: { main: palette.rickshaw, soft: palette.rickshawSoft, onMain: palette.white },
  captain: { main: palette.ember, soft: palette.emberSoft, onMain: palette.white },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };

export const fonts = {
  display: "Fraunces_600SemiBold",
  body: "Manrope_400Regular",
  medium: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
};

export const shadow = {
  shadowColor: "#12211F",
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};
