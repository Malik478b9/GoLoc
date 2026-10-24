import React, { useEffect, useState } from "react";

import { apiError, createBooking, discoverCaptains, fetchBookings, type Booking, type PublicCaptain, type ServiceOffer, type User } from "../api/client";
import { AccountMenu, CityPicker } from "../components/NavControls";
import "../traveler-home.css";

interface Props {
  user: User;
  onUserChange: (user: User) => void;
  onLogout: () => void | Promise<void>;
}

const soon = (label: string) => alert(`${label} — coming soon, not built yet.`);

// Icons kept as small inline components (not a library) to match the
// reference design's hand-picked stroke icons exactly, at zero extra
// dependency cost for this step.
const Icon = {
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s-7-5.2-9.4-9.6C1 8 2.6 4.6 6 4a5 5 0 016 2 5 5 0 016-2c3.4.6 5 4 3.4 7.4C19 15.8 12 21 12 21z" />
    </svg>
  ),
  person: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
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
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  ),
  travelers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c1-3.4 3.6-5 6.5-5s5.5 1.6 6.5 5" /><circle cx="17.5" cy="9" r="2.4" /><path d="M15.8 14.2c2 .3 3.6 1.6 4.4 3.9" />
    </svg>
  ),
  tier: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19V9l8-6 8 6v10" /><path d="M9 21v-6h6v6" />
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
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.6-4.1 6.1-.6z" />
    </svg>
  ),
  food: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 3v7M12 3v7M16 3v7M8 10c0 3-1 4-1 8h2M16 10c0 3 1 4 1 8h-2M11 21h2" />
    </svg>
  ),
  heritage: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19l6-11 4 7 3-5 3 9H4z" />
    </svg>
  ),
  trek: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20l6-14 2 4 2-3 6 13H4z" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  night: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19l16-6-16-6v5l10 1-10 1z" />
    </svg>
  ),
};

const REELS = [
  { title: "Sunrise at Amber Fort", captain: "Captain Arjun", cls: "" },
  { title: "Old City food crawl", captain: "Captain Meera", cls: "g2" },
  { title: "Nahargarh sunset", captain: "Captain Dev", cls: "g3" },
  { title: "Bazaar & block print", captain: "Captain Priya", cls: "g4" },
  { title: "Desert camp night", captain: "Captain Farhan", cls: "g5" },
  { title: "Hawa Mahal walk", captain: "Captain Kiran", cls: "g6" },
];

const CAPTAINS = [
  { initial: "A", name: "Arjun Rao", role: "Heritage & forts", rating: "4.9", reviews: "212", price: "1,800" },
  { initial: "M", name: "Meera Joshi", role: "Food & markets", rating: "4.8", reviews: "164", price: "1,400" },
  { initial: "D", name: "Dev Singh", role: "Trekking & nature", rating: "5.0", reviews: "97", price: "2,100" },
  { initial: "P", name: "Priya Nair", role: "Shopping & crafts", rating: "4.7", reviews: "138", price: "1,300" },
];

export default function HomePage({ user, onUserChange, onLogout }: Props) {
  const [captains, setCaptains] = useState<PublicCaptain[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [pageError, setPageError] = useState("");
  const [selected, setSelected] = useState<{ captain: PublicCaptain; service: ServiceOffer } | null>(null);
  const [tripDate, setTripDate] = useState("");
  const [travelerCount, setTravelerCount] = useState(2);
  const [tier, setTier] = useState<Booking["tier"]>("medium");
  const [saving, setSaving] = useState(false);
  const load = async () => {
    setPageError("");
    try {
      const [found, trips] = await Promise.all([
        discoverCaptains({ city: user.city?.slug, category: category || undefined, q: query || undefined }),
        fetchBookings(),
      ]);
      setCaptains(found); setBookings(trips);
    } catch (err) { setPageError(apiError(err).message); }
  };
  useEffect(() => { void load(); }, [user.city?.slug, category]);
  const book = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected) return;
    setSaving(true); setPageError("");
    try {
      await createBooking({ service_id: selected.service.id, trip_date: tripDate, travelers_count: travelerCount, tier, note: "" });
      setSelected(null); await load();
    } catch (err) { setPageError(apiError(err).message); }
    finally { setSaving(false); }
  };
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (user.full_name || "there").split(" ")[0];

  return (
    <div className="th-root" style={{ ["--gl-accent" as string]: "#E8A33D", ["--gl-accent-deep" as string]: "#C97F1E", ["--gl-avatar-bg" as string]: "linear-gradient(160deg, #2F7A6B, #153A38)" }}>
      {/* ---- top nav ---- */}
      <nav className="th-topnav">
        <div className="th-wrap">
          <div className="th-brand">
            <svg viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="15" stroke="#E8A33D" strokeWidth="1.6" />
              <path d="M16 6c-4 4-6 7-6 11a6 6 0 0012 0c0-4-2-7-6-11z" fill="#E8A33D" />
            </svg>
            GoLoc
          </div>
          <div className="th-nav-links">
            <button className="active" onClick={() => soon("Explore")}>{Icon.clock}Explore</button>
            <button onClick={() => soon("Plan")}>{Icon.plan}Plan</button>
            <button onClick={() => soon("Travel")}>{Icon.heart}Travel<span className="th-tdot" /></button>
            <button onClick={() => soon("Account")}>{Icon.person}Account</button>
          </div>
          <div className="th-nav-right">
            <CityPicker user={user} onUserChange={onUserChange} />
            <div className="th-icon-btn" onClick={() => soon("Notifications")} style={{ cursor: "pointer" }}>
              {Icon.bell}
              <span className="th-dot" />
            </div>
            <AccountMenu user={user} onLogout={onLogout} />
          </div>
        </div>
      </nav>

      {/* ---- hero + search ---- */}
      <header className="th-hero">
        <div className="th-wrap th-hero-inner">
          <h1>{greeting}, {firstName}</h1>
          <p>{user.city ? `Where in ${user.city.name} do you want to go today?` : "Pick your city above to see local Captains and experiences."}</p>

          <div className="th-search-card">
            <div className="th-seg">
              <button className="active" onClick={() => soon("Experiences")}>Experiences</button>
              <button onClick={() => soon("Packages")}>Packages</button>
              <button onClick={() => soon("Find a Captain")}>Find a Captain</button>
            </div>

            <div className="th-search-row">
              <div className="th-field" onClick={() => soon("Destination search")}>
                <div className="th-fi">{Icon.search}</div>
                <div className="th-field-text">
                  <div className="th-field-label">Going to</div>
                  <div className="th-field-value">{user.city ? `Anywhere in ${user.city.name}` : "Choose a city first"}</div>
                </div>
              </div>
              <div className="th-field" onClick={() => soon("Date picker")}>
                <div className="th-fi">{Icon.calendar}</div>
                <div className="th-field-text">
                  <div className="th-field-label">When</div>
                  <div className="th-field-value">Sat, 6 Sep</div>
                </div>
              </div>
              <div className="th-field" onClick={() => soon("Traveler count")}>
                <div className="th-fi">{Icon.travelers}</div>
                <div className="th-field-text">
                  <div className="th-field-label">Travelers</div>
                  <div className="th-field-value">2 adults</div>
                </div>
              </div>
              <div className="th-field" onClick={() => soon("Tier picker")}>
                <div className="th-fi">{Icon.tier}</div>
                <div className="th-field-text">
                  <div className="th-field-label">Tier</div>
                  <div className="th-field-value">Medium</div>
                </div>
              </div>
              <button className="th-search-btn" onClick={() => void load()}>
                {Icon.search} Search
              </button>
            </div>

            <div className="th-tier-row">
              <span className="th-label">Quick pick</span>
              <div className="th-tier-chip" onClick={() => soon("Normal tier")}>Normal</div>
              <div className="th-tier-chip active" onClick={() => soon("Medium tier")}>Medium</div>
              <div className="th-tier-chip" onClick={() => soon("Lavish tier")}>Lavish</div>
            </div>
          </div>
        </div>
      </header>

      {/* ---- main ---- */}
      <main className="th-wrap th-main">
        <div className="th-top-cards">
          <div className="th-draft-card" onClick={() => soon("Build My Trip")}>
            <div className="th-di">{Icon.file}</div>
            <div className="th-draft-body">
              <strong>Build My Trip — draft</strong>
              <span>3 stops added · Amber Fort, food walk, sunset point</span>
              <div className="th-progress"><i /></div>
            </div>
            <div className="th-go">{Icon.arrowRight}</div>
          </div>

          <div className="th-trip-card">
            <div className="th-trip-top">
              <div className="th-trip-badge">{Icon.check} Confirmed</div>
              <div className="th-trip-time">Sat · 10:00 AM</div>
            </div>
            <div className="th-trip-body">
              <div className="th-trip-thumb" />
              <div className="th-trip-info">
                <strong>Old City Food Walk</strong>
                <span>Captain Meera · Medium tier · SOS active</span>
              </div>
            </div>
            <div className="th-trip-actions">
              <button className="th-track" onClick={() => soon("Live trip tracking")}>Track live trip</button>
              <button className="th-msg" onClick={() => soon("Messages")}>Message</button>
            </div>
          </div>
        </div>

        <div className="th-chip-row">
          <div className="th-chip active" onClick={() => soon("All")}>{Icon.heart}All</div>
          <div className="th-chip" onClick={() => soon("Food walks")}>{Icon.food}Food walks</div>
          <div className="th-chip" onClick={() => soon("Heritage")}>{Icon.heritage}Heritage</div>
          <div className="th-chip" onClick={() => soon("Trekking")}>{Icon.trek}Trekking</div>
          <div className="th-chip" onClick={() => soon("Photography")}>{Icon.camera}Photography</div>
          <div className="th-chip" onClick={() => soon("Nightlife")}>{Icon.night}Nightlife</div>
        </div>

        <section className="th-section">
          <div className="th-section-head">
            <h2>Discover</h2>
            <button onClick={() => soon("See all reels")}>See all reels</button>
          </div>
          <div className="th-reel-grid">
            {REELS.map((reel) => (
              <div key={reel.title} className={`th-reel-card ${reel.cls}`} onClick={() => soon(reel.title)}>
                <div className="th-reel-play">{Icon.play}</div>
                <div className="th-reel-info">
                  <strong>{reel.title}</strong>
                  <span>{reel.captain}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="th-section">
          <div className="th-section-head">
            <h2>Captains near you</h2>
            <button onClick={() => soon("See all Captains")}>See all Captains</button>
          </div>
          <div className="th-cap-grid">
            {CAPTAINS.map((cap) => (
              <div key={cap.name} className="th-cap-card" onClick={() => soon(`${cap.name}'s profile`)}>
                <div className="th-cap-top">
                  <div className="th-cap-avatar">{cap.initial}</div>
                  <div>
                    <div className="th-cap-name">{cap.name}</div>
                    <div className="th-cap-role">{cap.role}</div>
                  </div>
                </div>
                <div className="th-cap-rating">{Icon.star}{cap.rating} <span className="th-n">({cap.reviews})</span></div>
                <div className="th-cap-price">₹{cap.price} <span>/ day</span></div>
                <button className="th-cap-btn" onClick={(e) => { e.stopPropagation(); soon(`${cap.name}'s profile`); }}>View profile</button>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="th-footer">
        <div className="th-wrap">
          <span>© 2026 GoLoc. Local Travel Marketplace.</span>
          <span>Explore · Plan · Travel · Account</span>
        </div>
      </footer>
    </div>
  );
}
