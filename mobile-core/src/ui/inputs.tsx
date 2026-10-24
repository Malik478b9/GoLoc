import { Ionicons } from "@expo/vector-icons";
import React, { forwardRef, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, TextInputProps, View } from "react-native";

import { isoDate } from "../format";
import { fonts, palette, radius, space } from "../theme";
import { Row, T, useAccent } from "./primitives";

export const Field = forwardRef<React.ComponentRef<typeof TextInput>, TextInputProps & { label?: string; error?: string; hint?: string; prefix?: string }>(
  function Field({ label, error, hint, prefix, style, multiline, ...rest }, ref) {
    const [focused, setFocused] = useState(false);
    const accent = useAccent();
    return (
      <View style={{ marginBottom: space.md }}>
        {label ? <T variant="small" style={{ marginBottom: 6, fontFamily: fonts.bold }}>{label}</T> : null}
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

/** Month calendar. `disabled` = ISO dates that can't be picked (booked / blocked). */
export function Calendar({ value, onChange, disabled = [], minDate, maxDays = 180 }: { value?: string; onChange: (iso: string) => void; disabled?: string[]; minDate?: Date; maxDays?: number }) {
  const accent = useAccent();
  const today = useMemo(() => {
    const d = minDate ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, [minDate]);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const blocked = useMemo(() => new Set(disabled), [disabled]);
  const last = new Date(today.getTime() + maxDays * 86400000);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  const canPrev = cursor > new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <View>
      <Row style={{ justifyContent: "space-between", marginBottom: space.sm }}>
        <Pressable disabled={!canPrev} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={canPrev ? palette.ink : palette.line} />
        </Pressable>
        <T variant="bodyBold">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</T>
        <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} hitSlop={10}>
          <Ionicons name="chevron-forward" size={20} color={palette.ink} />
        </Pressable>
      </Row>
      <View style={styles.grid}>
        {WEEK.map((d, i) => (
          <Text key={`h${i}`} style={styles.weekHead}>{d}</Text>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.cell} />;
          const iso = isoDate(d);
          const off = d < today || d > last || blocked.has(iso);
          const selected = iso === value;
          return (
            <Pressable key={iso} disabled={off} onPress={() => onChange(iso)} style={styles.cell}>
              <View style={[styles.day, selected && { backgroundColor: accent.main }]}>
                <Text style={[styles.dayText, off && styles.dayOff, selected && { color: accent.onMain, fontFamily: fonts.bold }]}>{d.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {disabled.length ? <T variant="caption" style={{ marginTop: 6 }}>Greyed-out dates are unavailable.</T> : null}
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
});
