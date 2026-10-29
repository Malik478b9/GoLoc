import React, { useEffect, useState } from "react";

import { fetchCities, post, put, upload, type City } from "../api/client";
import { useAgency } from "./Console";
import { Badge, day, useAction, useApi } from "./lib";
import type { Options } from "./types";

type Doc = { id: string; doc_type: string; doc_type_label: string; number: string; status: string; note: string; created_at: string };
type Payout = { method: "upi" | "bank"; account_holder: string; upi_id: string; ifsc: string; masked: string } | null;

/** Register the business, upload KYC, add the payout account, send for review. */
export function Setup() {
  const { agency, reload } = useAgency();
  const { busy, run } = useAction();
  const [cities, setCities] = useState<City[]>([]);
  const options = useApi<Options>("/agency/options/");
  const docs = useApi<Doc[]>(agency ? "/agency/documents/" : null);
  const payout = useApi<Payout>(agency ? "/agency/payout-account/" : null);
  const [form, setForm] = useState({ name: "", legal_name: "", city_id: "", address: "", gstin: "", pan: "", contact_email: "" });
  const [pay, setPay] = useState({ method: "upi", account_holder: "", upi_id: "", account_number: "", ifsc: "" });
  const [docType, setDocType] = useState("registration");
  const [docNumber, setDocNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => { fetchCities().then(setCities).catch(() => {}); }, []);
  useEffect(() => {
    if (agency) setForm({ name: agency.name, legal_name: agency.legal_name, city_id: agency.city_id, address: agency.address, gstin: agency.gstin, pan: agency.pan, contact_email: agency.contact_email });
  }, [agency]);

  const locked = agency?.review_status === "pending" || agency?.review_status === "approved";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const saveProfile = () => run(() => put("/agency/profile/", form), agency ? "Saved" : "Agency registered — now add your documents").then((ok) => ok && reload());
  const saveDoc = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("doc_type", docType);
    fd.append("number", docNumber);
    fd.append("file", file);
    if (await run(() => upload("/agency/documents/", fd), "Uploaded")) {
      setFile(null);
      setDocNumber("");
      docs.reload();
      reload();
    }
  };
  const savePayout = () => run(() => put("/agency/payout-account/", pay), "Payout account saved").then((ok) => ok && (payout.reload(), reload()));
  const submit = () => run(() => post("/agency/submit/"), "Sent to GoLoc for review").then((ok) => ok && reload());

  const status = agency?.review_status;
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Business & KYC</div><h1>{agency ? agency.name : "Register your agency"}</h1></div>
        {agency ? <Badge s={status === "rejected" ? "rejected" : status!} label={status === "rejected" ? "Needs changes" : undefined} /> : null}
      </div>

      {!agency ? <div className="notice info">Your Captains each sign up in the GoLoc Captain app and get verified by us. You set their trips and prices, give them cars, and receive their earnings here. GoLoc's commission is the same as for independent Captains.</div> : null}
      {status === "pending" ? <div className="notice info">GoLoc is reviewing your agency. We'll notify you; this usually takes a working day.</div> : null}
      {status === "rejected" ? <div className="notice bad">GoLoc asked for changes: {agency!.review_note}</div> : null}
      {agency?.is_on_hold ? <div className="notice bad">Your agency is on hold: {agency.hold_reason}. Your Captains can't be booked until GoLoc releases it.</div> : null}
      {status === "approved" && !agency?.is_on_hold ? <div className="notice good">Approved. Add trips and invite your Captains from the menu.</div> : null}

      {agency ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h3>Checklist</h3><span className="muted small">{agency.checklist.percent}%</span></div>
          <div className="pad"><div className="progress"><i style={{ width: `${agency.checklist.percent}%` }} /></div></div>
          {agency.checklist.items.map((i) => <div key={i.key} className={`check ${i.done ? "done" : ""}`}><i>{i.done ? "✓" : ""}</i>{i.label}</div>)}
          {agency.checklist.can_submit ? <div className="pad"><button className="btn primary full" disabled={busy} onClick={submit}>Send to GoLoc for review</button></div> : null}
        </div>
      ) : null}

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Business details</h3></div>
          <div className="pad">
            <div className="form-grid">
              <div><label className="lbl">Agency name (travelers see this)</label><input value={form.name} onChange={set("name")} placeholder="Ravi Travels" /></div>
              <div><label className="lbl">Legal name</label><input value={form.legal_name} onChange={set("legal_name")} disabled={locked} placeholder="Ravi Travels Pvt Ltd" /></div>
              <div><label className="lbl">Head office city</label>
                <select value={form.city_id} onChange={set("city_id")}><option value="">Choose…</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </div>
              <div><label className="lbl">Contact email</label><input type="email" value={form.contact_email} onChange={set("contact_email")} /></div>
              <div><label className="lbl">Business PAN</label><input value={form.pan} onChange={set("pan")} disabled={locked} placeholder="ABCDE1234F" maxLength={10} /></div>
              <div><label className="lbl">GSTIN (optional)</label><input value={form.gstin} onChange={set("gstin")} disabled={locked} placeholder="36ABCDE1234F1Z5" maxLength={15} /></div>
            </div>
            <label className="lbl">Office address</label><input value={form.address} onChange={set("address")} />
            {locked ? <p className="muted small" style={{ marginTop: 8 }}>Legal name, PAN and GSTIN are locked after submission. Contact GoLoc support to change them.</p> : null}
            <button className="btn primary full" disabled={busy || !form.name || !form.city_id} onClick={saveProfile}>{agency ? "Save" : "Register agency"}</button>
          </div>
        </div>

        {agency ? (
          <div className="card">
            <div className="card-head"><h3>Documents</h3></div>
            {(docs.data ?? []).map((d) => (
              <div key={d.id} className="list-row static">
                <div className="grow"><b>{d.doc_type_label}</b><div className="muted small">{d.number || "—"} · {day(d.created_at)}{d.note ? ` · ${d.note}` : ""}</div></div>
                <Badge s={d.status} />
              </div>
            ))}
            <div className="pad">
              <label className="lbl">Add a document</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                {(options.data?.document_types ?? []).map((d) => <option key={d.value} value={d.value}>{d.label}{d.required ? " (required)" : ""}</option>)}
              </select>
              <label className="lbl">Number (optional)</label><input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
              <label className="lbl">File (PDF or photo)</label><input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button className="btn full" disabled={busy || !file} onClick={saveDoc}>Upload</button>
            </div>
          </div>
        ) : null}

        {agency ? (
          <div className="card">
            <div className="card-head"><h3>Payout account</h3>{payout.data ? <span className="muted small">{payout.data.masked}</span> : null}</div>
            <div className="pad">
              <p className="muted small">Your Captains' trip earnings (after GoLoc's commission) are paid here. You pay your Captains yourself.</p>
              <div className="filters" style={{ marginTop: 10 }}>
                {(["upi", "bank"] as const).map((m) => <button key={m} className={`chip ${pay.method === m ? "on" : ""}`} onClick={() => setPay({ ...pay, method: m })}>{m === "upi" ? "UPI" : "Bank transfer"}</button>)}
              </div>
              <label className="lbl">Account holder</label><input value={pay.account_holder} onChange={(e) => setPay({ ...pay, account_holder: e.target.value })} />
              {pay.method === "upi" ? (
                <><label className="lbl">UPI ID</label><input value={pay.upi_id} onChange={(e) => setPay({ ...pay, upi_id: e.target.value })} placeholder="agency@okbank" /></>
              ) : (
                <div className="form-grid">
                  <div><label className="lbl">Account number</label><input value={pay.account_number} onChange={(e) => setPay({ ...pay, account_number: e.target.value })} /></div>
                  <div><label className="lbl">IFSC</label><input value={pay.ifsc} onChange={(e) => setPay({ ...pay, ifsc: e.target.value })} maxLength={11} /></div>
                </div>
              )}
              <button className="btn full" disabled={busy || !pay.account_holder} onClick={savePayout}>Save payout account</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
