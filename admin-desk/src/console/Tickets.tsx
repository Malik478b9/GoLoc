import React, { useState } from "react";

import { post } from "../api/client";
import { ago, Badge, Empty, ErrorBox, Loading, Modal, money, Page, Pager, title, useAction, useApi } from "./lib";

type Ticket = {
  id: number; code: string; role: string; category: string; subject: string; description: string; status: string; resolution: string;
  refund_amount: number; booking_code: string | null; raised_by_name: string; raised_by_phone: string; created_at: string; resolved_at: string | null;
};

export function Tickets() {
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Page<Ticket>>("/admin/tickets/", { status, page }, 30000);
  const { busy, run } = useAction();
  const [open, setOpen] = useState<Ticket | null>(null);
  const [resolution, setResolution] = useState("");
  const [refund, setRefund] = useState("");

  const submit = async (next: string) => {
    if (!open) return;
    const ok = await run(() => post(`/admin/tickets/${open.id}/`, { status: next, resolution, refund_amount: Number(refund) || 0 }), next === "in_review" ? "Marked in review" : "Ticket updated — user notified");
    if (ok) {
      setOpen(null);
      setResolution("");
      setRefund("");
      reload();
    }
  };

  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Trust & safety</div><h1>Disputes & help</h1></div></div>
      <div className="filters">
        {[["active", "Open"], ["resolved", "Resolved"], ["closed", "Closed"], ["", "All"]].map(([v, l]) => (
          <button key={v} className={`chip ${status === v ? "on" : ""}`} onClick={() => { setStatus(v); setPage(1); }}>{l}</button>
        ))}
      </div>
      {error ? <ErrorBox error={error} retry={reload} /> : !data && loading ? <Loading /> : !data?.results.length ? <Empty>No tickets.</Empty> : (
        <div className="list">
          {data.results.map((t) => (
            <button key={t.id} className={`list-row ${t.category === "safety" && t.status === "open" ? "urgent" : ""}`} onClick={() => { setOpen(t); setResolution(t.resolution); }}>
              <div className="grow">
                <span className="mono">{t.code}</span> <b>{t.subject}</b>
                <div className="muted small">{title(t.category)} · {title(t.role)} {t.raised_by_name} · {t.raised_by_phone}{t.booking_code ? ` · ${t.booking_code}` : ""}</div>
              </div>
              <div className="right"><Badge s={t.status} /><div className="muted small">{ago(t.created_at)}</div></div>
            </button>
          ))}
        </div>
      )}
      <Pager page={data} current={page} onPage={setPage} />
      {open ? (
        <Modal title={`${open.code} · ${open.subject}`} onClose={() => setOpen(null)}>
          <p className="muted small">{title(open.category)} · {title(open.role)} {open.raised_by_name} · {open.raised_by_phone}{open.booking_code ? <> · <a href={`#/bookings/${open.booking_code}`}>{open.booking_code}</a></> : null}</p>
          <p className="desc">{open.description}</p>
          {open.refund_amount ? <p className="small">Already refunded: {money(open.refund_amount)}</p> : null}
          <label className="lbl">Resolution (the user sees this)</label>
          <textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          {open.booking_code ? (<><label className="lbl">Refund to traveler (₹, optional)</label><input inputMode="numeric" value={refund} onChange={(e) => setRefund(e.target.value.replace(/\D/g, ""))} placeholder="0" /></>) : null}
          <div className="row gap-s wrap" style={{ marginTop: 12 }}>
            {open.status === "open" ? <button className="btn" disabled={busy} onClick={() => submit("in_review")}>Mark in review</button> : null}
            <button className="btn primary" disabled={busy || !resolution.trim()} onClick={() => submit("resolved")}>Resolve{refund ? ` + refund ${money(Number(refund))}` : ""}</button>
            <button className="btn ghost" disabled={busy || !resolution.trim()} onClick={() => submit("closed")}>Close</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
