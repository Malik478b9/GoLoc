import React, { useState } from "react";

import { post } from "../api/client";
import { ago, Badge, day, Empty, ErrorBox, Loading, Modal, money, Page, Pager, useAction, useApi, when } from "./lib";
import type { BookingRow } from "./types";

type Candidate = { id: string; code: string; name: string; rating_avg: string; trips_completed: number };
type Detail = BookingRow & {
  meeting_point: string; note: string; actions?: unknown; candidates: Candidate[];
  events: { kind: string; message: string; actor_role: string; created_at: string }[];
};

const dates = (b: BookingRow) => (b.start_date === b.end_date ? day(b.start_date) : `${day(b.start_date)} → ${day(b.end_date)}`);

export function BookingTable({ rows, empty, onOpen }: { rows: BookingRow[]; empty: string; onOpen?: (b: BookingRow) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <>
      {rows.map((b) => (
        <button key={b.id} className="list-row" onClick={() => (onOpen ? onOpen(b) : setOpen(b.code))}>
          <div className="grow">
            <b>{b.title}</b> <span className="mono">{b.code}</span>
            <div className="muted small">{dates(b)} · {b.guests} guest{b.guests > 1 ? "s" : ""} · {b.traveler.name} · Captain {b.captain.name}</div>
          </div>
          <div className="right">
            <Badge s={b.status} label={b.status_label} />
            <b>{money(b.captain_net)}</b>
            {b.status === "requested" && b.request_expires_at ? <span className="muted small">answer by {when(b.request_expires_at)}</span> : null}
          </div>
        </button>
      ))}
      {open ? <BookingModal code={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function BookingModal({ code, onClose, onChanged }: { code: string; onClose: () => void; onChanged?: () => void }) {
  const d = useApi<Detail>(`/agency/bookings/${code}/`);
  const { busy, run } = useAction();
  const [reason, setReason] = useState("");
  const act = async (action: string, body?: unknown, ok = "Done") => {
    if (await run(() => post(`/agency/bookings/${code}/${action}/`, body), ok)) {
      d.reload();
      onChanged?.();
    }
  };
  const b = d.data;
  return (
    <Modal title={`Booking ${code}`} onClose={onClose}>
      {d.error ? <ErrorBox error={d.error} /> : !b ? <Loading /> : (
        <div>
          <p><b>{b.title}</b></p>
          <div className="kv" style={{ margin: "10px 0" }}>
            <div><span>Status</span><b><Badge s={b.status} label={b.status_label} /></b></div>
            <div><span>Dates</span><b>{dates(b)}</b></div>
            <div><span>Guests</span><b>{b.guests}</b></div>
            <div><span>Traveler</span><b>{b.traveler.name} {b.traveler.phone ?? b.traveler.phone_masked ?? ""}</b></div>
            <div><span>Captain</span><b>{b.captain.name} ({b.captain.code})</b></div>
            <div><span>Fare</span><b>{money(b.fare)}</b></div>
            <div><span>Your share (after commission)</span><b>{money(b.captain_net)}</b></div>
            {b.meeting_point ? <div><span>Meeting point</span><b>{b.meeting_point}</b></div> : null}
          </div>
          {b.note ? <p className="notes">{b.note}</p> : null}

          {b.status === "requested" ? (
            <div className="row gap-s" style={{ marginTop: 10 }}>
              <button className="btn primary" disabled={busy} onClick={() => act("accept", undefined, `Accepted for ${b.captain.name}`)}>Accept for {b.captain.name.split(" ")[0]}</button>
            </div>
          ) : null}

          {["requested", "accepted", "confirmed"].includes(b.status) ? (
            <>
              <label className="lbl">Give it to another Captain (free on these dates)</label>
              {b.candidates.length ? (
                <div className="list">
                  {b.candidates.map((c) => (
                    <div key={c.id} className="list-row static">
                      <div className="grow"><b>{c.name}</b> <span className="mono">{c.code}</span><div className="muted small">★ {Number(c.rating_avg).toFixed(1)} · {c.trips_completed} trips</div></div>
                      <button className="btn small" disabled={busy} onClick={() => act("assign", { captain_id: c.id }, `Assigned to ${c.name}`)}>Assign</button>
                    </div>
                  ))}
                </div>
              ) : <p className="muted small">No other Captain who offers this trip is free on these dates.</p>}
            </>
          ) : null}

          {b.status === "requested" ? (
            <>
              <label className="lbl">Or decline — the traveler is told why</label>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fully booked that week" />
              <button className="btn danger full" disabled={busy} onClick={() => act("decline", { reason }, "Declined")}>Decline request</button>
            </>
          ) : null}

          <label className="lbl">Timeline</label>
          <div className="list">
            {b.events.map((e, i) => <div key={i} className="small"><span className="muted">{ago(e.created_at)} · {e.actor_role}</span> — {e.message}</div>)}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Bookings() {
  const [tab, setTab] = useState<"requested" | "upcoming" | "active" | "past">("requested");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useApi<Page<BookingRow>>("/agency/bookings/", { status: tab, page }, 30000);
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Bookings</div><h1>Your Captains' trips</h1></div></div>
      <div className="filters">
        {([["requested", "Requests"], ["upcoming", "Upcoming"], ["active", "On trip now"], ["past", "Past"]] as const).map(([v, l]) => (
          <button key={v} className={`chip ${tab === v ? "on" : ""}`} onClick={() => { setTab(v); setPage(1); }}>{l}</button>
        ))}
      </div>
      {tab === "requested" ? <p className="muted small" style={{ marginBottom: 10 }}>The traveler picked one of your Captains. Accept for them, give it to a free colleague, or decline. If a Captain declines in their app, we pass it to a free colleague automatically.</p> : null}
      {list.error ? <ErrorBox error={list.error} retry={list.reload} /> : !list.data ? <Loading /> : (
        <div className="list"><BookingTable rows={list.data.results} empty="Nothing here." onOpen={(b) => setOpen(b.code)} /></div>
      )}
      <Pager page={list.data} current={page} onPage={setPage} />
      {open ? <BookingModal code={open} onClose={() => setOpen(null)} onChanged={list.reload} /> : null}
    </div>
  );
}
