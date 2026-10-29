import React, { useState } from "react";

import { post } from "../api/client";
import { Badge, Empty, ErrorBox, Loading, Modal, money, Stat, useAction, useApi, when } from "./lib";
import type { Wallet } from "./types";

type WalletData = Wallet & {
  ledger: { id: number; kind: string; amount: number; note: string; booking_code: string | null; captain_name: string | null; created_at: string }[];
  payouts: { id: string; code: string; amount: number; status: string; destination: string; reference: string; note: string; created_at: string }[];
  payout_account: string | null;
};
type Earnings = { month: string; total: number; by_captain: { captain_id: string; code: string; name: string; trips: number; total: number }[]; months: { month: string; total: number }[] };

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export function Money() {
  const w = useApi<WalletData>("/agency/wallet/");
  const [month, setMonth] = useState<string | undefined>();
  const e = useApi<Earnings>("/agency/earnings/", month ? { month } : undefined);
  const { busy, run } = useAction();
  const [withdraw, setWithdraw] = useState(false);
  const [amount, setAmount] = useState("");

  const request = async () => {
    if (await run(() => post("/agency/wallet/payout/", { amount: Number(amount) }), "Payout requested — GoLoc sends it within 2 working days")) {
      setWithdraw(false);
      setAmount("");
      w.reload();
    }
  };

  if (w.error) return <ErrorBox error={w.error} retry={w.reload} />;
  if (!w.data) return <Loading />;
  const x = w.data;
  const max = Math.max(1, ...(e.data?.months ?? []).map((m) => m.total));
  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Money</div><h1>Wallet &amp; earnings</h1></div>
        <div className="actions"><button className="btn primary" disabled={x.available < x.min_payout || x.on_hold} onClick={() => { setAmount(String(x.available)); setWithdraw(true); }}>Withdraw</button></div>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>Each trip's fare minus GoLoc's commission lands here when the trip completes. Salaries to your Captains are between you and them.</p>
      <div className="stats">
        <Stat label="Ready to withdraw" value={money(x.available)} hint={x.payout_account ? `to ${x.payout_account}` : "Add a payout account"} />
        <Stat label="Coming from booked trips" value={money(x.pending_trips)} />
        <Stat label="Earned this month" value={money(x.this_month)} />
        <Stat label="On the way to your bank" value={money(x.in_transit)} />
        <Stat label="Paid out so far" value={money(x.paid_out)} />
        <Stat label="Lifetime earnings" value={money(x.lifetime_earned)} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>By Captain · {e.data ? monthLabel(e.data.month) : "…"}</h3>
            <select style={{ width: "auto" }} value={month ?? e.data?.month ?? ""} onChange={(ev) => setMonth(ev.target.value)}>
              {(e.data?.months.length ? e.data.months : e.data ? [{ month: e.data.month, total: 0 }] : []).map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>)}
            </select>
          </div>
          {!e.data ? <Loading /> : !e.data.by_captain.length ? <Empty>No completed trips this month.</Empty> : (
            <table className="table">
              <thead><tr><th>Captain</th><th>Trips</th><th>Earned</th></tr></thead>
              <tbody>
                {e.data.by_captain.map((r) => <tr key={r.captain_id}><td><b>{r.name}</b> <span className="mono">{r.code}</span></td><td>{r.trips}</td><td>{money(r.total)}</td></tr>)}
                <tr><td><b>Total</b></td><td /><td><b>{money(e.data.total)}</b></td></tr>
              </tbody>
            </table>
          )}
          {e.data?.months.length ? (
            <div className="pad bars">
              {e.data.months.map((m) => (
                <div key={m.month} className="bar-row"><span className="small">{monthLabel(m.month)}</span><div className="bar"><i style={{ width: `${(m.total * 100) / max}%` }} /></div><span className="small">{money(m.total)}</span></div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-head"><h3>Payouts</h3></div>
          {!x.payouts.length ? <Empty>No payouts yet.</Empty> : x.payouts.map((p) => (
            <div key={p.id} className="list-row static">
              <div className="grow"><b>{money(p.amount)}</b> <span className="mono">{p.code}</span><div className="muted small">to {p.destination}{p.reference ? ` · UTR ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</div></div>
              <div className="right"><Badge s={p.status} /><span className="muted small">{when(p.created_at)}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Wallet history</h3></div>
        {!x.ledger.length ? <Empty>Nothing yet.</Empty> : (
          <table className="table">
            <thead><tr><th>When</th><th>What</th><th>Captain</th><th>Amount</th></tr></thead>
            <tbody>
              {x.ledger.map((l) => (
                <tr key={l.id}><td className="small">{when(l.created_at)}</td><td>{l.note}</td><td>{l.captain_name ?? "—"}</td>
                  <td style={{ color: l.amount < 0 ? "var(--red)" : "var(--green)", fontWeight: 700 }}>{l.amount < 0 ? "−" : "+"}{money(Math.abs(l.amount))}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {withdraw ? (
        <Modal title="Withdraw to your account" onClose={() => setWithdraw(false)}>
          <p>Up to <b>{money(x.available)}</b> to {x.payout_account ?? "your payout account"}. Minimum {money(x.min_payout)}.</p>
          <label className="lbl">Amount ₹</label>
          <input inputMode="numeric" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/\D/g, ""))} />
          <button className="btn primary full" disabled={busy || Number(amount) < x.min_payout || Number(amount) > x.available} onClick={request}>Request payout</button>
        </Modal>
      ) : null}
    </div>
  );
}
