import React, { useState } from "react";

import { patch, post } from "../api/client";
import { Badge, day, Empty, ErrorBox, Loading, Modal, money, toast, useAction, useApi } from "./lib";

type Coupon = {
  id: number; code: string; title: string; description: string; kind: "percent" | "flat" | "free_seat"; value: number;
  max_discount: number | null; min_fare: number; min_guests: number; starts_at: string | null; ends_at: string | null;
  max_uses: number | null; per_user_limit: number; first_trip_only: boolean; auto_apply: boolean; is_public: boolean; is_active: boolean;
  city: string | null; city_name: string | null; captain: string | null; captain_code: string | null; trip_kind: "" | "private" | "group";
  uses: number; paid_uses: number; total_discount: number; created_at: string;
};
type Voucher = {
  id: number; code: string; phone_number: string; holder: string | null; amount: number; balance: number; used: number;
  message: string; expires_at: string; status: "active" | "cancelled"; created_at: string;
};
type City = { id: string; name: string };

const offerText = (c: Pick<Coupon, "kind" | "value" | "max_discount">) =>
  c.kind === "percent" ? `${c.value}% off${c.max_discount ? `, up to ${money(c.max_discount)}` : ""}`
    : c.kind === "flat" ? `${money(c.value)} off`
      : `${c.value} free seat${c.value > 1 ? "s" : ""}`;

/** Coupons (codes and automatic offers) and gift vouchers sent to mobile numbers. GoLoc pays for both. */
export function Offers() {
  const [tab, setTab] = useState<"coupons" | "vouchers">("coupons");
  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Marketing</div><h1>Offers</h1></div>
      </div>
      <p className="muted small" style={{ marginTop: -6, marginBottom: 14 }}>
        Discounts come out of GoLoc's commission. Captains always earn their full share. Coupons only reduce the trip fare; insurance is always charged.
      </p>
      <div className="filters">
        <button className={`chip ${tab === "coupons" ? "on" : ""}`} onClick={() => setTab("coupons")}>Coupons & automatic offers</button>
        <button className={`chip ${tab === "vouchers" ? "on" : ""}`} onClick={() => setTab("vouchers")}>Gift vouchers</button>
      </div>
      {tab === "coupons" ? <Coupons /> : <Vouchers />}
    </div>
  );
}

// ---------------------------------------------------------------- coupons
const EMPTY: Record<string, string | boolean> = {
  code: "", title: "", description: "", kind: "percent", value: "", max_discount: "", min_fare: "", min_guests: "1", ends_at: "",
  max_uses: "", per_user_limit: "1", first_trip_only: false, auto_apply: false, is_public: true, trip_kind: "", city: "",
};

function Coupons() {
  const list = useApi<Coupon[]>("/admin/coupons/");
  const cities = useApi<City[]>("/admin/cities/");
  const { busy, run } = useAction();
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(EMPTY);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  const open = (c: Coupon | "new") => {
    setEditing(c);
    setForm(c === "new" ? EMPTY : {
      code: c.code, title: c.title, description: c.description, kind: c.kind, value: String(c.value),
      max_discount: c.max_discount ? String(c.max_discount) : "", min_fare: c.min_fare ? String(c.min_fare) : "",
      min_guests: String(c.min_guests), ends_at: c.ends_at ? c.ends_at.slice(0, 10) : "", max_uses: c.max_uses ? String(c.max_uses) : "",
      per_user_limit: String(c.per_user_limit), first_trip_only: c.first_trip_only, auto_apply: c.auto_apply, is_public: c.is_public,
      trip_kind: c.trip_kind, city: c.city ?? "",
    });
  };
  const num = (k: string) => (form[k] === "" ? null : Number(form[k]));
  const save = async () => {
    const body = {
      code: form.code, title: form.title, description: form.description, kind: form.kind, value: num("value"),
      max_discount: num("max_discount"), min_fare: num("min_fare") ?? 0, min_guests: num("min_guests") ?? 1,
      ends_at: form.ends_at ? `${form.ends_at}T23:59:59+05:30` : null, max_uses: num("max_uses"), per_user_limit: num("per_user_limit") ?? 1,
      first_trip_only: form.first_trip_only, auto_apply: form.auto_apply, is_public: form.is_public, trip_kind: form.trip_kind, city: form.city || null,
    };
    const ok = editing === "new"
      ? await run(() => post("/admin/coupons/", body), `Coupon ${String(form.code).toUpperCase()} created`)
      : await run(() => patch(`/admin/coupons/${(editing as Coupon).id}/`, body), "Coupon saved");
    if (ok) {
      setEditing(null);
      list.reload();
    }
  };
  const toggle = async (c: Coupon) =>
    (await run(() => patch(`/admin/coupons/${c.id}/`, { is_active: !c.is_active }), c.is_active ? `${c.code} paused` : `${c.code} is live`)) && list.reload();

  if (list.error) return <ErrorBox error={list.error} retry={list.reload} />;
  if (!list.data) return <Loading />;
  return (
    <section className="card">
      <div className="card-head"><h3>Coupons</h3><button className="btn primary" onClick={() => open("new")}>+ New coupon</button></div>
      {!list.data.length ? <Empty>No coupons yet.</Empty> : list.data.map((c) => (
        <div key={c.id} className={`list-row static ${c.is_active ? "" : "dim"}`}>
          <div className="grow">
            <b className="mono">{c.code}</b> · <b>{c.title}</b>
            <div className="muted small">
              {offerText(c)}
              {c.min_fare ? ` · min fare ${money(c.min_fare)}` : ""}
              {c.min_guests > 1 ? ` · ${c.min_guests}+ seats` : ""}
              {c.trip_kind ? ` · ${c.trip_kind} trips` : ""}
              {c.city_name ? ` · ${c.city_name}` : ""}
              {c.first_trip_only ? " · first trip only" : ""}
              {` · ${c.per_user_limit}× per person`}
              {c.max_uses ? ` · ${c.max_uses} total` : ""}
              {c.ends_at ? ` · ends ${day(c.ends_at)}` : ""}
            </div>
            <div className="small" style={{ marginTop: 4 }}>
              <b>{c.paid_uses}</b> paid bookings · <b>{money(c.total_discount)}</b> given{c.uses > c.paid_uses ? ` · ${c.uses - c.paid_uses} waiting for payment` : ""}
            </div>
          </div>
          <div className="right row gap-s">
            {c.auto_apply ? <Badge s="approved" label="Automatic" /> : null}
            {!c.is_public ? <Badge s="draft" label="Secret" /> : null}
            {c.is_active ? <Badge s="approved" label="Live" /> : <Badge s="draft" label="Paused" />}
            <button className="btn small" onClick={() => open(c)}>Edit</button>
            <button className={`btn small ${c.is_active ? "danger" : ""}`} disabled={busy} onClick={() => toggle(c)}>{c.is_active ? "Pause" : "Resume"}</button>
          </div>
        </div>
      ))}

      {editing ? (
        <Modal title={editing === "new" ? "New coupon" : `Edit ${(editing as Coupon).code}`} onClose={() => setEditing(null)}>
          <div className="row gap-s">
            <div className="grow"><label className="lbl">Code</label><input value={String(form.code)} onChange={set("code")} placeholder="DIWALI500" style={{ textTransform: "uppercase" }} /></div>
            <div className="grow"><label className="lbl">Type</label>
              <select value={String(form.kind)} onChange={set("kind")}>
                <option value="percent">Percent off</option><option value="flat">Flat ₹ off</option><option value="free_seat">Free seats (group trips)</option>
              </select>
            </div>
          </div>
          <label className="lbl">Title travelers see</label><input value={String(form.title)} onChange={set("title")} placeholder="₹500 off this Diwali" />
          <label className="lbl">Short description</label><input value={String(form.description)} onChange={set("description")} placeholder="On trips above ₹3,000" />
          <div className="row gap-s">
            <div className="grow"><label className="lbl">{form.kind === "percent" ? "Percent (1–100)" : form.kind === "flat" ? "Rupees off" : "Free seats"}</label><input inputMode="numeric" value={String(form.value)} onChange={set("value")} /></div>
            <div className="grow"><label className="lbl">Max discount ₹ (optional)</label><input inputMode="numeric" value={String(form.max_discount)} onChange={set("max_discount")} placeholder="No cap" /></div>
          </div>
          <div className="row gap-s">
            <div className="grow"><label className="lbl">Min fare ₹</label><input inputMode="numeric" value={String(form.min_fare)} onChange={set("min_fare")} placeholder="0" /></div>
            <div className="grow"><label className="lbl">Min seats / guests</label><input inputMode="numeric" value={String(form.min_guests)} onChange={set("min_guests")} /></div>
          </div>
          <div className="row gap-s">
            <div className="grow"><label className="lbl">Uses per person</label><input inputMode="numeric" value={String(form.per_user_limit)} onChange={set("per_user_limit")} /></div>
            <div className="grow"><label className="lbl">Total uses (optional)</label><input inputMode="numeric" value={String(form.max_uses)} onChange={set("max_uses")} placeholder="Unlimited" /></div>
          </div>
          <div className="row gap-s">
            <div className="grow"><label className="lbl">Ends on (optional)</label><input type="date" value={String(form.ends_at)} onChange={set("ends_at")} /></div>
            <div className="grow"><label className="lbl">Trips</label>
              <select value={String(form.trip_kind)} onChange={set("trip_kind")}><option value="">All trips</option><option value="private">Private only</option><option value="group">Group only</option></select>
            </div>
          </div>
          <label className="lbl">City</label>
          <select value={String(form.city)} onChange={set("city")}><option value="">All cities</option>{cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="row gap-s" style={{ marginTop: 12 }}><input type="checkbox" style={{ width: "auto" }} checked={!!form.first_trip_only} onChange={set("first_trip_only")} /> Only for a traveler's first paid trip</label>
          <label className="row gap-s" style={{ marginTop: 8 }}><input type="checkbox" style={{ width: "auto" }} checked={!!form.auto_apply} onChange={set("auto_apply")} /> Apply automatically (no code needed)</label>
          <label className="row gap-s" style={{ marginTop: 8, marginBottom: 14 }}><input type="checkbox" style={{ width: "auto" }} checked={!!form.is_public} onChange={set("is_public")} /> Show in the offers list (off = secret code you share yourself)</label>
          <button className="btn primary full" disabled={busy || String(form.code).length < 3 || !form.title || !form.value} onClick={save}>Save</button>
        </Modal>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- gift vouchers
function Vouchers() {
  const [q, setQ] = useState("");
  const list = useApi<Voucher[]>("/admin/vouchers/", { q: q || undefined });
  const { busy, run } = useAction();
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ phones: "", amount: "", valid_days: "365", message: "" });
  const count = form.phones.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).length;

  const send = async () => {
    let made: Voucher[] = [];
    const ok = await run(async () => {
      made = await post<Voucher[]>("/admin/vouchers/", { phones: form.phones, amount: Number(form.amount), valid_days: Number(form.valid_days), message: form.message });
    }, `Sent ${count} voucher${count > 1 ? "s" : ""}`);
    if (ok) {
      const unknown = made.filter((v) => !v.holder).length;
      if (unknown) toast(`${unknown} number${unknown > 1 ? "s aren't" : " isn't"} on GoLoc yet. The voucher appears when they sign up.`);
      setSending(false);
      setForm({ phones: "", amount: "", valid_days: "365", message: "" });
      list.reload();
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>Gift vouchers</h3>
        <button className="btn primary" onClick={() => setSending(true)}>+ Send vouchers</button>
      </div>
      <div className="filters"><input className="search" placeholder="Phone or voucher code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.error ? <ErrorBox error={list.error} retry={list.reload} /> : !list.data ? <Loading /> : !list.data.length ? <Empty>No vouchers yet.</Empty> : list.data.map((v) => {
        const expired = new Date(v.expires_at) <= new Date();
        return (
          <div key={v.id} className={`list-row static ${v.status === "cancelled" || expired ? "dim" : ""}`}>
            <div className="grow">
              <b>{money(v.balance)}</b> <span className="muted">of {money(v.amount)}</span> · <span className="mono">{v.phone_number}</span>
              {v.holder ? ` · ${v.holder}` : <span className="muted small"> · not signed up yet</span>}
              <div className="muted small">{v.code} · valid till {day(v.expires_at)}{v.message ? ` · “${v.message}”` : ""} · sent {day(v.created_at)}</div>
            </div>
            <div className="right row gap-s">
              {v.status === "cancelled" ? <Badge s="failed" label="Cancelled" /> : expired ? <Badge s="draft" label="Expired" /> : v.balance === 0 ? <Badge s="draft" label="Used up" /> : <Badge s="approved" label="Active" />}
              {v.status === "active" && !expired && v.balance > 0 ? (
                <button className="btn small danger" disabled={busy}
                  onClick={async () => window.confirm(`Cancel ${v.code}? The remaining ${money(v.balance)} can't be used after this.`)
                    && (await run(() => post(`/admin/vouchers/${v.id}/cancel/`), "Voucher cancelled")) && list.reload()}>Cancel</button>
              ) : null}
            </div>
          </div>
        );
      })}

      {sending ? (
        <Modal title="Send gift vouchers" onClose={() => setSending(false)}>
          <p className="muted small">A free GoLoc balance for people you choose. Only that mobile number can use it, on any trip, until it runs out or expires.</p>
          <label className="lbl">Mobile numbers (one per line, or separated by commas)</label>
          <textarea rows={4} value={form.phones} onChange={(e) => setForm({ ...form, phones: e.target.value })} placeholder={"8096550657\n9876543210"} />
          <div className="row gap-s">
            <div className="grow"><label className="lbl">Amount each (₹)</label><input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, "") })} placeholder="500" /></div>
            <div className="grow"><label className="lbl">Valid for (days)</label><input inputMode="numeric" value={form.valid_days} onChange={(e) => setForm({ ...form, valid_days: e.target.value.replace(/\D/g, "") })} /></div>
          </div>
          <label className="lbl">Message (optional)</label>
          <input value={form.message} maxLength={200} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Happy birthday! Have a great trip." />
          <button className="btn primary full" style={{ marginTop: 14 }} disabled={busy || !count || !Number(form.amount)} onClick={send}>
            {count && Number(form.amount) ? `Send ${count} × ${money(Number(form.amount))} = ${money(count * Number(form.amount))}` : "Send"}
          </button>
        </Modal>
      ) : null}
    </section>
  );
}
