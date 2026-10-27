import { ItinerarySummary, palette } from "@goloc/core";

export const STATUS_BADGE: Record<ItinerarySummary["status"], { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: palette.sand2, fg: palette.ink2 },
  generating: { label: "AI is writing…", bg: palette.infoSoft, fg: palette.info },
  ready: { label: "Ready", bg: palette.successSoft, fg: palette.success },
  failed: { label: "Needs a retry", bg: palette.coralSoft, fg: palette.coral },
};

export const TRAVEL_MODES = ["flight", "train", "bus", "road"] as const;

/** Text box (one item per line) ⇄ list. */
export const toLines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);
export const fromLines = (v?: string[]) => (v ?? []).join("\n");
