import { api, Banner, Button, Card, ErrorView, Field, Loading, money, palette, Row, Screen, Section, Sheet, space, Stat, T, timeAgo, titleCase, toast, toastError } from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";

import { Wallet } from "../../lib/data";

type WalletResponse = Wallet & {
  ledger: { id: number; kind: string; amount: number; note: string; booking_code: string | null; paid_to_agency: boolean; created_at: string }[];
  agency: { code: string; name: string } | null;
  /** What their trips for an agency earned (paid to the agency, which pays them). */
  agency_earned: number;
  payouts: { id: string; code: string; amount: number; status: string; destination: string; reference: string; note: string; created_at: string }[];
  payout_account: string | null;
};

export default function Earnings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["wallet"], queryFn: () => api.get<WalletResponse>("/payments/wallet/") });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const request = useMutation({
    mutationFn: () => api.post("/payments/payouts/", { amount: Number(amount) }),
    onSuccess: () => {
      setOpen(false);
      setAmount("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Payout requested — usually arrives within 1 working day", "success");
    },
    onError: toastError,
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Screen title="Earnings"><ErrorView error={q.error} onRetry={q.refetch} /></Screen>;
  const w = q.data;
  const canWithdraw = w.available >= w.min_payout && !w.on_hold && !!w.payout_account;

  return (
    <Screen title="Earnings & payouts" onRefresh={q.refetch}>
      {w.agency || w.agency_earned ? (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="info" icon="business" title={w.agency ? `Your trips are paid to ${w.agency.name}` : "Agency trips"}
            body={`${money(w.agency_earned)} earned on agency trips so far. Your agency pays you directly; below are all the trips you did.`} />
        </View>
      ) : null}
      <Card style={{ backgroundColor: palette.night }}>
        <T variant="label" color={palette.marigold}>Available to withdraw</T>
        <T style={{ fontSize: 36, fontWeight: "800", color: palette.white, marginVertical: 6 }}>{money(w.available)}</T>
        <T variant="small" color="#D6E6E1">{w.payout_account ? `To ${w.payout_account}` : "Add a payout account to withdraw"}</T>
        <Button
          title={w.payout_account ? "Withdraw" : "Add payout account"}
          onPress={() => (w.payout_account ? setOpen(true) : router.push("/setup/payout"))}
          disabled={!!w.payout_account && !canWithdraw}
          style={{ marginTop: space.md }}
        />
        {w.payout_account && w.available < w.min_payout ? <T variant="caption" color="#D6E6E1" style={{ marginTop: 6 }}>Minimum payout is {money(w.min_payout)}.</T> : null}
      </Card>
      {w.on_hold ? <View style={{ marginTop: space.md }}><Banner tone="danger" title="Payouts paused" body="Your account is on hold. Contact support." /></View> : null}

      <Row style={{ flexWrap: "wrap", marginTop: space.lg }} gap={10}>
        <Stat label="This month" value={money(w.this_month)} />
        <Stat label="On upcoming trips" value={money(w.pending_trips)} hint="Credited when completed" />
      </Row>
      <Row style={{ flexWrap: "wrap", marginTop: 10 }} gap={10}>
        <Stat label="Lifetime earned" value={money(w.lifetime_earned)} />
        <Stat label="Paid out" value={money(w.paid_out)} hint={w.in_transit ? `${money(w.in_transit)} in transit` : undefined} />
      </Row>

      <Section title="Payouts">
        {w.payouts.length === 0 ? <T variant="caption">No payouts yet.</T> : w.payouts.map((p) => (
          <Row key={p.id} style={{ justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: palette.line }}>
            <View style={{ flex: 1 }}>
              <T variant="bodyBold">{p.code} · {money(p.amount)}</T>
              <T variant="caption">{p.destination} · {timeAgo(p.created_at)}{p.reference ? ` · Ref ${p.reference}` : ""}</T>
              {p.status === "failed" && p.note ? <T variant="caption" color={palette.coral}>{p.note}</T> : null}
            </View>
            <T variant="small" color={p.status === "paid" ? palette.success : p.status === "failed" ? palette.coral : palette.info}>{titleCase(p.status)}</T>
          </Row>
        ))}
      </Section>

      <Section title="Wallet activity">
        {w.ledger.length === 0 ? <T variant="caption">Completed trips show up here.</T> : w.ledger.map((e) => (
          <Row key={e.id} style={{ justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: palette.line }}>
            <View style={{ flex: 1 }}>
              <T variant="small">{e.note || titleCase(e.kind)}</T>
              <T variant="caption">{timeAgo(e.created_at)}{e.paid_to_agency ? " · paid to your agency" : ""}</T>
            </View>
            <T variant="bodyBold" color={e.paid_to_agency ? palette.muted : e.amount >= 0 ? palette.success : palette.ink}>{e.amount >= 0 ? "+" : "−"}{money(Math.abs(e.amount))}</T>
          </Row>
        ))}
      </Section>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Withdraw">
        <T style={{ marginBottom: space.md }}>Up to {money(w.available)} to {w.payout_account}.</T>
        <Field prefix="₹" keyboardType="number-pad" value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ""))} placeholder={String(w.available)} autoFocus />
        <Button title="Use full balance" kind="ghost" small onPress={() => setAmount(String(w.available))} style={{ alignSelf: "flex-start", marginBottom: space.md }} />
        <Button title={`Withdraw ${amount ? money(Number(amount)) : ""}`} loading={request.isPending} disabled={!amount || Number(amount) < w.min_payout || Number(amount) > w.available} onPress={() => request.mutate()} />
      </Sheet>
    </Screen>
  );
}
