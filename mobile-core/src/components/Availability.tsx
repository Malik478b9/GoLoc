import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import type { CaptainCalendar, DayStatus, WeeklySlot } from "../api/types";
import { isoDate, longDate } from "../format";
import { fonts, palette, radius, space } from "../theme";
import { Row, T } from "../ui/primitives";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** How far ahead travelers can look (matches the booking window). */
const MONTHS_AHEAD = 5;

const LOOK: Record<DayStatus, { bg: string; fg: string; strike?: boolean }> = {
  free: { bg: palette.successSoft, fg: palette.success },
  booked: { bg: palette.coralSoft, fg: palette.coral, strike: true },
  blocked: { bg: palette.sand2, fg: palette.muted, strike: true },
  off: { bg: "transparent", fg: palette.lineStrong },
  past: { bg: "transparent", fg: palette.lineStrong },
};

const hhmm = (t: string) => t.slice(0, 5);

/** "Mon–Sat · 09:00–18:00", or one line per distinct set of hours. */
export function weeklyHours(slots: WeeklySlot[]): string {
  const open = slots.filter((s) => s.is_available).sort((a, b) => a.weekday - b.weekday);
  if (!open.length) return "Not taking trips right now";
  const groups = new Map<string, number[]>();
  for (const s of open) {
    const key = `${hhmm(s.start_time)}–${hhmm(s.end_time)}`;
    groups.set(key, [...(groups.get(key) ?? []), s.weekday]);
  }
  const span = (days: number[]) => {
    const runs: string[] = [];
    let i = 0;
    while (i < days.length) {
      let j = i;
      while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
      runs.push(j - i >= 2 ? `${DAY_NAMES[days[i]]}–${DAY_NAMES[days[j]]}` : days.slice(i, j + 1).map((d) => DAY_NAMES[d]).join(", "));
      i = j + 1;
    }
    return runs.join(", ");
  };
  return [...groups.entries()].map(([hours, days]) => `${span(days)} · ${hours}`).join("\n");
}

/**
 * A Captain's month at a glance, like a shared work calendar: free days in green,
 * fully booked in red, days off greyed. Tap a free day to start a booking on it.
 */
export function CaptainAvailability({ captainId, selected, onPick }: { captainId: string; selected?: string; onPick?: (iso: string) => void }) {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const [offset, setOffset] = useState(0);
  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const from = isoDate(month);

  const cal = useQuery({
    queryKey: ["captain-calendar", captainId, from],
    queryFn: () => api.get<CaptainCalendar>(`/captains/${captainId}/calendar/`, { from, days: daysInMonth }),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
  const status = useMemo(() => new Map((cal.data?.days ?? []).map((d) => [d.date, d.status])), [cal.data]);
  const freeCount = cal.data && cal.data.from === from ? cal.data.days.filter((d) => d.status === "free").length : null;

  const lead = (month.getDay() + 6) % 7; // Monday-first
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDate(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];

  return (
    <View>
      {cal.data?.weekly ? (
        <Row gap={8} style={{ alignItems: "flex-start", marginBottom: space.md }}>
          <Ionicons name="time-outline" size={16} color={palette.ink2} style={{ marginTop: 2 }} />
          <T variant="small" style={{ flex: 1 }}>{weeklyHours(cal.data.weekly)}</T>
        </Row>
      ) : null}
      <Row style={{ justifyContent: "space-between", marginBottom: space.sm }}>
        <Pressable disabled={offset === 0} onPress={() => setOffset(offset - 1)} hitSlop={10} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={offset === 0 ? palette.line : palette.ink} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <T variant="bodyBold">{MONTHS[month.getMonth()]} {month.getFullYear()}</T>
          <T variant="caption" style={{ fontSize: 11 }}>
            {freeCount == null ? " " : freeCount ? `${freeCount} free day${freeCount > 1 ? "s" : ""}` : "No free days this month"}
          </T>
        </View>
        <Pressable disabled={offset >= MONTHS_AHEAD} onPress={() => setOffset(offset + 1)} hitSlop={10} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={offset >= MONTHS_AHEAD ? palette.line : palette.ink} />
        </Pressable>
      </Row>
      <View style={styles.grid}>
        {WEEK.map((d, i) => <Text key={`h${i}`} style={styles.weekHead}>{d}</Text>)}
        {cells.map((iso, i) => {
          if (!iso) return <View key={`e${i}`} style={styles.cell} />;
          const st: DayStatus = status.get(iso) ?? "past";
          const look = LOOK[st];
          const isSel = iso === selected;
          const canPick = st === "free" && !!onPick;
          return (
            <Pressable
              key={iso}
              disabled={!canPick}
              onPress={() => onPick?.(iso)}
              style={styles.cell}
              accessibilityLabel={`${longDate(iso)}: ${st === "free" ? "free" : st === "booked" ? "fully booked" : st === "past" ? "past" : "day off"}`}
            >
              <View style={[styles.day, { backgroundColor: isSel ? palette.success : look.bg }]}>
                <Text style={[styles.dayText, { color: isSel ? palette.white : look.fg }, look.strike && !isSel && styles.strike]}>
                  {Number(iso.slice(8, 10))}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {cal.isFetching && !cal.data ? <ActivityIndicator style={StyleSheet.absoluteFill} color={palette.muted} /> : null}
      </View>
      <Row gap={space.md} style={{ marginTop: space.sm, flexWrap: "wrap" }}>
        {([["free", "Free"], ["booked", "Fully booked"], ["blocked", "Day off"]] as const).map(([k, label]) => (
          <Row key={k} gap={6}>
            <View style={[styles.dot, { backgroundColor: LOOK[k].bg, borderColor: LOOK[k].fg }]} />
            <T variant="caption" style={{ fontSize: 11 }}>{label}</T>
          </Row>
        ))}
      </Row>
      {cal.error ? <T variant="caption" color={palette.coral} style={{ marginTop: 6 }}>Couldn't load the calendar. Pull to refresh.</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekHead: { width: `${100 / 7}%`, textAlign: "center", fontFamily: fonts.bold, fontSize: 12, color: palette.muted, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  dayText: { fontFamily: fonts.bold, fontSize: 14 },
  strike: { textDecorationLine: "line-through" },
  dot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
});
