/**
 * GoLoc design tokens, taken from the logo (same theme as goloc.in).
 * Both apps share a light blue-grey ground and navy text; each app has its own
 * accent (Traveler: brand blue, Captain: brand teal).
 */
export const palette = {
  ink: "#01245A",
  ink2: "#42536E",
  night: "#01245A",
  night2: "#00487F",
  sand: "#F4F7FB",
  sand2: "#E6EDF5",
  paper: "#FFFFFF",
  white: "#FFFFFF",
  muted: "#6B7A90",
  line: "rgba(1, 36, 90, 0.08)",
  lineStrong: "rgba(1, 36, 90, 0.16)",
  /** Text on navy surfaces. */
  onDark: "#E3ECF7",
  onDarkMuted: "#A9BCD6",
  // Traveler accent (brand blue). Name kept from the first palette.
  rickshaw: "#0047B6",
  rickshawSoft: "#E6EFFB",
  // Highlights on dark, star ratings (logo sun).
  marigold: "#FFB21A",
  marigoldSoft: "#FFF3DC",
  // Captain accent (brand teal).
  ember: "#007F99",
  emberSoft: "#E3F5F6",
  teal: "#03C7C3",
  mint: "#07DECC",
  sun: "#FE7902",
  coral: "#E5484D",
  coralSoft: "#FDECEC",
  success: "#0E9F6E",
  successSoft: "#E3F6EE",
  warning: "#C2620A",
  warningSoft: "#FFF1E4",
  info: "#0047B6",
  infoSoft: "#E6EFFB",
};

/** Gradient stops, top-left → bottom-right. Colours come from the GoLoc logo. */
export const gradients = {
  traveler: ["#0B63E0", "#0047B6"] as const,
  captain: ["#03B5B8", "#007F99"] as const,
  night: ["#01306F", "#01245A", "#011A42"] as const,
  sunset: ["#FFB21A", "#FE7902"] as const,
  dawn: ["#F7FBFF", "#F4F7FB"] as const,
  glassDark: ["rgba(1,36,90,0)", "rgba(1,36,90,0.55)", "rgba(1,26,66,0.92)"] as const,
};

export type Accent = { main: string; soft: string; onMain: string; gradient: readonly [string, string]; glow: string };

export const accents: Record<"traveler" | "captain", Accent> = {
  traveler: { main: palette.rickshaw, soft: palette.rickshawSoft, onMain: palette.white, gradient: gradients.traveler, glow: "rgba(0,71,182,0.30)" },
  captain: { main: palette.ember, soft: palette.emberSoft, onMain: palette.white, gradient: gradients.captain, glow: "rgba(0,127,153,0.30)" },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

export const fonts = {
  display: "PlusJakartaSans_800ExtraBold",
  body: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
};

export const shadow = {
  shadowColor: "#01245A",
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

/** Bigger, softer lift for hero cards and floating bars. */
export const lift = {
  shadowColor: "#01245A",
  shadowOpacity: 0.14,
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
