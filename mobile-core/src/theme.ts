/**
 * GoLoc design tokens. Both apps share the sand/paper ground; each app has
 * its own accent (Traveler: rickshaw green + marigold, Captain: ember).
 */
export const palette = {
  ink: "#0F1E1C",
  ink2: "#3A4845",
  night: "#0A2526",
  night2: "#123634",
  sand: "#F7F1E6",
  sand2: "#EDE3CF",
  paper: "#FFFCF6",
  white: "#FFFFFF",
  muted: "#857A66",
  line: "rgba(15, 30, 28, 0.08)",
  lineStrong: "rgba(15, 30, 28, 0.16)",
  rickshaw: "#1E7A66",
  rickshawSoft: "#DAF0E8",
  marigold: "#F2A93B",
  marigoldSoft: "#FDEDD3",
  ember: "#D9480F",
  emberSoft: "#FFE6D8",
  coral: "#EF5B3F",
  coralSoft: "#FDE3DC",
  success: "#18845A",
  successSoft: "#DCF3E6",
  warning: "#B8670A",
  warningSoft: "#FCEBCF",
  info: "#2563C9",
  infoSoft: "#DDE9FB",
};

/** Gradient stops, top-left → bottom-right. */
export const gradients = {
  traveler: ["#25957C", "#14614F"] as const,
  captain: ["#F26B1D", "#C2360B"] as const,
  night: ["#123E3B", "#0A2526", "#071A1B"] as const,
  sunset: ["#F7B548", "#EF5B3F"] as const,
  dawn: ["#FFF6E6", "#F7F1E6"] as const,
  glassDark: ["rgba(10,37,38,0)", "rgba(10,37,38,0.55)", "rgba(7,26,27,0.92)"] as const,
};

export type Accent = { main: string; soft: string; onMain: string; gradient: readonly [string, string]; glow: string };

export const accents: Record<"traveler" | "captain", Accent> = {
  traveler: { main: palette.rickshaw, soft: palette.rickshawSoft, onMain: palette.white, gradient: gradients.traveler, glow: "rgba(30,122,102,0.35)" },
  captain: { main: palette.ember, soft: palette.emberSoft, onMain: palette.white, gradient: gradients.captain, glow: "rgba(217,72,15,0.35)" },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };

export const fonts = {
  display: "Fraunces_600SemiBold",
  body: "Manrope_400Regular",
  medium: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
};

export const shadow = {
  shadowColor: "#0F1E1C",
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

/** Bigger, softer lift for hero cards and floating bars. */
export const lift = {
  shadowColor: "#0F1E1C",
  shadowOpacity: 0.16,
  shadowRadius: 28,
  shadowOffset: { width: 0, height: 14 },
  elevation: 10,
};

/** One feel for every animation in both apps. */
export const motion = {
  spring: { damping: 16, stiffness: 220, mass: 0.7 },
  springSoft: { damping: 20, stiffness: 140, mass: 0.9 },
  pressScale: 0.96,
  stagger: 55,
};
