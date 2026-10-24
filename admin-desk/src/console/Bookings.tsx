import React, { useEffect, useState } from "react";

import { post } from "../api/client";
import { ago, Badge, day, Empty, ErrorBox, Loading, mapLink, Modal, money, Page, Pager, title, useAction, useApi, useRoute, when } from "./lib";

type Row = {
  id: string; code: string; status: string; title: string; start_date: string; end_date: string; guests: number; tier: string; total: number;
  commission: number; insurance_fee: number; city_name: string; captain: { id: string; code: string; name: string; phone?: string };
  traveler: { name: string; phone?: string }; created_at: string;
};
type Detail = Row & {
  fare: number; captain_net: number; insurance_premium: number; insurance_policy_no: string; meeting_point: string; note: string; start_time: string;
  cancelled_by: string; cancel_reason: string; refund_percent: number | null; refunded: number; start_pin: null; share_token: string;
  events: { kind: string; message: string; actor_role: string; created_at: string }[];
  payments: { id: string; gateway: string; order_id: string; payment_id: string; amount: number; refunded_amount: number; status: string; method: string; created_at: string }[];
  refunds_list: { id: string; amount: number; reason: string; status: string; gateway_refund_id: string; created_at: string }[];
  sos: { id: number; code: string; status: string; created_at: string }[];
  captain_location: { lat: number; lng: number; at: string } | null;
  traveler_location: { lat: number; lng: number; at: string } | null;
};
const STATUSES = ["", "requested", "accepted", "confirmed", "in_progress", "completed", "cancelled", "declined", "expired"];

export function BookingList() {
  const [, , query] = useRoute();
  const [status, setStatus] = useState(query.get("status") ?? "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setStatus(query.get("status") ?? ""), [query]);
  const { data, error, loading, reload } = useApi<Page<Row>>("/admin/bookings/", { status: status || undefined, q: q || undefined, page }, 30000);
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Operations</div><h1>Bookings</h1></div></div>
      <div className="filters">
        {STATUSES.map((s) => <button key={s} className={`chip ${status === s ? "on" : ""}`} onClick={() => { setStatus(s); setPage(1); }}>{s ? title(s) : "All"}</button>)}
        <input className="search" placeholder="BKG-ID, CAP-ID, traveler name or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {error ? <ErrorBox error={error} retry={reload} /> : !data && loading ? <Loading /> : !data?.results.length ? <Empty>No bookings.</Empty> : (
        <div className="list">
          {data.results.map((b) => (
            <a key={b.id} href={`#/bookings/${b.id}`} className="list-row">
              <div className="grow">
                <span className="mono">{b.code}</span> <b>{b.title}</b>
                <div className="muted small">{day(b.start_date)} · {b.guests} guests · {b.city_name} · {b.captain.name} ({b.captain.code}) · {b.traveler.name}</div>
              </div>
              <div className="right"><Badge s={b.status} /><div><b>{money(b.total)}</b></div><div className="muted small">{ago(b.created_at)}</div></div>
            </a>
          ))}
        </div>
      )}
      <Pager page={data} current={page} onPage={setPage} />
    </div>
  );
}

export function BookingDetail({ id }: { id: string }) {
  const { data: b, error, loading, reload } = useApi<Detail>(`/admin/bookings/${id}/`, undefined, 20000);
  const { busy, run } = useAction();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pct, setPct] = useState(100);
  if (!b && loading) return <Loading />;
  if (!b) return <ErrorBox error={error ?? "Not found"} retry={reload} />;
  const live = ["confirmed", "in_progress"].includes(b.status);

  return (
    <div>
      <a className="back" href="#/bookings">← Bookings</a>
      <div className="page-head">
        <div>
          <div className="eyebrow mono">{b.code}</div>
          <h1>{b.title}</h1>
          <div className="muted">{day(b.start_date)}{b.end_date !== b.start_date ? ` – ${day(b.end_date)}` : ""} · {b.start_time?.slice(0, 5)} · {b.guests} guests · {b.city_name}{b.tier !== "standard" ? ` · ${title(b.tier)}` : ""}</div>
          <div style={{ marginTop: 6 }}><Badge s={b.status} /></div>
        </div>
        <div className="actions">
          {["requested", "accepted", "confirmed", "in_progress"].includes(b.status) ? <button className="btn danger" onClick={() => setCancelOpen(true)}>Cancel & refund</button> : null}
          {b.status === "in_progress" ? (
            <button className="btn" disabled={busy} onClick={async () => (await run(() => post(`/admin/bookings/${b.id}/complete/`), "Marked complete — Captain credited")) && reload()}>Force complete</button>
          ) : null}
        </div>
      </div>

      {b.sos.length ? <div className="notice bad">SOS on this trip: {b.sos.map((s) => <a key={s.id} href={`#/sos/${s.id}`}>{s.code} ({title(s.status)}) </a>)}</div> : null}

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>People</h3></div>
          <div className="pad kv">
            <div><span>Captain</span><b><a href={`#/captains/${b.captain.id}`}>{b.captain.name} · {b.captain.code}</a> · {b.captain.phone}</b></div>
            <div><span>Traveler</span><b>{b.traveler.name} · {b.traveler.phone}</b></div>
            <div><span>Meeting point</span><b>{b.meeting_point || "—"}</b></div>
            <div><span>Note</span><b>{b.note || "—"}</b></div>
            {live ? (
              <>
                <div><span>Captain location</span><b>{b.captain_location ? <a href={mapLink(b.captain_location.lat, b.captain_location.lng)!} target="_blank" rel="noreferrer">Map · {ago(b.captain_location.at)}</a> : "Not shared"}</b></div>
                <div><span>Traveler location</span><b>{b.traveler_location ? <a href={mapLink(b.traveler_location.lat, b.traveler_location.lng)!} target="_blank" rel="noreferrer">Map · {ago(b.traveler_location.at)}</a> : "Not shared"}</b></div>
              </>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>Money</h3></div>
          <div className="pad kv">
            <div><span>Fare</span><b>{money(b.fare)}</b></div>
            <div><span>Insurance (charged / premium)</span><b>{money(b.insurance_fee)} / {money(b.insurance_premium)}</b></div>
            <div><span>Total</span><b>{money(b.total)}</b></div>
            <div><span>Commission</span><b>{money(b.commission)}</b></div>
            <div><span>Captain net</span><b>{money(b.captain_net)}</b></div>
            <div><span>Policy</span><b>{b.insurance_policy_no || "—"}</b></div>
            {b.refund_percent != null ? <div><span>Refund</span><b>{b.refund_percent}% · {money(b.refunded)} processed</b></div> : null}
            {b.cancel_reason ? <div><span>Cancelled</span><b>by {b.cancelled_by}: {b.cancel_reason}</b></div> : null}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>Payments & refunds</h3></div>
          {b.payments.map((p) => (
            <div key={p.id} className="list-row static">
              <div className="grow"><b>{money(p.amount)}</b> <span className="muted small">{p.gateway} · {p.payment_id || p.order_id}{p.method ? ` · ${p.method}` : ""}</span></div>
              <div className="right"><Badge s={p.status} /><div className="muted small">{when(p.created_at)}</div></div>
            </div>
          ))}
          {b.refunds_list.map((r) => (
            <div key={r.id} className="list-row static">
              <div className="grow">↩ <b>{money(r.amount)}</b> <span className="muted small">{r.reason}</span></div>
              <div className="right"><Badge s={r.status} /><div className="muted small">{when(r.created_at)}</div></div>
            </div>
          ))}
          {!b.payments.length ? <p className="muted pad">No payment yet.</p> : null}
        </section>

        <section className="card">
          <div className="card-head"><h3>Timeline</h3></div>
          {b.events.map((e, i) => (
            <div key={i} className="list-row static">
              <div className="grow">{e.message}<div className="muted small">{e.actor_role}</div></div>
              <div className="muted small">{when(e.created_at)}</div>
            </div>
          ))}
        </section>
      </div>

      {cancelOpen ? (
        <Modal title={`Cancel ${b.code}`} onClose={() => setCancelOpen(false)}>
          <p className="muted">Refund percent applies to the fare. Insurance is refunded in full if the trip hadn't started.</p>
          <label className="lbl">Refund % of fare</label>
          <div className="row gap-s">{[100, 75, 50, 25, 0].map((p) => <button key={p} className={`chip ${pct === p ? "on" : ""}`} onClick={() => setPct(p)}>{p}%</button>)}</div>
          <label className="lbl">Reason (both parties see it)</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn danger full" disabled={!reason.trim() || busy}
            onClick={async () => { if (await run(() => post(`/admin/bookings/${b.id}/cancel/`, { reason, refund_percent: pct }), "Cancelled and refund started")) { setCancelOpen(false); reload(); } }}>
            Cancel booking
          </button>
        </Modal>
      ) : null}
    </div>
  );
}
