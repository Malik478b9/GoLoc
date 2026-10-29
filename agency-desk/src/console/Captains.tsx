import React, { useState } from "react";

import { del, post } from "../api/client";
import { ago, Badge, day, Empty, ErrorBox, Loading, Modal, money, useAction, useApi } from "./lib";
import type { AgencyCaptain } from "./types";

type Invite = { id: string; phone_number: string; status: string; captain: { code: string; name: string } | null; created_at: string };

export function Captains() {
  const captains = useApi<AgencyCaptain[]>("/agency/captains/");
  const invites = useApi<Invite[]>("/agency/invites/");
  const { busy, run } = useAction();
  const [inviting, setInviting] = useState(false);
  const [phone, setPhone] = useState("");
  const [removing, setRemoving] = useState<AgencyCaptain | null>(null);

  const sendInvite = async () => {
    if (await run(() => post("/agency/invites/", { phone_number: phone }), "Invite sent — they'll see it in the Captain app")) {
      setPhone("");
      setInviting(false);
      invites.reload();
    }
  };
  const remove = async () => {
    if (removing && (await run(() => post(`/agency/captains/${removing.id}/remove/`), `${removing.name} removed`))) {
      setRemoving(null);
      captains.reload();
    }
  };
  const pending = (invites.data ?? []).filter((i) => i.status === "pending");

  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Team</div><h1>Captains</h1></div>
        <div className="actions"><button className="btn primary" onClick={() => setInviting(true)}>+ Invite a Captain</button></div>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Each Captain signs up in the GoLoc Captain app with their own number and gets verified by GoLoc (ID, licence). Once they accept your invite,
        they offer your trips at your prices and their earnings come to your wallet. You pay them yourself.
      </p>

      {captains.error ? <ErrorBox error={captains.error} retry={captains.reload} /> : !captains.data ? <Loading /> : !captains.data.length ? (
        <Empty>No Captains yet. Invite them by phone number.</Empty>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Captain</th><th>City</th><th>Status</th><th>Trips</th><th>Rating</th><th>This month</th><th>Open</th><th>Car</th><th /></tr></thead>
            <tbody>
              {captains.data.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b><div className="mono">{c.code}</div><div className="muted small">{c.phone} · since {day(c.agency_joined_at)}</div></td>
                  <td>{c.city_name}</td>
                  <td>
                    {!c.kyc_ok ? <Badge s="pending" label={c.review_status === "draft" ? "Finishing sign-up" : "GoLoc verifying"} />
                      : c.is_on_hold ? <Badge s="failed" label="On hold" /> : c.is_live ? <Badge s="in_progress" label="Live" /> : <Badge s="draft" label="Offline" />}
                  </td>
                  <td>{c.trips_completed}</td>
                  <td>{Number(c.rating_avg) > 0 ? `★ ${Number(c.rating_avg).toFixed(1)} (${c.rating_count})` : "New"}</td>
                  <td>{money(c.month_earned)}</td>
                  <td>{c.upcoming ? <a href="#/bookings">{c.upcoming}</a> : 0}</td>
                  <td className="small">{c.vehicles.join(", ") || <span className="muted">—</span>}</td>
                  <td><button className="btn small danger" onClick={() => setRemoving(c)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending.length ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h3>Invites waiting</h3></div>
          {pending.map((i) => (
            <div key={i.id} className="list-row static">
              <div className="grow"><b>{i.captain ? `${i.captain.name} (${i.captain.code})` : i.phone_number}</b>
                <div className="muted small">{i.captain ? i.phone_number : "Not on GoLoc yet — ask them to install the Captain app and sign up with this number"} · sent {ago(i.created_at)}</div></div>
              <button className="btn small ghost" disabled={busy} onClick={() => run(() => del(`/agency/invites/${i.id}/`), "Invite cancelled").then(() => invites.reload())}>Cancel</button>
            </div>
          ))}
        </div>
      ) : null}

      {inviting ? (
        <Modal title="Invite a Captain" onClose={() => setInviting(false)}>
          <p className="muted small">Enter the mobile number they use (or will use) in the GoLoc Captain app.</p>
          <label className="lbl">Mobile number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" autoFocus />
          <button className="btn primary full" disabled={busy || phone.replace(/\D/g, "").length < 10} onClick={sendInvite}>Send invite</button>
        </Modal>
      ) : null}

      {removing ? (
        <Modal title={`Remove ${removing.name}?`} onClose={() => setRemoving(null)}>
          <p>They become an independent Captain: your trips and cars are taken off them and they go offline until they list their own services.</p>
          <p className="muted small" style={{ marginTop: 8 }}>Reassign or finish their open bookings first. Earnings already credited stay in your wallet.</p>
          <button className="btn danger full" disabled={busy} onClick={remove}>Remove from agency</button>
        </Modal>
      ) : null}
    </div>
  );
}
