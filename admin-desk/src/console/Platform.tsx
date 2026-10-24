import React, { useState } from "react";

import { del, patch, post } from "../api/client";
import { ago, Badge, Empty, ErrorBox, Loading, Modal, Page, Pager, title, toastError, useAction, useApi, when } from "./lib";

type User = { id: string; phone_number: string; full_name: string; email: string; role: string; is_active: boolean; is_staff: boolean; captain_code: string | null; last_login: string | null; created_at: string };
type City = { id: string; name: string; slug: string; state: string; is_live: boolean; latitude: string | null; longitude: string | null; launch_phase: number; sort_order: number };
type Emergency = { id: number; city: string | null; kind: string; name: string; phone: string; address: string; lat: string | null; lng: string | null; sort_order: number };
type Audit = { id: number; actor_name: string; action: string; target_type: string; target_id: string; target_label: string; data: Record<string, unknown>; created_at: string };

export function Users() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Page<User>>("/admin/users/", { q: q || undefined, page });
  const { busy, run } = useAction();
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Marketplace</div><h1>Users</h1></div></div>
      <div className="filters"><input className="search" placeholder="Name or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      {error ? <ErrorBox error={error} retry={reload} /> : !data && loading ? <Loading /> : !data?.results.length ? <Empty>No users.</Empty> : (
        <div className="list">
          {data.results.map((u) => (
            <div key={u.id} className={`list-row static ${u.is_active ? "" : "dim"}`}>
              <div className="grow">
                <b>{u.full_name || "—"}</b> <span className="mono">{u.phone_number}</span>
                <div className="muted small">Last app: {title(u.role)}{u.captain_code ? ` · Captain ${u.captain_code}` : ""}{u.is_staff ? " · Admin" : ""} · joined {ago(u.created_at)} · seen {ago(u.last_login)}</div>
              </div>
              <div className="right">
                {u.is_active ? null : <Badge s="failed" label="Disabled" />}
                <button className={`btn small ${u.is_active ? "danger" : ""}`} disabled={busy}
                  onClick={async () => (await run(() => post(`/admin/users/${u.id}/active/`, { is_active: !u.is_active }), u.is_active ? "Disabled and signed out" : "Enabled")) && reload()}>
                  {u.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={data} current={page} onPage={setPage} />
    </div>
  );
}

export function Cities() {
  const cities = useApi<City[]>("/admin/cities/");
  const emergency = useApi<Emergency[]>("/admin/emergency/");
  const { busy, run } = useAction();
  const [adding, setAdding] = useState<null | "city" | "emergency">(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const ok = adding === "city"
      ? await run(() => post("/admin/cities/", { name: form.name, slug: (form.slug || form.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"), state: form.state, latitude: form.latitude || null, longitude: form.longitude || null, is_live: false }), "City added (not live yet)")
      : await run(() => post("/admin/emergency/", { city: form.city || null, kind: form.kind || "police", name: form.name, phone: form.phone, address: form.address || "", lat: form.lat || null, lng: form.lng || null }), "Emergency contact added");
    if (ok) {
      setAdding(null);
      setForm({});
      cities.reload();
      emergency.reload();
    }
  };
  const cityName = (id: string | null) => (id ? cities.data?.find((c) => c.id === id)?.name ?? "?" : "All India");

  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Platform</div><h1>Cities & emergency numbers</h1></div>
        <div className="actions"><button className="btn" onClick={() => setAdding("city")}>+ City</button><button className="btn primary" onClick={() => setAdding("emergency")}>+ Emergency contact</button></div>
      </div>
      <section className="card">
        <div className="card-head"><h3>Cities</h3><span className="muted small">Only live cities appear in the apps.</span></div>
        {!cities.data ? <Loading /> : cities.data.map((c) => (
          <div key={c.id} className="list-row static">
            <div className="grow"><b>{c.name}</b> <span className="muted small">{c.state} · phase {c.launch_phase}</span></div>
            <div className="right row gap-s">
              {c.is_live ? <Badge s="approved" label="Live" /> : <Badge s="draft" label="Not live" />}
              <button className="btn small" disabled={busy} onClick={async () => (await run(() => patch(`/admin/cities/${c.id}/`, { is_live: !c.is_live }), c.is_live ? `${c.name} hidden` : `${c.name} is live`)) && cities.reload()}>
                {c.is_live ? "Take offline" : "Go live"}
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Emergency directory</h3><span className="muted small">Shown in the SOS screens. Add verified local police stations and hospitals per city.</span></div>
        {emergency.error ? <ErrorBox error={emergency.error} /> : !emergency.data ? <Loading /> : emergency.data.map((e) => (
          <div key={e.id} className="list-row static">
            <div className="grow"><b>{e.name}</b> <span className="mono">{e.phone}</span><div className="muted small">{title(e.kind)} · {cityName(e.city)}{e.address ? ` · ${e.address}` : ""}</div></div>
            <button className="btn small ghost" disabled={busy} onClick={() => del(`/admin/emergency/${e.id}/`).then(emergency.reload).catch(toastError)}>Remove</button>
          </div>
        ))}
      </section>
      {adding ? (
        <Modal title={adding === "city" ? "Add city" : "Add emergency contact"} onClose={() => setAdding(null)}>
          {adding === "city" ? (
            <>
              <label className="lbl">Name</label><input value={form.name ?? ""} onChange={f("name")} />
              <label className="lbl">State</label><input value={form.state ?? ""} onChange={f("state")} />
              <div className="row gap-s"><div className="grow"><label className="lbl">Latitude</label><input value={form.latitude ?? ""} onChange={f("latitude")} /></div><div className="grow"><label className="lbl">Longitude</label><input value={form.longitude ?? ""} onChange={f("longitude")} /></div></div>
            </>
          ) : (
            <>
              <label className="lbl">City</label>
              <select value={form.city ?? ""} onChange={f("city")}><option value="">All India</option>{cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <label className="lbl">Type</label>
              <select value={form.kind ?? "police"} onChange={f("kind")}>{["police", "hospital", "ambulance", "helpline", "emergency"].map((k) => <option key={k} value={k}>{title(k)}</option>)}</select>
              <label className="lbl">Name</label><input value={form.name ?? ""} onChange={f("name")} placeholder="e.g. Charminar Police Station" />
              <label className="lbl">Phone (verified)</label><input value={form.phone ?? ""} onChange={f("phone")} />
              <label className="lbl">Address</label><input value={form.address ?? ""} onChange={f("address")} />
              <div className="row gap-s"><div className="grow"><label className="lbl">Lat</label><input value={form.lat ?? ""} onChange={f("lat")} /></div><div className="grow"><label className="lbl">Lng</label><input value={form.lng ?? ""} onChange={f("lng")} /></div></div>
            </>
          )}
          <button className="btn primary full" disabled={busy || !form.name || (adding === "emergency" && !form.phone)} onClick={save}>Save</button>
        </Modal>
      ) : null}
    </div>
  );
}

export function Audit() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Page<Audit>>("/admin/audit/", { page });
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Platform</div><h1>Audit log</h1></div></div>
      {error ? <ErrorBox error={error} retry={reload} /> : !data && loading ? <Loading /> : !data?.results.length ? <Empty>No admin actions yet.</Empty> : (
        <table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>
            {data.results.map((a) => (
              <tr key={a.id}><td>{when(a.created_at)}</td><td>{a.actor_name}</td><td>{title(a.action)}</td><td className="mono">{a.target_label}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager page={data} current={page} onPage={setPage} />
    </div>
  );
}
