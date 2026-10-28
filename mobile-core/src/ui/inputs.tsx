import { Ionicons } from "@expo/vector-icons";
import React, { forwardRef, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, TextInputProps, View } from "react-native";

import { addDays, isoDate, longDate, shortDate, tripDays } from "../format";
import { fonts, palette, radius, space } from "../theme";
import { Sheet } from "./feedback";
import { Row, T, useAccent } from "./primitives";

export type FieldProps = TextInputProps & { label?: string; error?: string; hint?: string; prefix?: string; labelRight?: React.ReactNode };

export const Field = forwardRef<React.ComponentRef<typeof TextInput>, FieldProps>(
  function Field({ label, error, hint, prefix, style, multiline, labelRight, ...rest }, ref) {
    const [focused, setFocused] = useState(false);
    const accent = useAccent();
    return (
      <View style={{ marginBottom: space.md }}>
        {label || labelRight ? (
          <Row style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <T variant="small" style={{ fontFamily: fonts.bold, flex: 1 }}>{label}</T>
            {labelRight}
          </Row>
        ) : null}
        <View style={[styles.box, focused && { borderColor: accent.main }, !!error && { borderColor: palette.coral }, multiline && { alignItems: "flex-start" }]}>
          {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
          <TextInput
            ref={ref}
            placeholderTextColor={palette.muted}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            multiline={multiline}
            style={[styles.input, multiline && { minHeight: 96, textAlignVertical: "top", paddingTop: 14 }, style]}
            {...rest}
          />
        </View>
        {error ? <T variant="small" color={palette.coral} style={{ marginTop: 4 }}>{error}</T> : hint ? <T variant="caption" style={{ marginTop: 4 }}>{hint}</T> : null}
      </View>
    );
  },
);

export function Stepper({ value, onChange, min = 1, max = 20, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label?: string }) {
  const accent = useAccent();
  const btn = (icon: "remove" | "add", disabled: boolean, next: number) => (
    <Pressable disabled={disabled} onPress={() => onChange(next)} style={[styles.stepBtn, { borderColor: disabled ? palette.line : accent.main }]} hitSlop={6}>
      <Ionicons name={icon} size={18} color={disabled ? palette.muted : accent.main} />
    </Pressable>
  );
  return (
    <Row style={{ justifyContent: "space-between" }}>
      {label ? <T variant="bodyBold">{label}</T> : <View />}
      <Row gap={14}>
        {btn("remove", value <= min, value - 1)}
        <T variant="h2" style={{ minWidth: 24, textAlign: "center" }}>{value}</T>
        {btn("add", value >= max, value + 1)}
      </Row>
    </Row>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string; count?: number }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, active && styles.segActive]}>
            <Text style={[styles.segText, active && { color: palette.ink }]}>
              {o.label}
              {o.count ? ` · ${o.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const accent = useAccent();
  return (
    <Row style={{ justifyContent: "space-between", paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <T variant="bodyBold">{label}</T>
        {hint ? <T variant="caption">{hint}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: accent.main, false: palette.lineStrong }} thumbColor={palette.white} />
    </Row>
  );
}

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type DayLook = { off: boolean; edge: boolean; inside: boolean };

/** One month at a time, Monday first. Shared by the single-date and range pickers. */
function MonthGrid({ minDate, maxDays, disabled, look, onPick, footer }: {
  minDate?: Date; maxDays: number; disabled: Set<string>; look: (iso: string) => Omit<DayLook, "off">; onPick: (iso: string) => void; footer?: React.ReactNode;
}) {
  const accent = useAccent();
  const today = useMemo(() => {
    const d = minDate ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, [minDate]);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const last = new Date(today.getTime() + maxDays * 86400000);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  const canPrev = cursor > new Date(today.getFullYear(), today.getMonth(), 1);
  const canNext = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) <= last;

  return (
    <View>
      <Row style={{ justifyContent: "space-between", marginBottom: space.sm }}>
        <Pressable disabled={!canPrev} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={canPrev ? palette.ink : palette.line} />
        </Pressable>
        <T variant="bodyBold">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</T>
        <Pressable disabled={!canNext} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} hitSlop={10}>
          <Ionicons name="chevron-forward" size={20} color={canNext ? palette.ink : palette.line} />
        </Pressable>
      </Row>
      <View style={styles.grid}>
        {WEEK.map((d, i) => (
          <Text key={`h${i}`} style={styles.weekHead}>{d}</Text>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.cell} />;
          const iso = isoDate(d);
          const off = d < today || d > last || disabled.has(iso);
          const { edge, inside } = look(iso);
          return (
            <Pressable key={iso} disabled={off} onPress={() => onPick(iso)} style={[styles.cell, inside && { backgroundColor: accent.soft }]}>
              <View style={[styles.day, edge && { backgroundColor: accent.main }]}>
                <Text style={[styles.dayText, off && styles.dayOff, edge && { color: accent.onMain, fontFamily: fonts.bold }]}>{d.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {disabled.size ? <T variant="caption" style={{ marginTop: 6 }}>Greyed-out dates are unavailable.</T> : null}
      {footer}
    </View>
  );
}

/** Month calendar. `disabled` = ISO dates that can't be picked (booked / blocked). */
export function Calendar({ value, onChange, disabled = [], minDate, maxDays = 180 }: { value?: string; onChange: (iso: string) => void; disabled?: string[]; minDate?: Date; maxDays?: number }) {
  const blocked = useMemo(() => new Set(disabled), [disabled]);
  return <MonthGrid minDate={minDate} maxDays={maxDays} disabled={blocked} look={(iso) => ({ edge: iso === value, inside: false })} onPick={onChange} />;
}

/**
 * The nearest trips of the same length with every day free, nearest first.
 * `blocked` = days that can't be booked; searches up to `window` days either side.
 */
export function nearestFreeRanges(blocked: Set<string>, start: string, days: number, { count = 3, window = 60, earliest, latest }: { count?: number; window?: number; earliest: string; latest: string }) {
  const out: { start: string; end: string; shift: number }[] = [];
  const shifts = Array.from({ length: window * 2 + 1 }, (_, i) => i - window).filter((s) => s !== 0).sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
  for (const shift of shifts) {
    const first = addDays(start, shift);
    const last = addDays(first, days - 1);
    if (first < earliest || last > latest) continue;
    let ok = true;
    for (let d = first; d <= last; d = addDays(d, 1)) if (blocked.has(d)) { ok = false; break; }
    if (ok) out.push({ start: first, end: last, shift });
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Arrival and departure, each on its own calendar. With `fixedDays` (a package of set
 * length) the departure follows the arrival. When the Captain is busy on any day of
 * the trip, the nearest free dates of the same length are offered as one-tap fixes.
 */
export function DateRangeCalendar({ start, end, onChange, disabled = [], minDate, maxDays = 180, fixedDays, maxSpan = 30 }: {
  start?: string; end?: string; onChange: (start: string | undefined, end: string | undefined) => void;
  disabled?: string[]; minDate?: Date; maxDays?: number; fixedDays?: number; maxSpan?: number;
}) {
  const accent = useAccent();
  const blocked = useMemo(() => new Set(disabled), [disabled]);
  const today = isoDate(minDate ?? new Date());
  const latest = addDays(today, maxDays);
  const effectiveEnd = fixedDays && start ? addDays(start, fixedDays - 1) : end;
  const days = start && effectiveEnd ? tripDays(start, effectiveEnd) : 0;
  const busy = useMemo(() => {
    if (!start || !effectiveEnd) return [] as string[];
    const out: string[] = [];
    for (let d = start; d <= effectiveEnd; d = addDays(d, 1)) if (blocked.has(d)) out.push(d);
    return out;
  }, [start, effectiveEnd, blocked]);
  const options = useMemo(
    () => (busy.length && start && days ? nearestFreeRanges(blocked, start, days, { earliest: today, latest }) : []),
    [busy.length, start, days, blocked, today, latest],
  );

  // Which calendar is open: tap a box to open it; picking the arrival moves straight on to the departure.
  const [open, setOpen] = useState<"arrival" | "departure" | null>(null);

  const pickArrival = (iso: string) => {
    if (fixedDays) {
      onChange(iso, addDays(iso, fixedDays - 1));
      return setOpen(null);
    }
    // Keep the departure if it still makes sense; otherwise ask for it next.
    const keep = end && end >= iso && tripDays(iso, end) <= maxSpan ? end : undefined;
    onChange(iso, keep);
    setOpen(keep ? null : "departure");
  };

  const box = (which: "arrival" | "departure", value: string | undefined, placeholder: string, locked = false) => {
    const active = open === which;
    return (
      <Pressable
        disabled={locked}
        onPress={() => setOpen(which === "departure" && !start ? "arrival" : which)}
        style={[styles.dateBox, (active || (!value && !locked && (which === "arrival" || !!start))) && { borderColor: accent.main }]}
        accessibilityRole="button"
        accessibilityLabel={`${which === "arrival" ? "Arrival" : "Departure"} date${value ? `, ${longDate(value)}` : ""}`}
      >
        <Row gap={6}>
          <Ionicons name={which === "arrival" ? "airplane" : "exit-outline"} size={14} color={accent.main} />
          <T variant="label">{which === "arrival" ? "Arrival" : "Departure"}</T>
        </Row>
        <T variant="bodyBold" color={value ? palette.ink : palette.muted} style={{ marginTop: 4 }} numberOfLines={1}>
          {value ? shortDate(value) : placeholder}
        </T>
        <T variant="caption" numberOfLines={1}>
          {value ? longDate(value).split(",")[0] : locked ? `Set by the ${fixedDays}-day trip` : which === "arrival" ? "Tap to choose" : start ? "Tap to choose" : "After arrival"}
        </T>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: space.md }}>
      <Row gap={space.sm} style={{ alignItems: "stretch" }}>
        {box("arrival", start, "Add date")}
        <View style={{ justifyContent: "center" }}><Ionicons name="arrow-forward" size={18} color={palette.muted} /></View>
        {box("departure", effectiveEnd, fixedDays ? "—" : "Add date", !!fixedDays)}
      </Row>

      {days ? <T variant="small" color={accent.main}>{days} day{days > 1 ? "s" : ""}{days > 1 ? ` · ${days - 1} night${days > 2 ? "s" : ""}` : ""}{fixedDays ? " · set by this trip" : ""}</T> : null}

      <Sheet visible={open !== null} onClose={() => setOpen(null)} title={open === "departure" ? "When do you leave?" : "When do you arrive?"}>
        {open === "departure" && start ? (
          <>
            <T variant="caption" style={{ marginBottom: space.md }}>Arriving {longDate(start)}. Up to {maxSpan} days.</T>
            <Calendar
              key={start}
              value={end}
              onChange={(iso) => {
                onChange(start, iso);
                setOpen(null);
              }}
              disabled={disabled}
              minDate={new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)))}
              maxDays={Math.min(maxSpan - 1, Math.max(0, tripDays(start, latest) - 1))}
            />
          </>
        ) : (
          <Calendar value={start} onChange={pickArrival} disabled={disabled} minDate={minDate} maxDays={maxDays} />
        )}
      </Sheet>
      {busy.length ? (
        <View style={{ backgroundColor: palette.warningSoft, borderRadius: radius.md, padding: space.md }}>
          <T variant="bodyBold" color={palette.warning}>
            Not available on {busy.length === 1 ? shortDate(busy[0]) : `${busy.length} of these days`}
          </T>
          {options.length ? (
            <>
              <T variant="caption" style={{ marginTop: 2, marginBottom: space.sm }}>Nearest dates when every day is free:</T>
              <Row gap={8} style={{ flexWrap: "wrap" }}>
                {options.map((o) => (
                  <Pressable key={o.start} onPress={() => onChange(o.start, o.end)} style={[styles.suggest, { borderColor: accent.main }]}>
                    <T variant="small" style={{ fontFamily: fonts.bold }}>{o.start === o.end ? shortDate(o.start) : `${shortDate(o.start)} – ${shortDate(o.end)}`}</T>
                    <T style={{ fontSize: 11, color: palette.muted }}>{o.shift > 0 ? `${o.shift} day${o.shift > 1 ? "s" : ""} later` : `${-o.shift} day${o.shift < -1 ? "s" : ""} earlier`}</T>
                  </Pressable>
                ))}
              </Row>
            </>
          ) : (
            <T variant="caption" style={{ marginTop: 2 }}>No free dates nearby. Try a shorter trip or another Captain.</T>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.lineStrong, paddingHorizontal: space.md },
  input: { flex: 1, minHeight: 50, fontFamily: fonts.body, fontSize: 16, color: palette.ink },
  prefix: { fontFamily: fonts.bold, fontSize: 16, color: palette.ink2, marginRight: 6 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  seg: { flexDirection: "row", backgroundColor: palette.sand2, borderRadius: radius.md, padding: 4 },
  segItem: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 10 },
  segActive: { backgroundColor: palette.white },
  segText: { fontFamily: fonts.bold, fontSize: 13, color: palette.muted },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekHead: { width: `${100 / 7}%`, textAlign: "center", fontFamily: fonts.bold, fontSize: 12, color: palette.muted, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  dayText: { fontFamily: fonts.medium, fontSize: 15, color: palette.ink },
  dayOff: { color: palette.lineStrong, textDecorationLine: "line-through" },
  dateBox: { flex: 1, borderWidth: 1.5, borderColor: palette.line, borderRadius: radius.md, backgroundColor: palette.white, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  suggest: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: palette.white },
});
