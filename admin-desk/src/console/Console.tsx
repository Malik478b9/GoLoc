import React, { useState } from "react";

import { apiError, get, type User } from "../api/client";
import { BookingDetail, BookingList } from "./Bookings";
import { CaptainDetail, CaptainList } from "./Captains";
import Dashboard from "./Dashboard";
import { ToastHost, toast, useApi, useRoute } from "./lib";
import { Moderation } from "./Moderation";
import { Payouts } from "./Money";
import { Audit, Cities, Users } from "./Platform";
import { SOSDetail, SOSList } from "./Safety";
import { Tickets } from "./Tickets";
import "./console.css";

const NAV: { path: string; label: string; icon: string; mobile?: boolean; badge?: "sos_open" | "captains_pending" | "tickets_open" | "payouts" }[] = [
  { path: "dashboard", label: "Command Center", icon: "⌂", mobile: true },
  { path: "sos", label: "Safety / SOS", icon: "!", mobile: true, badge: "sos_open" },
  { path: "captains", label: "Captains", icon: "◎", mobile: true, badge: "captains_pending" },
  { path: "bookings", label: "Bookings", icon: "▣", mobile: true },
  { path: "payouts", label: "Payouts & refunds", icon: "₹", badge: "payouts" },
  { path: "tickets", label: "Disputes & help", icon: "⚖", badge: "tickets_open" },
  { path: "moderation", label: "Reels & reviews", icon: "☆" },
  { path: "users", label: "Users", icon: "☺" },
  { path: "cities", label: "Cities & emergency", icon: "⌖" },
  { path: "audit", label: "Audit log", icon: "≡" },
];

type Dash = { sos_open: number; captains_pending: number; tickets_open: number; payouts_pending: { n: number } };
type LookupHit = { type: string; id: string; label: string };

export default function Console({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [parts, go] = useRoute();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<LookupHit[] | null>(null);
  const [menu, setMenu] = useState(false);
  const counts = useApi<Dash>("/admin/dashboard/", undefined, 20000);
  const section = parts[0] || "dashboard";
  const id = parts[1];

  const badge = (k?: string) => {
    const d = counts.data;
    if (!d || !k) return 0;
    return k === "payouts" ? d.payouts_pending.n : (d as any)[k] ?? 0;
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    try {
      const res = await get<{ results: LookupHit[] }>("/admin/lookup/", { q: q.trim() });
      if (res.results.length === 1) return open(res.results[0]);
      setHits(res.results);
      if (!res.results.length) toast(`Nothing found for “${q}”. Try CAP-1001, BKG-8001 or a phone number.`, true);
    } catch (err) {
      toast(apiError(err).message, true);
    }
  };
  const open = (h: LookupHit) => {
    setHits(null);
    setQ("");
    const routes: Record<string, string> = { captain: "captains", booking: "bookings", sos: "sos", payout: "payouts", ticket: "tickets", user: "users" };
    go(`/${routes[h.type] ?? "dashboard"}${["captain", "booking", "sos"].includes(h.type) ? `/${h.id}` : ""}`);
  };

  let page: React.ReactNode;
  switch (section) {
    case "captains": page = id ? <CaptainDetail id={id} /> : <CaptainList />; break;
    case "bookings": page = id ? <BookingDetail id={id} /> : <BookingList />; break;
    case "sos": page = id ? <SOSDetail id={id} /> : <SOSList />; break;
    case "payouts": page = <Payouts />; break;
    case "tickets": page = <Tickets />; break;
    case "moderation": page = <Moderation />; break;
    case "users": page = <Users />; break;
    case "cities": page = <Cities />; break;
    case "audit": page = <Audit />; break;
    default: page = <Dashboard />;
  }

  const navItems = (onPick?: () => void) =>
    NAV.map((n) => (
      <a key={n.path} href={`#/${n.path}`} onClick={onPick} className={`nav-item ${section === n.path ? "active" : ""}`}>
        <span className="nav-icon">{n.icon}</span>
        <span>{n.label}</span>
        {badge(n.badge) ? <span className={`nav-badge ${n.badge === "sos_open" ? "alert" : ""}`}>{badge(n.badge)}</span> : null}
      </a>
    ));

  return (
    <div className="console">
      <aside className="sidebar">
        <div className="side-brand"><span className="mark">G</span><div><b>GoLoc</b><small>Command Center</small></div></div>
        <nav>{navItems()}</nav>
        <div className="side-user">
          <div><b>{user.full_name || "Admin"}</b><small>{user.phone_number}</small></div>
          <button className="btn ghost small" onClick={onLogout}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon only-mobile" onClick={() => setMenu(true)} aria-label="Menu">☰</button>
          <form className="lookup" onSubmit={lookup}>
            <span>⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="CAP-1001 · BKG-8001 · PO- · SOS- · TKT- · phone" aria-label="Lookup by ID" />
          </form>
          {badge("sos_open") ? <a className="sos-pill" href="#/sos">🚨 {badge("sos_open")} SOS</a> : null}
        </header>
        {hits && hits.length > 1 ? (
          <div className="hits">
            {hits.map((h) => <button key={h.type + h.id} onClick={() => open(h)}><span className="badge muted">{h.type}</span> {h.label}</button>)}
          </div>
        ) : null}
        <main className="content">{page}</main>
      </div>

      <nav className="tabbar">
        {NAV.filter((n) => n.mobile).map((n) => (
          <a key={n.path} href={`#/${n.path}`} className={section === n.path ? "active" : ""}>
            <span className="tab-icon">{n.icon}{badge(n.badge) ? <i>{badge(n.badge)}</i> : null}</span>
            <span>{n.label.split(" ")[0]}</span>
          </a>
        ))}
        <button onClick={() => setMenu(true)}><span className="tab-icon">⋯</span><span>More</span></button>
      </nav>

      {menu ? (
        <div className="drawer-back" onClick={() => setMenu(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <nav>{navItems(() => setMenu(false))}</nav>
            <button className="btn ghost" onClick={onLogout}>Sign out</button>
          </div>
        </div>
      ) : null}
      <ToastHost />
    </div>
  );
}
