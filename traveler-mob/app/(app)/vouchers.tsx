import { Ionicons } from "@expo/vector-icons";
import { api, Empty, GiftVoucher, gradients, LinearGradient, longDate, money, palette, radius, Row, Screen, SkeletonList, space, T } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { StyleSheet, View } from "react-native";

/** The traveler's GoLoc gift vouchers: balance, message, expiry. Used at payment on any trip. */
export default function Vouchers() {
  const q = useQuery({ queryKey: ["vouchers"], queryFn: () => api.get<GiftVoucher[]>("/vouchers/") });
  const total = (q.data ?? []).filter((v) => v.usable).reduce((s, v) => s + v.balance, 0);
  return (
    <Screen title="Gift vouchers" onRefresh={q.refetch}>
      <LinearGradient colors={gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="gift" size={26} color={palette.white} />
        <T variant="label" color={palette.white} style={{ marginTop: space.md, opacity: 0.9 }}>Balance you can use</T>
        <T style={styles.big}>{money(total)}</T>
        <T variant="small" color={palette.white}>Use it when you pay for any trip. Any balance left stays for next time.</T>
      </LinearGradient>
      {q.isLoading ? <SkeletonList rows={2} /> : !q.data?.length ? (
        <Empty icon="gift-outline" title="No gift vouchers yet" body="When GoLoc sends you a voucher, it shows up here and at payment." />
      ) : (
        <View style={{ gap: space.md, marginTop: space.lg }}>
          {q.data.map((v) => {
            const state = v.status === "cancelled" ? "Cancelled" : new Date(v.expires_at) <= new Date() ? "Expired" : v.balance === 0 ? "Used up" : null;
            return (
              <View key={v.code} style={[styles.card, state && { opacity: 0.55 }]}>
                <Row style={{ justifyContent: "space-between" }}>
                  <T variant="h2">{money(v.balance)} <T variant="caption">of {money(v.amount)}</T></T>
                  <T variant="small" color={state ? palette.muted : palette.success}>{state ?? "Active"}</T>
                </Row>
                {v.message ? <T style={{ marginTop: 4 }}>“{v.message}”</T> : null}
                <View style={styles.bar}><View style={{ flex: v.balance, backgroundColor: palette.marigold }} /><View style={{ flex: v.amount - v.balance }} /></View>
                <Row style={{ justifyContent: "space-between" }}>
                  <T variant="caption">Valid till {longDate(v.expires_at.slice(0, 10))}</T>
                  <T variant="caption" style={{ fontFamily: "monospace" }}>{v.code}</T>
                </Row>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.xl },
  big: { fontSize: 40, lineHeight: 48, fontWeight: "800", color: palette.white, marginVertical: 4 },
  card: { backgroundColor: palette.paper, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: palette.line },
  bar: { height: 6, borderRadius: 3, backgroundColor: palette.sand2, overflow: "hidden", flexDirection: "row", marginVertical: space.md },
});
