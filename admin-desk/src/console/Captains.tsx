import React, { useState } from "react";

import { openPrivateFile, post } from "../api/client";
import { ago, Badge, Empty, ErrorBox, Loading, Modal, money, Page, Pager, title, toastError, useAction, useApi } from "./lib";

type Row = {
  id: string; code: string; name: string; phone: string; avatar: string | null; city_name: string; captain_type: "captain" | "guide"; review_status: string; is_live: boolean;
  is_on_hold: boolean; is_featured: boolean; rating_avg: string; rating_count: number; trips_completed: number; submitted_at: string | null;
  last_active_at: string; created_at: string;
};
type Doc = { id: string; doc_type: string; doc_type_label: string; number: string; expires_on: string | null; status: string; note: string; created_at: string; file_path: string };
type Detail = Row & {
  tagline: string; bio: string; years_experience: number; languages: string[]; categories: string[]; max_bookings_per_day: number; review_note: string;
  hold_reason: string; profile_views: number; documents: Doc[];
  services: { id: string; kind: string; title: string; category: string; price: number; normal_price: number; medium_price: number; lavish_price: number; duration_days: number; duration_hours: number }[];
  vehicles: { make_model: string; registration_number: string; capacity: number; has_ac: boolean; kind: string }[];
  payout_account: { method: string; account_holder: string; upi_id: string; account_number: string; ifsc: string } | null;
  wallet: { available: number; lifetime_earned: number; paid_out: number; in_transit: number; pending_trips: number };
  recent_bookings: { id: string; code: string; title: string; status: string; start_date: string; total: number }[];
  audit: { id: number; actor_name: string; action: string; created_at: string; data: Record<string, unknown> }[];
};

const FILTERS = [
  ["pending", "Waiting review"],
  ["live", "Live"],
  ["approved", "Approved"],
  ["rejected", "Needs changes"],
  ["on_hold", "On hold"],
  ["draft", "Draft"],
  ["", "All"],
];

export function CaptainList() {
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Page<Row>>("/admin/captains/", { status, q: q || undefined, page });
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Marketplace</div><h1>Captains</h1></div></div>
      <div className="filters">
        {FILTERS.map(([v, l]) => <button key={v} className={`chip ${status === v ? "on" : ""}`} onClick={() => { setStatus(v); setPage(1); }}>{l}</button>)}
        <input className="search" placeholder="Name, phone or CAP-ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {error ? <ErrorBox error={error} retry={reload} /> : !data && loading ? <Loading /> : !data?.results.length ? <Empty>No Captains here.</Empty> : (
        <div className="list">
          {data.results.map((c) => (
            <a key={c.id} className="list-row" href={`#/captains/${c.id}`}>
              <div className="avatar">{c.avatar ? <img src={c.avatar} alt="" /> : c.name.slice(0, 1)}</div>
              <div className="grow">
                <b>{c.name}</b> <span className="mono">{c.code}</span>
                <div className="muted">{c.captain_type === "guide" ? "Guide" : "Captain"} · {c.city_name} · {c.phone} · {c.trips_completed} trips · ★ {Number(c.rating_avg).toFixed(1)}</div>
              </div>
              <div className="right">
                <Badge s={c.review_status} />
                {c.is_on_hold ? <Badge s="failed" label="On hold" /> : c.is_live ? <Badge s="in_progress" label="Live" /> : null}
                <div className="muted small">{c.submitted_at && status === "pending" ? `submitted ${ago(c.submitted_at)}` : `active ${ago(c.last_active_at)}`}</div>
              </div>
            </a>
          ))}
        </div>
      )}
      <Pager page={data} current={page} onPage={setPage} />
    </div>
  );
}

export function CaptainDetail({ id }: { id: string }) {
  const { data: c, error, loading, reload } = useApi<Detail>(`/admin/captains/${id}/`);
  const { busy, run } = useAction();
  const [modal, setModal] = useState<null | "changes" | "hold" | { doc: Doc }>(null);
  const [note, setNote] = useState("");

  if (!c && loading) return <Loading />;
  if (!c) return <ErrorBox error={error ?? "Not found"} retry={reload} />;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    if (await run(fn, ok)) {
      setModal(null);
      setNote("");
      reload();
    }
  };
  const docOpen = (d: Doc) => openPrivateFile(d.file_path).catch(toastError);

  return (
    <div>
      <a className="back" href="#/captains">← Captains</a>
      <div className="page-head">
        <div className="row gap">
          <div className="avatar lg">{c.avatar ? <img src={c.avatar} alt="" /> : c.name.slice(0, 1)}</div>
          <div>
            <div className="eyebrow mono">{c.code}</div>
            <h1>{c.name}</h1>
            <div className="muted">{c.captain_type === "guide" ? "Local guide" : "Captain · full service"} · {c.city_name} · {c.phone} · joined {ago(c.created_at)}</div>
            <div className="row gap-s" style={{ marginTop: 6 }}>
              <Badge s={c.review_status} />
              {c.is_live ? <Badge s="in_progress" label="Live" /> : <Badge s="draft" label="Offline" />}
              {c.is_on_hold ? <Badge s="failed" label="On hold" /> : null}
              {c.is_featured ? <Badge s="approved" label="Featured" /> : null}
            </div>
          </div>
        </div>
        <div className="actions">
          {c.review_status === "pending" ? (
            <>
              <button className="btn primary" disabled={busy} onClick={() => act(() => post(`/admin/captains/${id}/review/`, { decision: "approve" }), "Approved — Captain notified")}>Approve</button>
              <button className="btn" onClick={() => setModal("changes")}>Request changes</button>
            </>
          ) : null}
          {c.is_on_hold ? (
            <button className="btn" disabled={busy} onClick={() => act(() => post(`/admin/captains/${id}/hold/`, { hold: false }), "Released from hold")}>Release hold</button>
          ) : (
            <button className="btn danger" onClick={() => setModal("hold")}>Put on hold</button>
          )}
          <button className="btn ghost" disabled={busy} onClick={() => act(() => post(`/admin/captains/${id}/feature/`, { featured: !c.is_featured }), c.is_featured ? "Unfeatured" : "Featured")}>
            {c.is_featured ? "Unfeature" : "Feature"}
          </button>
        </div>
      </div>

      {c.is_on_hold ? <div className="notice bad">On hold: {c.hold_reason}</div> : null}
      {c.review_status === "rejected" && c.review_note ? <div className="notice warn">Changes requested: {c.review_note}</div> : null}

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Verification documents</h3></div>
          {c.documents.length ? c.documents.map((d) => (
            <div key={d.id} className="list-row static">
              <div className="grow">
                <b>{d.doc_type_label}</b>
                <div className="muted small">{d.number ? `${d.number} · ` : ""}uploaded {ago(d.created_at)}{d.expires_on ? ` · expires ${d.expires_on}` : ""}</div>
                {d.note ? <div className="muted small">Note: {d.note}</div> : null}
              </div>
              <div className="right row gap-s">
                <Badge s={d.status} />
                <button className="btn small" onClick={() => docOpen(d)}>View</button>
                {d.status === "pending" ? (
                  <>
                    <button className="btn small primary" disabled={busy} onClick={() => act(() => post(`/admin/documents/${d.id}/review/`, { decision: "approve" }), "Document approved")}>✓</button>
                    <button className="btn small danger" onClick={() => setModal({ doc: d })}>✕</button>
                  </>
                ) : null}
              </div>
            </div>
          )) : <p className="muted pad">No documents uploaded.</p>}
        </section>

        <section className="card">
          <div className="card-head"><h3>Business</h3></div>
          <div className="pad kv">
            <div><span>Tagline</span><b>{c.tagline || "—"}</b></div>
            <div><span>Experience</span><b>{c.years_experience} yrs</b></div>
            <div><span>Languages</span><b>{c.languages.join(", ") || "—"}</b></div>
            <div><span>Specialties</span><b>{c.categories.map(title).join(", ") || "—"}</b></div>
            <div><span>Trips / day</span><b>{c.max_bookings_per_day}</b></div>
            <div><span>Rating</span><b>★ {Number(c.rating_avg).toFixed(2)} ({c.rating_count}) · {c.trips_completed} trips · {c.profile_views} views</b></div>
          </div>
          {c.bio ? <p className="pad muted">{c.bio}</p> : null}
        </section>

        <section className="card">
          <div className="card-head"><h3>Services</h3></div>
          {c.services.map((s) => (
            <div key={s.id} className="list-row static">
              <div className="grow"><b>{s.title}</b><div className="muted small">{title(s.category)} · {s.kind === "package" ? `${s.duration_days} days` : s.kind === "guide" ? `guide · ${s.duration_hours} h/day` : `${s.duration_hours} h`}</div></div>
              <div className="right">{s.kind === "package" ? `${money(s.normal_price)} / ${money(s.medium_price)} / ${money(s.lavish_price)} pp` : s.kind === "guide" ? `${money(s.price)} / day` : money(s.price)}</div>
            </div>
          ))}
          {c.vehicles.map((v) => (
            <div key={v.registration_number} className="list-row static">
              <div className="grow"><b>{v.make_model}</b><div className="muted small">{v.kind} · {v.capacity} seats{v.has_ac ? " · AC" : ""}</div></div>
              <div className="right mono">{v.registration_number}</div>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-head"><h3>Money</h3></div>
          <div className="pad kv">
            <div><span>Wallet</span><b>{money(c.wallet.available)}</b></div>
            <div><span>On upcoming trips</span><b>{money(c.wallet.pending_trips)}</b></div>
            <div><span>Lifetime earned</span><b>{money(c.wallet.lifetime_earned)}</b></div>
            <div><span>Paid out</span><b>{money(c.wallet.paid_out)}{c.wallet.in_transit ? ` (+${money(c.wallet.in_transit)} in transit)` : ""}</b></div>
            <div><span>Payout to</span><b>{c.payout_account ? (c.payout_account.method === "upi" ? `UPI ${c.payout_account.upi_id}` : `${c.payout_account.account_number} · ${c.payout_account.ifsc}`) : "Not set"}</b></div>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Recent bookings</h3></div>
        <table className="table">
          <tbody>
            {c.recent_bookings.map((b) => (
              <tr key={b.id} onClick={() => (window.location.hash = `#/bookings/${b.id}`)} className="click">
                <td className="mono">{b.code}</td><td>{b.title}</td><td>{b.start_date}</td><td><Badge s={b.status} /></td><td>{money(b.total)}</td>
              </tr>
            ))}
            {!c.recent_bookings.length ? <tr><td className="muted">No bookings yet.</td></tr> : null}
          </tbody>
        </table>
      </section>

      {c.audit.length ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h3>Admin history</h3></div>
          {c.audit.map((a) => <div key={a.id} className="list-row static"><div className="grow">{title(a.action)} by {a.actor_name}</div><div className="muted small">{ago(a.created_at)}</div></div>)}
        </section>
      ) : null}

      {modal === "changes" || modal === "hold" ? (
        <Modal title={modal === "changes" ? "Request changes" : "Put on hold"} onClose={() => setModal(null)}>
          <p className="muted">{modal === "changes" ? "The Captain sees this note and can fix and resubmit." : "They go offline immediately and payouts pause until you release them."}</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={modal === "changes" ? "e.g. Profile photo must clearly show your face." : "Reason"} />
          <button className={`btn ${modal === "hold" ? "danger" : "primary"} full`} disabled={!note.trim() || busy}
            onClick={() => act(() => (modal === "changes"
              ? post(`/admin/captains/${id}/review/`, { decision: "changes", note })
              : post(`/admin/captains/${id}/hold/`, { hold: true, reason: note })), modal === "changes" ? "Changes requested" : "Captain put on hold")}>
            {modal === "changes" ? "Send to Captain" : "Put on hold"}
          </button>
        </Modal>
      ) : null}
      {modal && typeof modal === "object" ? (
        <Modal title={`Reject ${modal.doc.doc_type_label}`} onClose={() => setModal(null)}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Photo is blurry — please re-upload." />
          <button className="btn danger full" disabled={!note.trim() || busy} onClick={() => act(() => post(`/admin/documents/${modal.doc.id}/review/`, { decision: "reject", note }), "Document rejected — Captain notified")}>Reject</button>
        </Modal>
      ) : null}
    </div>
  );
}
