import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";

import type { GroupTrip } from "../api/types";
import { dateRange, money, time12 } from "../format";
import { useT } from "../i18n";
import { Avatar, Badge, Card, Row, T } from "../ui/primitives";
import { fonts, palette, radius, shadow, space } from "../theme";

/**
 * A 4-digit PIN as four large tiles. Each digit has its own box with a fixed
 * line height, so nothing is clipped on any phone or font size.
 */
export function PinCode({ pin, dark = true, size = "lg" }: { pin: string; dark?: boolean; size?: "lg" | "md" }) {
  const box = size === "lg" ? 60 : 48;
  return (
    <Row gap={size === "lg" ? 10 : 8} accessibilityLabel={`PIN ${pin.split("").join(" ")}`}>
      {pin.split("").map((d, i) => (
        <View key={i} style={[styles.pinBox, { width: box, height: box + 8 }, dark ? styles.pinDark : styles.pinLight]}>
          <T style={[styles.pinDigit, { fontSize: box * 0.5, lineHeight: box * 0.68 }, { color: dark ? palette.white : palette.ink }]}>{d}</T>
        </View>
      ))}
    </Row>
  );
}

/** Type a 4-digit PIN into four boxes (one hidden input underneath, so paste and autofill work). */
export function PinInput({ value, onChange, autoFocus = true }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ alignItems: "center" }} accessibilityLabel="PIN">
      <Row gap={10}>
        {[0, 1, 2, 3].map((i) => {
          const active = focused && (i === value.length || (i === 3 && value.length === 4));
          return (
            <View key={i} style={[styles.pinBox, styles.pinInputBox, active && styles.pinInputActive]}>
              <T style={[styles.pinDigit, { fontSize: 28, lineHeight: 38, color: palette.ink }]}>{value[i] ?? ""}</T>
            </View>
          );
        })}
      </Row>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        textContentType="oneTimeCode"
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

/** Filled / held / free seats as one bar, with the "needs N more to run" line. */
export function SeatsBar({ g, light }: { g: Pick<GroupTrip, "seats" | "seats_paid" | "seats_taken" | "min_seats" | "will_run">; light?: boolean }) {
  const t = useT();
  const paid = Math.min(g.seats_paid, g.seats);
  const held = Math.max(0, Math.min(g.seats_taken, g.seats) - paid);
  const need = Math.max(0, g.min_seats - g.seats_paid);
  const left = Math.max(0, g.seats - g.seats_taken);
  return (
    <View>
      <View style={[styles.bar, light && { backgroundColor: "rgba(255,255,255,0.18)" }]}>
        <View style={{ flex: paid, backgroundColor: palette.success }} />
        <View style={{ flex: held, backgroundColor: palette.marigold }} />
        <View style={{ flex: Math.max(0, g.seats - paid - held) }} />
      </View>
      <Row style={{ justifyContent: "space-between", marginTop: 6 }}>
        <T variant="small" color={light ? palette.onDark : palette.ink2}>
          {t("{n} of {total} joined", { n: g.seats_taken, total: g.seats })}
        </T>
        <T variant="small" color={g.will_run ? palette.success : light ? palette.marigold : palette.warning}>
          {g.will_run ? t("Confirmed to run") : need === 1 ? t("1 more needed to run") : t("{n} more needed to run", { n: need })}
        </T>
      </Row>
      {left > 0 && left <= 3 ? <T variant="caption" color={light ? palette.onDarkMuted : palette.coral}>{left === 1 ? t("Last seat!") : t("Only {n} seats left", { n: left })}</T> : null}
    </View>
  );
}

const STATE_BADGE: Record<GroupTrip["state"], { label: string; bg: string; fg: string } | null> = {
  open: null,
  full: { label: "Full", bg: palette.sand2, fg: palette.ink2 },
  departed: { label: "Departed", bg: palette.infoSoft, fg: palette.info },
  finished: { label: "Finished", bg: palette.sand2, fg: palette.muted },
  cancelled: { label: "Cancelled", bg: palette.coralSoft, fg: palette.coral },
};

/** One group departure in a list: cover, date, price per seat, seats. */
export function GroupTripCard({ g, onPress, showCaptain = true, width }: { g: GroupTrip; onPress?: () => void; showCaptain?: boolean; width?: number }) {
  const badge = STATE_BADGE[g.state];
  return (
    <Card padded={false} onPress={onPress} style={[{ overflow: "hidden" }, width ? { width } : null]}>
      {g.service.cover_image ? (
        <Image source={{ uri: g.service.cover_image }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}><Ionicons name="people" size={34} color={palette.rickshaw} /></View>
      )}
      <View style={{ padding: space.lg, gap: space.sm }}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <T variant="h2" numberOfLines={2}>{g.title}</T>
            <T variant="caption" style={{ marginTop: 2 }}>
              {dateRange(g.start_date, g.end_date)} · {time12(g.start_time)} · {g.city_name}
            </T>
          </View>
          {badge ? <Badge label={badge.label} bg={badge.bg} fg={badge.fg} /> : null}
        </Row>
        {showCaptain ? (
          <Row gap={8}>
            <Avatar uri={g.captain.avatar} name={g.captain.name} size={26} verified={g.captain.is_verified} />
            <T variant="small" numberOfLines={1} style={{ flex: 1 }}>{g.captain.name}</T>
          </Row>
        ) : null}
        <SeatsBar g={g} />
        <Row style={{ justifyContent: "space-between", marginTop: 2 }}>
          <T variant="caption">per seat</T>
          <T variant="h2" color={palette.ink}>{money(g.price_per_seat)}</T>
        </Row>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  pinBox: { borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  pinDark: { backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  pinLight: { backgroundColor: palette.paper, ...shadow },
  pinInputBox: { width: 56, height: 64, backgroundColor: palette.paper, borderWidth: 1.5, borderColor: palette.lineStrong },
  pinInputActive: { borderColor: palette.ink },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
  pinDigit: { fontFamily: fonts.display, textAlign: "center", includeFontPadding: false, textAlignVertical: "center" },
  bar: { height: 8, borderRadius: 4, backgroundColor: palette.sand2, overflow: "hidden", flexDirection: "row" },
  cover: { width: "100%", height: 140 },
  coverEmpty: { backgroundColor: palette.rickshawSoft, alignItems: "center", justifyContent: "center" },
});
