import type { BookingStatus } from "./api/types";
import { palette } from "./theme";

const inr = new Intl.NumberFormat("en-IN");

export const money = (n: number | null | undefined) => (n == null ? "—" : `₹${inr.format(Math.round(n))}`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-08-14" → Date at local midnight (avoids the UTC off-by-one of new Date("2026-08-14")). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const shortDate = (iso: string) => {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export const longDate = (iso: string) => {
  const d = parseDate(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const dateRange = (start: string, end: string) => (start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`);

export const time12 = (hhmm: string | null | undefined) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
};

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return shortDate(iso);
}

export function timeLeft(iso: string | null): string {
  if (!iso) return "";
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (s <= 0) return "expired";
  if (s < 3600) return `${Math.ceil(s / 60)} min left`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m left`;
  return `${Math.floor(s / 86400)}d left`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "G";

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const STATUS_STYLE: Record<BookingStatus, { bg: string; fg: string; label: string }> = {
  requested: { bg: palette.infoSoft, fg: palette.info, label: "Requested" },
  accepted: { bg: palette.warningSoft, fg: palette.warning, label: "Awaiting payment" },
  confirmed: { bg: palette.successSoft, fg: palette.success, label: "Confirmed" },
  in_progress: { bg: palette.rickshawSoft, fg: palette.rickshaw, label: "In progress" },
  completed: { bg: palette.sand2, fg: palette.ink2, label: "Completed" },
  declined: { bg: palette.coralSoft, fg: palette.coral, label: "Declined" },
  cancelled: { bg: palette.coralSoft, fg: palette.coral, label: "Cancelled" },
  expired: { bg: palette.sand2, fg: palette.muted, label: "Expired" },
};

export const CATEGORY_ICON: Record<string, string> = {
  food: "restaurant",
  heritage: "business",
  culture: "color-palette",
  nature: "leaf",
  adventure: "trail-sign",
  photography: "camera",
  shopping: "bag-handle",
  spiritual: "flower",
  nightlife: "moon",
  family: "people",
  wildlife: "paw",
  trekking: "walk",
  transport: "car",
};

export const TIER_LABEL: Record<string, string> = { standard: "Standard", normal: "Normal", medium: "Medium", lavish: "Lavish" };
