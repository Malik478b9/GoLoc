import React, { createContext, useContext, useState } from "react";

import type { User } from "../api/client";
import { Bookings } from "./Bookings";
import { Captains } from "./Captains";
import { Cars } from "./Cars";
import Home from "./Home";
import { ErrorBox, Loading, ToastHost, useApi, useRoute } from "./lib";
import { Money } from "./Money";
import { Setup } from "./Setup";
import { Trips } from "./Trips";
import type { Agency } from "./types";
import "./console.css";

const NAV: { path: string; label: string; icon: string; mobile?: boolean }[] = [
  { path: "home", label: "Home", icon: "⌂", mobile: true },
  { path: "bookings", label: "Bookings", icon: "▣", mobile: true },
  { path: "captains", label: "Captains", icon: "◎", mobile: true },
  { path: "trips", label: "Trips & prices", icon: "✦" },
  { path: "cars", label: "Cars", icon: "⛟" },
  { path: "money", label: "Money", icon: "₹", mobile: true },
  { path: "business", label: "Business & KYC", icon: "≡" },
];

type Ctx = { agency: Agency | null; reload: () => void };
const AgencyCtx = createContext<Ctx>({ agency: null, reload: () => {} });
export const useAgency = () => useContext(AgencyCtx);

export default function Console({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [parts] = useRoute();
  const [menu, setMenu] = useState(false);
  const profile = useApi<Agency | null>("/agency/profile/");
  const agency = profile.data ?? null;
  const approved = agency?.review_status === "approved" && !agency.is_on_hold;
  // Until GoLoc approves the agency, everything happens on the Business page.
  const section = !approved ? "business" : parts[0] || "home";

  let page: React.ReactNode;
  if (profile.loading && !profile.data) page = <Loading />;
  else if (profile.error) page = <ErrorBox error={profile.error} retry={profile.reload} />;
  else switch (section) {
    case "bookings": page = <Bookings />; break;
    case "captains": page = <Captains />; break;
    case "trips": page = <Trips />; break;
    case "cars": page = <Cars />; break;
    case "money": page = <Money />; break;
    case "business": page = <Setup />; break;
    default: page = <Home />;
  }

  const nav = approved ? NAV : NAV.filter((n) => n.path === "business");
  const navItems = (onPick?: () => void) =>
    nav.map((n) => (
      <a key={n.path} href={`#/${n.path}`} onClick={onPick} className={`nav-item ${section === n.path ? "active" : ""}`}>
        <span className="nav-icon">{n.icon}</span>
        <span>{n.label}</span>
      </a>
    ));

  return (
    <AgencyCtx.Provider value={{ agency, reload: profile.reload }}>
      <div className="console">
        <aside className="sidebar">
          <div className="side-brand"><span className="mark">G</span><div><b>{agency?.name || "GoLoc"}</b><small>{agency ? `${agency.code} · Agency` : "Agency console"}</small></div></div>
          <nav>{navItems()}</nav>
          <div className="side-user">
            <div><b>{user.full_name || "Owner"}</b><small>{user.phone_number}</small></div>
            <button className="btn ghost small" onClick={onLogout}>Sign out</button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="icon only-mobile" onClick={() => setMenu(true)} aria-label="Menu">☰</button>
            <b className="grow">{agency?.name || "Register your agency"}</b>
            {agency?.is_on_hold ? <span className="badge bad">On hold</span> : null}
          </header>
          <main className="content">{page}</main>
        </div>

        {approved ? (
          <nav className="tabbar">
            {NAV.filter((n) => n.mobile).map((n) => (
              <a key={n.path} href={`#/${n.path}`} className={section === n.path ? "active" : ""}>
                <span className="tab-icon">{n.icon}</span>
                <span>{n.label.split(" ")[0]}</span>
              </a>
            ))}
            <button onClick={() => setMenu(true)}><span className="tab-icon">⋯</span><span>More</span></button>
          </nav>
        ) : null}

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
    </AgencyCtx.Provider>
  );
}
