import React, { useEffect, useState } from "react";

import { del, fetchCities, patch, post, upload, type City } from "../api/client";
import { Badge, Empty, ErrorBox, Loading, Modal, money, title, useAction, useApi } from "./lib";
import type { Options, Service } from "./types";

const KINDS = [["experience", "Day experience"], ["guide", "Guide by the day"], ["package", "Full-service package"]] as const;
const blank = {
  kind: "experience" as Service["kind"], title: "", description: "", category: "heritage", city_id: "" as string | null, max_guests: 6,
  price: 0, included_guests: 2, extra_guest_price: 0, duration_hours: 4, start_time: "09:00", stops: "",
  duration_days: 3, normal_price: 0, medium_price: 0, lavish_price: 0, itinerary: "",
};
type Form = typeof blank;

const toForm = (s: Service): Form => ({
  kind: s.kind, title: s.title, description: s.description, category: s.category, city_id: s.city_id ?? "", max_guests: s.max_guests,
  price: s.price, included_guests: s.included_guests, extra_guest_price: s.extra_guest_price, duration_hours: s.duration_hours,
  start_time: s.start_time.slice(0, 5), stops: s.stops.join("\n"), duration_days: s.duration_days, normal_price: s.normal_price,
  medium_price: s.medium_price, lavish_price: s.lavish_price, itinerary: s.itinerary.join("\n"),
});
const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

/** The agency's trip catalog: every Captain of the agency (in that city) offers these at these prices. */
export function Trips() {
  const list = useApi<Service[]>("/agency/services/");
  const options = useApi<Options>("/agency/options/");
  const [cities, setCities] = useState<City[]>([]);
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [cover, setCover] = useState<File | null>(null);
  const { busy, run } = useAction();

  useEffect(() => { fetchCities().then(setCities).catch(() => {}); }, []);
  const open = (s: Service | "new") => { setEditing(s); setForm(s === "new" ? blank : toForm(s)); setCover(null); };
  const num = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value.replace(/\D/g, "")) || 0 });
  const txt = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const body = { ...form, city_id: form.city_id || null, stops: lines(form.stops), itinerary: lines(form.itinerary) };
    let saved: Service | null = null;
    const ok = await run(async () => {
      saved = editing === "new" ? await post<Service>("/agency/services/", body) : await patch<Service>(`/agency/services/${(editing as Service).id}/`, body);
      if (cover && saved) {
        const fd = new FormData();
        fd.append("image", cover);
        await upload(`/agency/services/${saved.id}/cover/`, fd);
      }
    }, "Saved — every Captain's listing is updated");
    if (ok) { setEditing(null); list.reload(); }
  };
  const remove = async (s: Service) => {
    if (await run(() => del(`/agency/services/${s.id}/`), "Trip switched off for all Captains")) list.reload();
  };

  const pkg = form.kind === "package";
  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Catalog</div><h1>Trips &amp; prices</h1></div>
        <div className="actions"><button className="btn primary" onClick={() => open("new")}>+ New trip</button></div>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>Your Captains can't change these. Edit a trip here and every Captain's listing updates at once. GoLoc's commission is taken from each booking, same as for independent Captains.</p>
      {list.error ? <ErrorBox error={list.error} retry={list.reload} /> : !list.data ? <Loading /> : !list.data.length ? <Empty>No trips yet.</Empty> : (
        <div className="list">
          {list.data.map((s) => (
            <div key={s.id} className={`list-row static ${s.is_active ? "" : "dim"}`}>
              {s.cover_image ? <img className="cover" src={s.cover_image} alt="" /> : <div className="cover" />}
              <div className="grow">
                <b>{s.title}</b> <Badge s="info" label={KINDS.find(([k]) => k === s.kind)?.[1]} />
                <div className="muted small">{title(s.category)} · {s.city_name ?? "All cities"} · up to {s.max_guests} guests · offered by {s.captains_offering} Captain{s.captains_offering === 1 ? "" : "s"}</div>
              </div>
              <div className="right">
                <b>{s.kind === "package" ? `${money(s.normal_price)}–${money(s.lavish_price)} pp` : `${money(s.price)}${s.kind === "guide" ? "/day" : ""}`}</b>
                <div className="row gap-s">
                  <button className="btn small" onClick={() => open(s)}>Edit</button>
                  {s.is_active ? <button className="btn small ghost" disabled={busy} onClick={() => remove(s)}>Switch off</button> : <Badge s="muted" label="Off" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <Modal title={editing === "new" ? "New trip" : `Edit · ${(editing as Service).title}`} onClose={() => setEditing(null)}>
          <label className="lbl">Type</label>
          <div className="filters">
            {KINDS.map(([k, l]) => <button key={k} className={`chip ${form.kind === k ? "on" : ""}`} disabled={editing !== "new"} onClick={() => setForm({ ...form, kind: k })}>{l}</button>)}
          </div>
          <label className="lbl">Title</label><input value={form.title} onChange={txt("title")} placeholder="Old City Food Trail" />
          <label className="lbl">Description</label><textarea rows={3} value={form.description} onChange={txt("description")} />
          <div className="form-grid">
            <div><label className="lbl">Category</label>
              <select value={form.category} onChange={txt("category")}>{(options.data?.categories ?? []).map((c) => <option key={c} value={c}>{title(c)}</option>)}</select></div>
            <div><label className="lbl">Which Captains offer it</label>
              <select value={form.city_id ?? ""} onChange={txt("city_id")}><option value="">All my Captains</option>{cities.map((c) => <option key={c.id} value={c.id}>Only in {c.name}</option>)}</select></div>
            <div><label className="lbl">Max guests</label><input inputMode="numeric" value={form.max_guests} onChange={num("max_guests")} /></div>
            {pkg ? <div><label className="lbl">Days</label><input inputMode="numeric" value={form.duration_days} onChange={num("duration_days")} /></div>
              : <div><label className="lbl">Hours {form.kind === "guide" ? "a day" : ""}</label><input inputMode="numeric" value={form.duration_hours} onChange={num("duration_hours")} /></div>}
          </div>
          {pkg ? (
            <div className="form-grid">
              <div><label className="lbl">Normal ₹ per person</label><input inputMode="numeric" value={form.normal_price} onChange={num("normal_price")} /></div>
              <div><label className="lbl">Medium ₹ per person</label><input inputMode="numeric" value={form.medium_price} onChange={num("medium_price")} /></div>
              <div><label className="lbl">Lavish ₹ per person</label><input inputMode="numeric" value={form.lavish_price} onChange={num("lavish_price")} /></div>
            </div>
          ) : (
            <div className="form-grid">
              <div><label className="lbl">Price ₹ for the group{form.kind === "guide" ? " per day" : ""}</label><input inputMode="numeric" value={form.price} onChange={num("price")} /></div>
              <div><label className="lbl">Guests included</label><input inputMode="numeric" value={form.included_guests} onChange={num("included_guests")} /></div>
              <div><label className="lbl">₹ per extra guest{form.kind === "guide" ? " per day" : ""}</label><input inputMode="numeric" value={form.extra_guest_price} onChange={num("extra_guest_price")} /></div>
              <div><label className="lbl">Start time</label><input type="time" value={form.start_time} onChange={txt("start_time")} /></div>
            </div>
          )}
          <label className="lbl">{pkg ? "Itinerary — one line per day" : "Stops — one per line"}</label>
          {pkg ? <textarea rows={4} value={form.itinerary} onChange={txt("itinerary")} /> : <textarea rows={3} value={form.stops} onChange={txt("stops")} />}
          <label className="lbl">Cover photo</label><input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
          <button className="btn primary full" disabled={busy || !form.title.trim()} onClick={save}>{editing === "new" ? "Add trip" : "Save for all Captains"}</button>
        </Modal>
      ) : null}
    </div>
  );
}
