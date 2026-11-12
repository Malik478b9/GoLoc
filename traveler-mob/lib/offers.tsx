import { Ionicons } from "@expo/vector-icons";
import {
  api, BookingDetail, BookingOffers, Button, Field, longDate, money, palette, radius, Row, Sheet, space, T, toast, toastError,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

/** The "Offers & vouchers" row on a booking waiting for payment, and its sheet. */
export function OffersRow({ b }: { b: BookingDetail }) {
  const [open, setOpen] = useState(false);
  const hasCoupon = !!b.coupon;
  const hasVoucher = !!b.voucher_amount;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.row}>
        <View style={styles.icon}><Ionicons name="pricetag" size={16} color={palette.success} /></View>
        <View style={{ flex: 1 }}>
          {hasCoupon || hasVoucher ? (
            <>
              <T variant="bodyBold" color={palette.success}>
                You save {money((b.discount ?? 0) + (b.voucher_amount ?? 0))}
              </T>
              <T variant="caption" numberOfLines={1}>
                {[hasCoupon ? b.coupon!.code : null, hasVoucher ? "Gift voucher" : null].filter(Boolean).join(" + ")}
              </T>
            </>
          ) : (
            <>
              <T variant="bodyBold">Apply coupon or gift voucher</T>
              <T variant="caption">See offers for this trip</T>
            </>
          )}
        </View>
        <T variant="small" color={palette.rickshaw}>{hasCoupon || hasVoucher ? "Change" : "View"}</T>
      </Pressable>
      <OffersSheet b={b} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function OffersSheet({ b, visible, onClose }: { b: BookingDetail; visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const offers = useQuery({
    queryKey: ["offers", b.id, b.coupon?.code ?? "", b.voucher_amount ?? 0],
    queryFn: () => api.get<BookingOffers>(`/bookings/${b.id}/offers/`),
    enabled: visible,
  });
  const done = (nb: BookingDetail, msg: string) => {
    qc.setQueryData(["booking", b.id], nb);
    qc.invalidateQueries({ queryKey: ["offers", b.id] });
    toast(msg, "success");
  };
  const coupon = useMutation({
    mutationFn: (c: string | null) => (c ? api.post<BookingDetail>(`/bookings/${b.id}/coupon/`, { code: c }) : api.del<BookingDetail>(`/bookings/${b.id}/coupon/`)),
    onSuccess: (nb, c) => {
      setCode("");
      done(nb, c ? `${nb.coupon?.code} applied · ${money(nb.discount ?? 0)} off` : "Coupon removed");
    },
    onError: toastError,
  });
  const voucher = useMutation({
    mutationFn: (c: string | null) => (c ? api.post<BookingDetail>(`/bookings/${b.id}/voucher/`, { code: c }) : api.del<BookingDetail>(`/bookings/${b.id}/voucher/`)),
    onSuccess: (nb, c) => done(nb, c ? `${money(nb.voucher_amount ?? 0)} paid from your gift voucher` : "Gift voucher removed"),
    onError: toastError,
  });
  const busy = coupon.isPending || voucher.isPending;
  const vouchers = offers.data?.vouchers ?? [];
  const coupons = offers.data?.coupons ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} title="Offers & vouchers">
      {/* ---------- price ---------- */}
      <View style={styles.bill}>
        <Line label="Trip fare" value={money(b.fare)} />
        {b.discount ? <Line label={`Coupon ${b.coupon?.code ?? ""}`} value={`− ${money(b.discount)}`} good /> : null}
        <Line label="Trip insurance" value={money(b.insurance_fee)} />
        {b.voucher_amount ? <Line label="Gift voucher" value={`− ${money(b.voucher_amount)}`} good /> : null}
        <View style={styles.rule} />
        <Line label="To pay" value={money(b.total)} bold />
      </View>

      {/* ---------- gift vouchers ---------- */}
      {vouchers.length ? (
        <View style={{ marginTop: space.lg }}>
          <T variant="label" style={{ marginBottom: space.sm }}>Your gift vouchers</T>
          {vouchers.map((v) => (
            <View key={v.code} style={styles.voucher}>
              <Ionicons name="gift" size={20} color={palette.marigold} />
              <View style={{ flex: 1 }}>
                <T variant="bodyBold">{money(v.balance)} left</T>
                <T variant="caption" numberOfLines={2}>{v.message ? `${v.message} · ` : ""}Valid till {longDate(v.expires_at.slice(0, 10))}</T>
              </View>
              {v.usable && !b.voucher_amount ? (
                <Button title="Use" small kind="secondary" disabled={busy} onPress={() => voucher.mutate(v.code)} />
              ) : null}
            </View>
          ))}
          {b.voucher_amount ? <Button title="Don't use gift voucher" small kind="ghost" disabled={busy} onPress={() => voucher.mutate(null)} /> : null}
        </View>
      ) : null}

      {/* ---------- coupons ---------- */}
      <T variant="label" style={{ marginTop: space.lg, marginBottom: space.sm }}>Coupons</T>
      <Row gap={8} style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Field placeholder="Enter coupon code" value={code} onChangeText={(v) => setCode(v.toUpperCase().replace(/\s/g, ""))} autoCapitalize="characters" maxLength={20} />
        </View>
        <Button title="Apply" small disabled={code.length < 3 || busy} loading={coupon.isPending && !!code} onPress={() => coupon.mutate(code)} style={{ marginTop: 2 }} />
      </Row>
      {coupons.map((c) => (
        <View key={c.code} style={[styles.coupon, c.applied && styles.couponOn, !c.eligible && !c.applied && { opacity: 0.6 }]}>
          <View style={{ flex: 1 }}>
            <Row gap={8}>
              <View style={styles.code}><T variant="small" color={palette.rickshaw}>{c.code}</T></View>
              {c.eligible ? <T variant="small" color={palette.success}>Save {money(c.discount)}</T> : null}
            </Row>
            <T variant="bodyBold" style={{ marginTop: 6 }}>{c.title}</T>
            <T variant="caption">{c.eligible ? c.description : c.reason}</T>
          </View>
          {c.applied ? (
            <Button title="Remove" small kind="ghost" disabled={busy} onPress={() => coupon.mutate(null)} />
          ) : c.eligible ? (
            <Button title="Apply" small kind="secondary" disabled={busy} onPress={() => coupon.mutate(c.code)} />
          ) : null}
        </View>
      ))}
      {!coupons.length && !offers.isLoading ? <T variant="caption">No offers right now.</T> : null}
      <T variant="caption" style={{ marginTop: space.md }}>One coupon per booking. Coupons take money off the fare; insurance is always included.</T>
      <Button title={`Done · pay ${money(b.total)}`} onPress={onClose} style={{ marginTop: space.lg }} />
    </Sheet>
  );
}

const Line = ({ label, value, good, bold }: { label: string; value: string; good?: boolean; bold?: boolean }) => (
  <Row style={{ justifyContent: "space-between", paddingVertical: 3 }}>
    <T variant={bold ? "bodyBold" : "small"} color={good ? palette.success : undefined}>{label}</T>
    <T variant={bold ? "bodyBold" : "small"} color={good ? palette.success : undefined}>{value}</T>
  </Row>
);

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: palette.successSoft, marginTop: space.md },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.paper, alignItems: "center", justifyContent: "center" },
  bill: { backgroundColor: palette.sand, borderRadius: radius.md, padding: space.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: palette.lineStrong, marginVertical: 6 },
  voucher: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: palette.marigoldSoft, marginBottom: 8 },
  coupon: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.lineStrong, borderStyle: "dashed", marginTop: 8 },
  couponOn: { borderColor: palette.success, borderStyle: "solid", backgroundColor: palette.successSoft },
  code: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: palette.rickshawSoft },
});
