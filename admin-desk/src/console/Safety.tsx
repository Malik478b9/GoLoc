import React, { useState } from "react";

import { post } from "../api/client";
import { ago, Badge, Empty, ErrorBox, Loading, mapLink, Page, title, useAction, useApi, when } from "./lib";

type Alert = {
  id: number; code: string; booking_code: string; role: string; raised_by_name: string; raised_by_phone: string; city_name: string;
  lat: string | null; lng: string | null; message: string; status: string; notes: string; acknowledged_at: string | null; resolved_at: string | null; created_at: string;
};
type Detail = Alert & {
  booking: { id: string; code: string; title: string; status: string };
  captain: { name: string; code: string; phone: string };
  traveler: { name: string; phone: string; emergency_contact: { name: string; phone: string } | null };
  captain_location: { lat: number; lng: number; at: string } | null;
  traveler_location: { lat: number; lng: number; at: string } | null;
};

export function SOSList() {
  const [status, setStatus] = useState("active");
  const { data, error, loading, reload } = useApi<Page<Alert>>("/admin/sos/", { status }, 10000);
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Trust & safety</div><h1>SOS alerts</h1></div><span className="muted small">Refreshes every 10 s</span></div>
      <div className="filters">
        {[["active", "Active"], ["resolved", "Resolved"], ["false_alarm", "False alarm"], ["", "All"]].map(([v, l]) => (
          <button key={v} className={`chip ${status === v ? "on" : ""}`} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      {error ? <ErrorBox error={error} retry={reload} /> : !data && loading ? <Loading /> : !data?.results.length ? <Empty>{status === "active" ? "No active alerts. 🙏" : "Nothing here."}</Empty> : (
        <div className="list">
          {data.results.map((a) => (
            <a key={a.id} href={`#/sos/${a.id}`} className={`list-row ${a.status === "open" ? "urgent" : ""}`}>
              <div className="grow">
                <b>{a.code}</b> <span className="mono">{a.booking_code}</span>
                <div className="muted small">{title(a.role)} {a.raised_by_name} · {a.raised_by_phone} · {a.city_name}</div>
                {a.message ? <div className="small">“{a.message}”</div> : null}
              </div>
              <div className="right"><Badge s={a.status} /><div className="muted small">{ago(a.created_at)}</div></div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function SOSDetail({ id }: { id: string }) {
  const { data: a, error, loading, reload } = useApi<Detail>(`/admin/sos/${id}/`, undefined, 10000);
  const { busy, run } = useAction();
  const [notes, setNotes] = useState("");
  if (!a && loading) return <Loading />;
  if (!a) return <ErrorBox error={error ?? "Not found"} retry={reload} />;
  const update = async (status: string) => {
    if (await run(() => post(`/admin/sos/${id}/`, { status, notes }), `Marked ${title(status).toLowerCase()}`)) {
      setNotes("");
      reload();
    }
  };
  const where = mapLink(a.lat, a.lng);
  const done = ["resolved", "false_alarm"].includes(a.status);

  return (
    <div>
      <a className="back" href="#/sos">← SOS alerts</a>
      <div className="page-head">
        <div>
          <div className="eyebrow">{a.city_name} · raised {when(a.created_at)}</div>
          <h1>{a.code} <Badge s={a.status} /></h1>
          <div className="muted">Booking <a href={`#/bookings/${a.booking.id}`}>{a.booking.code}</a> · {a.booking.title}</div>
        </div>
      </div>
      {a.message ? <div className="notice bad">“{a.message}”</div> : null}

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Call now</h3></div>
          <div className="pad call-list">
            <a className="call" href={`tel:${a.raised_by_phone}`}>📞 {title(a.role)} who raised it · {a.raised_by_name} <b>{a.raised_by_phone}</b></a>
            <a className="call" href={`tel:${a.traveler.phone}`}>📞 Traveler · {a.traveler.name} <b>{a.traveler.phone}</b></a>
            <a className="call" href={`tel:${a.captain.phone}`}>📞 Captain · {a.captain.name} ({a.captain.code}) <b>{a.captain.phone}</b></a>
            {a.traveler.emergency_contact?.phone ? (
              <a className="call" href={`tel:${a.traveler.emergency_contact.phone}`}>📞 Emergency contact · {a.traveler.emergency_contact.name} <b>{a.traveler.emergency_contact.phone}</b></a>
            ) : <p className="muted small">Traveler hasn't set an emergency contact.</p>}
            <a className="call bad" href="tel:112">🚨 Police / ambulance <b>112</b></a>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3>Location</h3></div>
          <div className="pad kv">
            <div><span>At SOS</span><b>{where ? <a href={where} target="_blank" rel="noreferrer">{a.lat}, {a.lng} ↗</a> : "Not available"}</b></div>
            <div><span>Captain now</span><b>{a.captain_location ? <a href={mapLink(a.captain_location.lat, a.captain_location.lng)!} target="_blank" rel="noreferrer">Map · {ago(a.captain_location.at)}</a> : "—"}</b></div>
            <div><span>Traveler now</span><b>{a.traveler_location ? <a href={mapLink(a.traveler_location.lat, a.traveler_location.lng)!} target="_blank" rel="noreferrer">Map · {ago(a.traveler_location.at)}</a> : "—"}</b></div>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Handling</h3></div>
        <div className="pad">
          {a.notes ? <pre className="notes">{a.notes}</pre> : null}
          <textarea rows={3} placeholder="What did you do? (called traveler, informed police, …)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="row gap-s wrap" style={{ marginTop: 10 }}>
            {a.status === "open" ? <button className="btn primary" disabled={busy} onClick={() => update("acknowledged")}>Acknowledge</button> : null}
            {!done ? <button className="btn" disabled={busy} onClick={() => update("resolved")}>Resolve</button> : null}
            {!done ? <button className="btn ghost" disabled={busy} onClick={() => update("false_alarm")}>False alarm</button> : null}
            {done && notes.trim() ? <button className="btn" disabled={busy} onClick={() => update(a.status)}>Add note</button> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
