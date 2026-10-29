import React, { useState } from "react";

import { openPrivateFile, post } from "../api/client";
import { ago, Badge, day, Empty, ErrorBox, Loading, Modal, money, Page, Pager, title, toastError, useAction, useApi, when } from "./lib";

type Row = {
  id: string; code: string; name: string; city_name: string; owner_name: string; owner_phone: string; review_status: string; is_on_hold: boolean;
  captain_count: number; submitted_at: string | null; created_at: string;
};
type Doc = { id: string; doc_type: string; doc_type_label: string; number: string; status: string; note: string; file_url: string; created_at: string };
type Detail = Row & {
  legal_name: string; address: string; gstin: string; pan: string; contact_email: string; review_note: string; hold_reason: string;
  documents: Doc[]; payout_account: string | null; services: number;
  captains: { id: string; code: string; name: string; city_name: string; is_live: boolean; review_status: string }[];
  wallet: { available: number; lifetime_earned: number; paid_out: number; in_transit: number; pending_trips: number };
  recent_bookings: { id: string; code: string; title: string; status: string; start_date: string; total: number }[];
  audit: { id: number; actor_name: string; action: string; created_at: string }[];
};

const FILTERS = [["pending", "Waiting review"], ["approved", "Approved"], ["rejected", "Needs changes"], ["on_hold", "On hold"], ["draft", "Draft"], ["", "All"]];

export function AgencyList() {
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Page<Row>>("/admin/agencies/", { status, q: q || undefined, page });
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Marketplace</div><h1>Agencies</h1></div></div>
      <div className="filters">
        {FILTERS.map(([v, l]) => <button key={v} className={`chip ${status === v ? "on" : ""}`} onClick={() => { setStatus(v); setPage(1); }}>{l}</button>)}
        <input className="search" placeholder="Name, phone or AGY-ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {error ? <ErrorBox error={error} retry={reload} /> : !data && loading ? <Loading /> : !data?.results.length ? <Empty>No agencies here.</Empty> : (
        <div className="list">
          {data.results.map((a) => (
            <a key={a.id} className="list-row" href={`#/agencies/${a.id}`}>
              <div className="avatar">{a.name.slice(0, 1)}</div>
              <div className="grow"><b>{a.name}</b> <span className="mono">{a.code}</span>
                <div className="muted">{a.city_name} · {a.owner_name} {a.owner_phone} · {a.captain_count} Captain{a.captain_count === 1 ? "" : "s"}</div></div>
              <div className="right">
                <Badge s={a.review_status} />
                {a.is_on_hold ? <Badge s="failed" label="On hold" /> : null}
                <div className="muted small">{a.submitted_at ? `submitted ${ago(a.submitted_at)}` : `joined ${ago(a.created_at)}`}</div>
              </div>
            </a>
          ))}
        </div>
      )}
      <Pager page={data} current={page} onPage={setPage} />
    </div>
  );
}

export function AgencyDetail({ id }: { id: string }) {
  const { data: a, error, loading, reload } = useApi<Detail>(`/admin/agencies/${id}/`);
  const { busy, run } = useAction();
  const [modal, setModal] = useState<null | "changes" | "hold" | { doc: Doc }>(null);
  const [note, setNote] = useState("");

  if (!a && loading) return <Loading />;
  if (!a) return <ErrorBox error={error ?? "Not found"} retry={reload} />;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    if (await run(fn, ok)) { setModal(null); setNote(""); reload(); }
  };

  return (
    <div>
      <a className="back" href="#/agencies">← Agencies</a>
      <div className="page-head">
        <div><div className="eyebrow">{a.code}</div><h1>{a.name}</h1><div className="muted">{a.legal_name || "—"} · {a.city_name}</div></div>
        <div className="actions">
          {a.review_status === "pending" ? (
            <>
              <button className="btn primary" disabled={busy} onClick={() => act(() => post(`/admin/agencies/${id}/review/`, { decision: "approve" }), "Agency approved")}>Approve</button>
              <button className="btn" onClick={() => setModal("changes")}>Request changes</button>
            </>
          ) : null}
          {a.is_on_hold
            ? <button className="btn" disabled={busy} onClick={() => act(() => post(`/admin/agencies/${id}/hold/`, { hold: false }), "Released")}>Release hold</button>
            : <button className="btn danger" onClick={() => setModal("hold")}>Put on hold</button>}
        </div>
      </div>
      {a.is_on_hold ? <div className="notice bad">On hold: {a.hold_reason}. Its Captains are hidden from travelers and payouts are paused.</div> : null}
      {a.review_status === "rejected" && a.review_note ? <div className="notice warn">Changes requested: {a.review_note}</div> : null}

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Business</h3><Badge s={a.review_status} /></div>
          <div className="pad kv">
            <div><span>Owner</span><b>{a.owner_name} · {a.owner_phone}</b></div>
            <div><span>PAN</span><b>{a.pan || "—"}</b></div>
            <div><span>GSTIN</span><b>{a.gstin || "—"}</b></div>
            <div><span>Address</span><b>{a.address || "—"}</b></div>
            <div><span>Email</span><b>{a.contact_email || "—"}</b></div>
            <div><span>Payout account</span><b>{a.payout_account ?? "—"}</b></div>
            <div><span>Trips listed</span><b>{a.services}</b></div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Documents</h3></div>
          {!a.documents.length ? <Empty>Nothing uploaded.</Empty> : a.documents.map((d) => (
            <div key={d.id} className="list-row static">
              <div className="grow"><b>{d.doc_type_label}</b><div className="muted small">{d.number || "—"} · {day(d.created_at)}{d.note ? ` · ${d.note}` : ""}</div></div>
              <div className="row gap-s">
                <Badge s={d.status} />
                <button className="btn small" onClick={() => openPrivateFile(d.file_url).catch(toastError)}>View</button>
                {d.status === "pending" ? (
                  <>
                    <button className="btn small primary" disabled={busy} onClick={() => act(() => post(`/admin/agencies/documents/${d.id}/review/`, { decision: "approve" }), "Document approved")}>✓</button>
                    <button className="btn small danger" onClick={() => setModal({ doc: d })}>✕</button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><h3>Captains · {a.captains.length}</h3></div>
          {!a.captains.length ? <Empty>No Captains yet.</Empty> : a.captains.map((c) => (
            <a key={c.id} className="list-row" href={`#/captains/${c.id}`}>
              <div className="grow"><b>{c.name}</b> <span className="mono">{c.code}</span><div className="muted small">{c.city_name}</div></div>
              <div className="right"><Badge s={c.review_status} />{c.is_live ? <Badge s="in_progress" label="Live" /> : null}</div>
            </a>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><h3>Wallet</h3></div>
          <div className="pad kv">
            <div><span>Available</span><b>{money(a.wallet.available)}</b></div>
            <div><span>From booked trips</span><b>{money(a.wallet.pending_trips)}</b></div>
            <div><span>In transit</span><b>{money(a.wallet.in_transit)}</b></div>
            <div><span>Paid out</span><b>{money(a.wallet.paid_out)}</b></div>
            <div><span>Lifetime</span><b>{money(a.wallet.lifetime_earned)}</b></div>
          </div>
          {a.recent_bookings.map((b) => (
            <a key={b.id} className="list-row" href={`#/bookings/${b.id}`}>
              <div className="grow"><b>{b.title}</b> <span className="mono">{b.code}</span><div className="muted small">{day(b.start_date)}</div></div>
              <div className="right"><Badge s={b.status} /><b>{money(b.total)}</b></div>
            </a>
          ))}
        </div>
      </div>
      {a.audit.length ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h3>Audit</h3></div>
          {a.audit.map((x) => <div key={x.id} className="list-row static small"><span className="grow">{title(x.action)} · {x.actor_name}</span><span className="muted">{when(x.created_at)}</span></div>)}
        </div>
      ) : null}

      {modal === "changes" || modal === "hold" ? (
        <Modal title={modal === "changes" ? "Request changes" : "Put agency on hold"} onClose={() => setModal(null)}>
          <label className="lbl">{modal === "changes" ? "What should they fix?" : "Reason — shown to the agency"}</label>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn danger full" disabled={!note.trim() || busy} onClick={() => act(() => (modal === "changes"
            ? post(`/admin/agencies/${id}/review/`, { decision: "changes", note })
            : post(`/admin/agencies/${id}/hold/`, { hold: true, reason: note })), modal === "changes" ? "Changes requested" : "Agency on hold")}>Confirm</button>
        </Modal>
      ) : null}
      {modal && typeof modal === "object" ? (
        <Modal title={`Reject ${modal.doc.doc_type_label}`} onClose={() => setModal(null)}>
          <label className="lbl">Why — shown to the agency</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn danger full" disabled={!note.trim() || busy} onClick={() => act(() => post(`/admin/agencies/documents/${modal.doc.id}/review/`, { decision: "reject", note }), "Document rejected")}>Reject</button>
        </Modal>
      ) : null}
    </div>
  );
}
