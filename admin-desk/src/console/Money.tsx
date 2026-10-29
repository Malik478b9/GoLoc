import React, { useState } from "react";

import { post } from "../api/client";
import { ago, Badge, Empty, ErrorBox, Loading, Modal, money, Page, Pager, useAction, useApi, when } from "./lib";

type Payout = { id: string; code: string; captain_code: string; captain_name: string; is_agency: boolean; amount: number; status: string; destination: string; reference: string; note: string; processed_by_name: string | null; processed_at: string | null; created_at: string };
type Refund = { id: string; booking_code: string; amount: number; reason: string; gateway_refund_id: string; status: string; created_at: string };

export function Payouts() {
  const [tab, setTab] = useState<"requested" | "paid" | "failed" | "refunds">("requested");
  const [page, setPage] = useState(1);
  const payouts = useApi<Page<Payout>>(tab !== "refunds" ? "/admin/payouts/" : null, { status: tab, page });
  const refunds = useApi<Page<Refund>>(tab === "refunds" ? "/admin/refunds/" : null, { page });
  const { busy, run } = useAction();
  const [settle, setSettle] = useState<{ p: Payout; paid: boolean } | null>(null);
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");

  const confirm = async () => {
    if (!settle) return;
    const ok = await run(() => post(`/admin/payouts/${settle.p.id}/settle/`, { paid: settle.paid, reference: ref, note }), settle.paid ? "Marked paid — Captain notified" : "Marked failed — money back in wallet");
    if (ok) {
      setSettle(null);
      setRef("");
      setNote("");
      payouts.reload();
    }
  };

  const data = tab === "refunds" ? refunds : payouts;
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Finance</div><h1>Payouts & refunds</h1></div></div>
      <div className="filters">
        {[["requested", "To send"], ["paid", "Paid"], ["failed", "Failed"], ["refunds", "Traveler refunds"]].map(([v, l]) => (
          <button key={v} className={`chip ${tab === v ? "on" : ""}`} onClick={() => { setTab(v as any); setPage(1); }}>{l}</button>
        ))}
      </div>
      {tab === "requested" ? <p className="muted small" style={{ marginBottom: 10 }}>Transfer the amount by UPI / NEFT, then mark it paid with the UTR. Earnings only reach a wallet after a trip completes (BR-2).</p> : null}
      {data.error ? <ErrorBox error={data.error} retry={data.reload} /> : !data.data && data.loading ? <Loading /> : !data.data?.results.length ? <Empty>Nothing here.</Empty> : tab === "refunds" ? (
        <div className="list">
          {refunds.data!.results.map((r) => (
            <div key={r.id} className="list-row static">
              <div className="grow"><b>{money(r.amount)}</b> <span className="mono">{r.booking_code}</span><div className="muted small">{r.reason} · {r.gateway_refund_id || "—"}</div></div>
              <div className="right"><Badge s={r.status} /><div className="muted small">{when(r.created_at)}</div></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="list">
          {payouts.data!.results.map((p) => (
            <div key={p.id} className="list-row static">
              <div className="grow">
                <b>{money(p.amount)}</b> <span className="mono">{p.code}</span>
                <div className="muted small">{p.is_agency ? "Agency · " : ""}{p.captain_name} ({p.captain_code}) → {p.destination}</div>
                {p.reference ? <div className="muted small">UTR {p.reference}{p.processed_by_name ? ` · by ${p.processed_by_name}` : ""}</div> : null}
                {p.note ? <div className="muted small">{p.note}</div> : null}
              </div>
              <div className="right">
                <Badge s={p.status} />
                <div className="muted small">{ago(p.created_at)}</div>
                {p.status === "requested" ? (
                  <div className="row gap-s">
                    <button className="btn small primary" onClick={() => setSettle({ p, paid: true })}>Mark paid</button>
                    <button className="btn small danger" onClick={() => setSettle({ p, paid: false })}>Failed</button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={data.data} current={page} onPage={setPage} />
      {settle ? (
        <Modal title={`${settle.paid ? "Mark paid" : "Mark failed"} · ${settle.p.code}`} onClose={() => setSettle(null)}>
          <p><b>{money(settle.p.amount)}</b> to {settle.p.captain_name} · {settle.p.destination}</p>
          {settle.paid ? (<><label className="lbl">UTR / transfer reference</label><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 4321XXXX" /></>) : null}
          <label className="lbl">{settle.paid ? "Note (optional)" : "Reason — shown to the Captain"}</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className={`btn full ${settle.paid ? "primary" : "danger"}`} disabled={busy || (settle.paid ? !ref.trim() : !note.trim())} onClick={confirm}>Confirm</button>
        </Modal>
      ) : null}
    </div>
  );
}
