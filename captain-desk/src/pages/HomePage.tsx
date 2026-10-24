import React from "react";

import type { User } from "../api/client";
import { AccountMenu, CityPicker } from "../components/NavControls";
import "../captain-home.css";

interface Props {
  user: User;
  onUserChange: (user: User) => void;
  onLogout: () => void | Promise<void>;
}

const soon = (label: string) => alert(`${label} — coming soon, not built yet.`);

const Icon = {
  setup: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19V6a2 2 0 012-2h9l5 5v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" /><path d="M14 4v5h5" />
    </svg>
  ),
  operate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  grow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" />
    </svg>
  ),
  support: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" /><path d="M12 16v.01M12 8a2.5 2.5 0 012.5 2.5c0 1.5-2.5 2-2.5 3.5" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s-7-5.2-9.4-9.6C1 8 2.6 4.6 6 4a5 5 0 016 2 5 5 0 016-2c3.4.6 5 4 3.4 7.4C19 15.8 12 21 12 21z" /><circle cx="12" cy="10" r="2" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  ),
  trips: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19V9l8-6 8 6v10" /><path d="M9 21v-6h6v6" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.6-4.1 6.1-.6z" />
    </svg>
  ),
  requests: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 19V6a2 2 0 012-2h9l5 5v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" /><path d="M14 4v5h5" />
    </svg>
  ),
  arrowRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  idCard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2" /><path d="M14 10h4M14 14h4" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>
  ),
  price: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  car: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 13l2-6h14l2 6v6H3z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="16.5" cy="19" r="1.5" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12h4l2 3h4l2-3h4" /><path d="M4 12l2-7h12l2 7v6a1 1 0 01-1 1H5a1 1 0 01-1-1z" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3v18h18" /><path d="M7 15l4-6 3 3 5-7" />
    </svg>
  ),
  megaphone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11v2a2 2 0 002 2h1l3 5V4L6 9H5a2 2 0 00-2 2z" /><path d="M14 8a4 4 0 010 8" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z" />
    </svg>
  ),
};

const BUSINESS_SETUP = [
  { label: "Go-live", hint: "Requires verification first", icon: Icon.bolt },
  { label: "Verification", hint: "Upload ID and documents", icon: Icon.idCard },
  { label: "Business profile", hint: "Posts, reels, bio", icon: Icon.profile },
  { label: "Services & pricing", hint: "Normal / Medium / Lavish tiers", icon: Icon.price },
  { label: "Vehicles", hint: "Add your vehicle details", icon: Icon.car },
];

const OPERATE = [
  { label: "Availability", hint: "Open dates for booking", icon: Icon.calendar },
  { label: "Requests", hint: "New booking requests", icon: Icon.inbox },
  { label: "Active Trip", hint: "Available during a live trip", icon: Icon.pin },
  { label: "Messages", hint: "Chat with your Travelers", icon: Icon.chat },
];

const GROW = [
  { label: "Earnings", hint: "Payout ledger", icon: Icon.wallet },
  { label: "Reviews", hint: "What Travelers have said", icon: Icon.star },
  { label: "Analytics", hint: "Reel and profile performance", icon: Icon.chart },
  { label: "Sponsored boost", hint: "Get featured placement", icon: Icon.megaphone },
];

const SUPPORT = [
  { label: "Safety & SOS", hint: "Available during a live trip", icon: Icon.shield },
  { label: "Help & Disputes", hint: "Talk to GoLoc support", icon: Icon.support },
];

const REVIEWS = [
  { initial: "R", name: "Riya Sharma", stars: "★★★★★", quote: "Arjun knew every hidden corner of the fort — best day of the trip." },
  { initial: "K", name: "Kabir Mehta", stars: "★★★★★", quote: "Punctual, safe driving, and the food stops were perfect." },
  { initial: "S", name: "Sara Iyer", stars: "★★★★☆", quote: "Great local knowledge, would book again for the desert camp." },
];

function ModuleSection({
  title, items, onSeeAll,
}: { title: string; items: { label: string; hint: string; icon: React.ReactNode }[]; onSeeAll?: () => void }) {
  return (
    <section className="ch-section">
      <div className="ch-section-head">
        <h2>{title}</h2>
        {onSeeAll && <button onClick={onSeeAll}>See all</button>}
      </div>
      <div className="ch-module-grid">
        {items.map((item) => (
          <button key={item.label} className="ch-module-card" onClick={() => soon(item.label)}>
            <div className="ch-module-icon">{item.icon}</div>
            <div className="ch-module-label">{item.label}</div>
            <div className="ch-module-hint">{item.hint}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function HomePage({ user, onUserChange, onLogout }: Props) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (user.full_name || "there").split(" ")[0];

  // Mocked — no Captain profile model yet, wired up in a later step.
  const verified = false;
  const setupProgress = 60;

  return (
    <div className="ch-root" style={{ ["--gl-accent" as string]: "#E2711D", ["--gl-accent-deep" as string]: "#C2410C", ["--gl-avatar-bg" as string]: "linear-gradient(160deg, #E2711D, #C2410C)" }}>
      <nav className="ch-topnav">
        <div className="ch-wrap">
          <div className="ch-brand">
            <svg viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="15" stroke="#C2410C" strokeWidth="1.6" />
              <path d="M16 6c-4 4-6 7-6 11a6 6 0 0012 0c0-4-2-7-6-11z" fill="#C2410C" />
            </svg>
            GoLoc
          </div>
          <div className="ch-nav-links">
            <button className="active" onClick={() => soon("Business setup")}>{Icon.setup}Business setup</button>
            <button onClick={() => soon("Operate")}>{Icon.operate}Operate<span className="ch-tdot" /></button>
            <button onClick={() => soon("Grow")}>{Icon.grow}Grow</button>
            <button onClick={() => soon("Support")}>{Icon.support}Support</button>
          </div>
          <div className="ch-nav-right">
            <CityPicker user={user} onUserChange={onUserChange} />
            <div className="ch-icon-btn" onClick={() => soon("Notifications")} style={{ cursor: "pointer" }}>
              {Icon.bell}
              <span className="ch-dot" />
            </div>
            <AccountMenu user={user} onLogout={onLogout} />
          </div>
        </div>
      </nav>

      <header className="ch-hero">
        <div className="ch-wrap ch-hero-inner">
          <h1>{greeting}, {firstName}</h1>
          <p>Here's how your business is doing today.</p>

          <div className="ch-status-card">
            <div className="ch-status-top">
              <span className={`ch-verify-badge ${verified ? "verified" : "pending"}`}>
                {verified ? "✓ Verified" : "Verification pending"}
              </span>
              <button className={`ch-golive-btn ${!verified ? "disabled" : ""}`} onClick={() => verified ? soon("Go live") : soon("Complete verification first")}>
                {verified ? "Go live" : "Complete verification to go live"}
              </button>
            </div>

            <div className="ch-stat-row">
              <div className="ch-stat-field">
                <div className="ch-fi">{Icon.trips}</div>
                <div>
                  <div className="ch-stat-label">Trips</div>
                  <div className="ch-stat-value">0</div>
                </div>
              </div>
              <div className="ch-stat-field">
                <div className="ch-fi">{Icon.star}</div>
                <div>
                  <div className="ch-stat-label">Rating</div>
                  <div className="ch-stat-value">—</div>
                </div>
              </div>
              <div className="ch-stat-field">
                <div className="ch-fi">{Icon.requests}</div>
                <div>
                  <div className="ch-stat-label">New requests</div>
                  <div className="ch-stat-value">0</div>
                </div>
              </div>
              <div className="ch-stat-field">
                <div className="ch-fi">{Icon.wallet}</div>
                <div>
                  <div className="ch-stat-label">Available payout</div>
                  <div className="ch-stat-value">₹0</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="ch-wrap ch-main">
        <div className="ch-top-cards">
          <div className="ch-draft-card" onClick={() => soon("Business profile setup")}>
            <div className="ch-di">{Icon.file}</div>
            <div className="ch-draft-body">
              <strong>Business setup — {setupProgress}% complete</strong>
              <span>Profile and pricing done · verification and vehicle remaining</span>
              <div className="ch-progress"><i style={{ width: `${setupProgress}%` }} /></div>
            </div>
            <div className="ch-go">{Icon.arrowRight}</div>
          </div>

          <div className="ch-trip-card">
            <div className="ch-trip-top">
              <div className="ch-trip-badge">{Icon.check} Confirmed</div>
              <div className="ch-trip-time">Sat · 10:00 AM</div>
            </div>
            <div className="ch-trip-body">
              <div className="ch-trip-thumb" />
              <div className="ch-trip-info">
                <strong>Old City Food Walk</strong>
                <span>Traveler Riya · Medium tier · 2 pax</span>
              </div>
            </div>
            <div className="ch-trip-actions">
              <button className="ch-start" onClick={() => soon("Start trip")}>Start trip</button>
              <button className="ch-msg" onClick={() => soon("Messages")}>Message</button>
            </div>
          </div>
        </div>

        <div className="ch-chip-row">
          <div className="ch-chip active" onClick={() => soon("All requests")}>All</div>
          <div className="ch-chip" onClick={() => soon("New requests")}>New</div>
          <div className="ch-chip" onClick={() => soon("Accepted requests")}>Accepted</div>
          <div className="ch-chip" onClick={() => soon("Completed requests")}>Completed</div>
        </div>

        <ModuleSection title="Business setup" items={BUSINESS_SETUP} />
        <ModuleSection title="Operate" items={OPERATE} />
        <ModuleSection title="Grow" items={GROW} />
        <ModuleSection title="Support" items={SUPPORT} />

        <section className="ch-section">
          <div className="ch-section-head">
            <h2>What travelers are saying</h2>
            <button onClick={() => soon("See all reviews")}>See all reviews</button>
          </div>
          <div className="ch-review-grid">
            {REVIEWS.map((r) => (
              <div key={r.name} className="ch-review-card">
                <div className="ch-review-top">
                  <div className="ch-review-avatar">{r.initial}</div>
                  <div>
                    <div className="ch-review-name">{r.name}</div>
                    <div className="ch-review-stars">{r.stars}</div>
                  </div>
                </div>
                <div className="ch-review-quote">"{r.quote}"</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="ch-footer">
        <div className="ch-wrap">
          <span>© 2026 GoLoc. Local Travel Marketplace.</span>
          <span>Business setup · Operate · Grow · Support</span>
        </div>
      </footer>
    </div>
  );
}
