import { api, ApiError, Banner, Button, Field, Loading, Screen, Segmented, space, T, toast } from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";

import { useRefreshBusiness } from "../../../lib/data";

type Account = { method: "upi" | "bank"; account_holder: string; upi_id: string; ifsc: string; masked: string };

export default function PayoutAccount() {
  const qc = useQueryClient();
  const refresh = useRefreshBusiness();
  const q = useQuery({ queryKey: ["payout-account"], queryFn: () => api.get<Account | null>("/captain/payout-account/") });
  const [method, setMethod] = useState<"upi" | "bank">("upi");
  const [holder, setHolder] = useState("");
  const [upi, setUpi] = useState("");
  const [acct, setAcct] = useState("");
  const [ifsc, setIfsc] = useState("");
  useEffect(() => {
    if (q.data) {
      setMethod(q.data.method);
      setHolder(q.data.account_holder);
      setUpi(q.data.upi_id);
      setIfsc(q.data.ifsc);
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put<Account>("/captain/payout-account/", { method, account_holder: holder.trim(), upi_id: upi.trim(), account_number: acct, ifsc: ifsc.trim() }),
    onSuccess: (a) => {
      qc.setQueryData(["payout-account"], a);
      refresh();
      toast("Payout account saved", "success");
      router.back();
    },
  });
  const err = save.error as ApiError | null;
  if (q.isLoading) return <Loading />;
  return (
    <Screen title="Payout account" footer={<Button title="Save" loading={save.isPending} disabled={!holder.trim()} onPress={() => save.mutate()} />}>
      {q.data ? <Banner tone="success" title="Current account" body={q.data.masked} /> : null}
      <T variant="caption" style={{ marginVertical: space.md }}>Your earnings are paid here after each completed trip, when you request a payout.</T>
      <Segmented value={method} onChange={setMethod} options={[{ value: "upi", label: "UPI" }, { value: "bank", label: "Bank account" }]} />
      <Field label="Account holder name" value={holder} onChangeText={setHolder} style={{ marginTop: space.lg }} error={err?.field("account_holder")} />
      {method === "upi" ? (
        <Field label="UPI ID" value={upi} onChangeText={setUpi} autoCapitalize="none" placeholder="name@okhdfcbank" error={err?.field("upi_id")} />
      ) : (
        <>
          <Field label="Account number" value={acct} onChangeText={(v) => setAcct(v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder={q.data?.method === "bank" ? "Re-enter to change" : ""} error={err?.field("account_number")} />
          <Field label="IFSC" value={ifsc} onChangeText={setIfsc} autoCapitalize="characters" maxLength={11} placeholder="HDFC0001234" error={err?.field("ifsc")} />
        </>
      )}
    </Screen>
  );
}
