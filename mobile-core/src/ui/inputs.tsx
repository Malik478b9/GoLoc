import { Ionicons } from "@expo/vector-icons";
import React, { forwardRef, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, TextInputProps, View } from "react-native";

import { addDays, isoDate, shortDate, tripDays } from "../format";
import { fonts, palette, radius, space } from "../theme";
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
 * Arrival → return picker. First tap sets arrival, second tap sets return.
 * With `fixedDays` (a package of set length) one tap fills the whole trip.
 * A range can't cross a greyed-out date: the trip needs every day free.
 */
export function DateRangeCalendar({ start, end, onChange, disabled = [], minDate, maxDays = 180, fixedDays, maxSpan = 30 }: {
  start?: string; end?: string; onChange: (start: string | undefined, end: string | undefined) => void;
  disabled?: string[]; minDate?: Date; maxDays?: number; fixedDays?: number; maxSpan?: number;
}) {
  const accent = useAccent();
  const blocked = useMemo(() => new Set(disabled), [disabled]);
  const [hint, setHint] = useState<string | undefined>();
  const clashes = (from: string, to: string) => {
    for (let d = from; d <= to; d = addDays(d, 1)) if (blocked.has(d)) return true;
    return false;
  };

  const pick = (iso: string) => {
    setHint(undefined);
    if (fixedDays) {
      const to = addDays(iso, fixedDays - 1);
      if (clashes(iso, to)) return setHint(`This trip runs ${fixedDays} days and one of them is unavailable. Try another start.`);
      return onChange(iso, to);
    }
    if (!start || end || iso < start) return onChange(iso, undefined);
    if (tripDays(start, iso) > maxSpan) return setHint(`Up to ${maxSpan} days per booking.`);
    if (clashes(start, iso)) {
      setHint("Some days in between are unavailable, so we started a new trip from that date.");
      return onChange(iso, undefined);
    }
    onChange(start, iso);
  };

  const days = start && end ? tripDays(start, end) : 0;
  return (
    <MonthGrid
      minDate={minDate}
      maxDays={maxDays}
      disabled={blocked}
      look={(iso) => ({ edge: iso === start || iso === end, inside: !!start && !!end && iso > start && iso < end })}
      onPick={pick}
      footer={
        <View style={{ marginTop: space.md }}>
          <Row gap={space.md}>
            {(["Arrival", "Return"] as const).map((label, i) => {
              const v = i === 0 ? start : end;
              const waiting = i === 0 ? !start : !!start && !end;
              return (
                <View key={label} style={[styles.rangeBox, waiting && { borderColor: accent.main }]}>
                  <T variant="caption">{label}</T>
                  <T variant="bodyBold" color={v ? palette.ink : palette.muted}>{v ? shortDate(v) : i === 0 ? "Pick a date" : "Tap return day"}</T>
                </View>
              );
            })}
          </Row>
          {days ? <T variant="small" color={accent.main} style={{ marginTop: 6 }}>{days} day{days > 1 ? "s" : ""}{fixedDays ? " · set by this package" : ""}</T> : null}
          {hint ? <T variant="caption" color={palette.coral} style={{ marginTop: 4 }}>{hint}</T> : null}
        </View>
      }
    />
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
  rangeBox: { flex: 1, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.line, backgroundColor: palette.white },
});
