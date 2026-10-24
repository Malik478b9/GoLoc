import React from "react";

import { ErrorBox, Loading, money, Stat, title, useApi } from "./lib";

type Dash = {
  gmv_week: number;
  gmv_change_pct: number | null;
  commission_week: number;
  insurance_margin_week: number;
  trips_today: number;
  trips_live: number;
  captains_live: number;
  captains_pending: number;
  documents_pending: number;
  captains_on_hold: number;
  travelers: number;
  sos_open: number;
  tickets_open: number;
  payouts_pending: { n: number; s: number | null };
  refunds_failed: number;
  bookings_by_status: Record<string, number>;
  top_cities: { city__name: string; gmv: number; n: number }[];
};

export default function Dashboard() {
  const { data: d, error, loading, reload } = useApi<Dash>("/admin/dashboard/", undefined, 15000);
  if (!d && loading) return <Loading />;
  if (!d) return <ErrorBox error={error ?? "Couldn't load"} retry={reload} />;
  const go = (h: string) => () => (window.location.hash = h);
  const queue = [
    d.sos_open && { tone: "bad", text: `${d.sos_open} open SOS alert${d.sos_open > 1 ? "s" : ""}`, href: "#/sos" },
    d.refunds_failed && { tone: "bad", text: `${d.refunds_failed} refund${d.refunds_failed > 1 ? "s" : ""} failed — retry`, href: "#/payouts" },
    d.captains_pending && { tone: "warn", text: `${d.captains_pending} Captain${d.captains_pending > 1 ? "s" : ""} waiting for verification`, href: "#/captains" },
    d.documents_pending && { tone: "warn", text: `${d.documents_pending} document${d.documents_pending > 1 ? "s" : ""} to review`, href: "#/captains" },
    d.payouts_pending.n && { tone: "warn", text: `${d.payouts_pending.n} payout${d.payouts_pending.n > 1 ? "s" : ""} to send · ${money(d.payouts_pending.s)}`, href: "#/payouts" },
    d.tickets_open && { tone: "info", text: `${d.tickets_open} open dispute${d.tickets_open > 1 ? "s" : ""} / ticket${d.tickets_open > 1 ? "s" : ""}`, href: "#/tickets" },
  ].filter(Boolean) as { tone: string; text: string; href: string }[];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Marketplace operations</div>
          <h1>Command Center</h1>
        </div>
      </div>

      <div className="stats">
        <Stat label="Gross booking value · 7d" value={money(d.gmv_week)} hint={d.gmv_change_pct == null ? "No prior week" : `${d.gmv_change_pct >= 0 ? "↑" : "↓"} ${Math.abs(d.gmv_change_pct)}% vs last week`} tone={d.gmv_change_pct != null && d.gmv_change_pct < 0 ? "bad" : "good"} />
        <Stat label="Platform revenue · 7d" value={money(d.commission_week + d.insurance_margin_week)} hint={`${money(d.commission_week)} commission · ${money(d.insurance_margin_week)} insurance`} />
        <Stat label="Trips today" value={d.trips_today} hint={`${d.trips_live} live now`} onClick={go("#/bookings")} />
        <Stat label="Open SOS" value={d.sos_open} tone={d.sos_open ? "bad" : undefined} hint="Live safety alerts" onClick={go("#/sos")} />
        <Stat label="Captains live" value={d.captains_live} hint={`${d.captains_pending} pending · ${d.captains_on_hold} on hold`} onClick={go("#/captains")} />
        <Stat label="Travelers who booked" value={d.travelers} />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Action queue</h3></div>
          {queue.length ? queue.map((x) => (
            <a key={x.text} href={x.href} className={`queue-row ${x.tone}`}><span>{x.text}</span><span>→</span></a>
          )) : <p className="muted pad">All clear. Nothing needs you right now.</p>}
        </section>
        <section className="card">
          <div className="card-head"><h3>Bookings by status</h3></div>
          <div className="pad bars">
            {Object.entries(d.bookings_by_status).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
              const max = Math.max(...Object.values(d.bookings_by_status));
              return (
                <a key={k} className="bar-row" href={`#/bookings?status=${k}`}>
                  <span>{title(k)}</span>
                  <span className="bar"><i style={{ width: `${(v / max) * 100}%` }} /></span>
                  <b>{v}</b>
                </a>
              );
            })}
            {!Object.keys(d.bookings_by_status).length ? <p className="muted">No bookings yet.</p> : null}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Top cities · 30 days</h3></div>
        <table className="table">
          <thead><tr><th>City</th><th>Paid bookings</th><th>GMV</th></tr></thead>
          <tbody>
            {d.top_cities.map((c) => <tr key={c.city__name}><td>{c.city__name}</td><td>{c.n}</td><td>{money(c.gmv)}</td></tr>)}
            {!d.top_cities.length ? <tr><td colSpan={3} className="muted">No paid bookings in the last 30 days.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
