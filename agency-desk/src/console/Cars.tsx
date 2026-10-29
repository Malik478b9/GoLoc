import React, { useState } from "react";

import { patch, post } from "../api/client";
import { Badge, Empty, ErrorBox, Loading, Modal, useAction, useApi } from "./lib";
import type { AgencyCaptain, Options } from "./types";

type Car = { id: string; kind: string; make_model: string; registration_number: string; capacity: number; has_ac: boolean; is_active: boolean; captain_id: string | null; captain_name: string | null };
const blank = { kind: "car", make_model: "", registration_number: "", capacity: 4, has_ac: true, is_active: true, captain_id: "" as string | null };

/** The agency's own cars; each can be given to one of its Captains. */
export function Cars() {
  const cars = useApi<Car[]>("/agency/vehicles/");
  const captains = useApi<AgencyCaptain[]>("/agency/captains/");
  const options = useApi<Options>("/agency/options/");
  const { busy, run } = useAction();
  const [editing, setEditing] = useState<Car | "new" | null>(null);
  const [form, setForm] = useState(blank);

  const open = (c: Car | "new") => {
    setEditing(c);
    setForm(c === "new" ? blank : { kind: c.kind, make_model: c.make_model, registration_number: c.registration_number, capacity: c.capacity,
      has_ac: c.has_ac, is_active: c.is_active, captain_id: c.captain_id ?? "" });
  };
  const save = async () => {
    const body = { ...form, captain_id: form.captain_id || null };
    const ok = await run(() => (editing === "new" ? post("/agency/vehicles/", body) : patch(`/agency/vehicles/${(editing as Car).id}/`, body)), "Saved");
    if (ok) { setEditing(null); cars.reload(); captains.reload(); }
  };

  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Fleet</div><h1>Cars</h1></div>
        <div className="actions"><button className="btn primary" onClick={() => open("new")}>+ Add car</button></div>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>Travelers see the car on the Captain's profile. Captains who drive one of your cars still upload their own driving licence to GoLoc.</p>
      {cars.error ? <ErrorBox error={cars.error} retry={cars.reload} /> : !cars.data ? <Loading /> : !cars.data.length ? <Empty>No cars yet.</Empty> : (
        <div className="list">
          {cars.data.map((c) => (
            <button key={c.id} className={`list-row ${c.is_active ? "" : "dim"}`} onClick={() => open(c)}>
              <div className="grow"><b>{c.make_model}</b> <span className="mono">{c.registration_number}</span>
                <div className="muted small">{c.capacity} seats{c.has_ac ? " · AC" : ""}</div></div>
              <div className="right">{c.captain_name ? <Badge s="approved" label={`Driven by ${c.captain_name}`} /> : <Badge s="muted" label="Not assigned" />}</div>
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <Modal title={editing === "new" ? "Add a car" : `Edit · ${(editing as Car).make_model}`} onClose={() => setEditing(null)}>
          <div className="form-grid">
            <div><label className="lbl">Type</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{(options.data?.vehicle_kinds ?? []).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></div>
            <div><label className="lbl">Make & model</label><input value={form.make_model} onChange={(e) => setForm({ ...form, make_model: e.target.value })} placeholder="Toyota Innova Crysta" /></div>
            <div><label className="lbl">Registration number</label><input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} placeholder="TS09AB4821" /></div>
            <div><label className="lbl">Seats</label><input inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value.replace(/\D/g, "")) || 1 })} /></div>
          </div>
          <label className="lbl">Driven by</label>
          <select value={form.captain_id ?? ""} onChange={(e) => setForm({ ...form, captain_id: e.target.value })}>
            <option value="">Nobody yet</option>
            {(captains.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code}) · {c.city_name}</option>)}
          </select>
          <label className="row gap-s" style={{ marginTop: 12 }}><input type="checkbox" style={{ width: "auto" }} checked={form.has_ac} onChange={(e) => setForm({ ...form, has_ac: e.target.checked })} /> Air-conditioned</label>
          <label className="row gap-s" style={{ marginTop: 8 }}><input type="checkbox" style={{ width: "auto" }} checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> In service</label>
          <button className="btn primary full" disabled={busy || !form.make_model || !form.registration_number} onClick={save}>Save</button>
        </Modal>
      ) : null}
    </div>
  );
}
