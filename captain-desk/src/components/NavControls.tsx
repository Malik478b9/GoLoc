/**
 * Top-nav controls shared by the Traveler and Captain home pages:
 * the city picker and the account menu. Same file in both apps.
 */
import React, { useEffect, useRef, useState } from "react";

import { apiError, fetchCities, updateMe, type City, type User } from "../api/client";
import "./nav-controls.css";

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const PinIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 21s-7-5.2-9.4-9.6C1 8 2.6 4.6 6 4a5 5 0 016 2 5 5 0 016-2c3.4.6 5 4 3.4 7.4C19 15.8 12 21 12 21z" />
    <circle cx="12" cy="10" r="2" />
  </svg>
);

export function CityPicker({ user, onUserChange }: { user: User; onUserChange: (u: User) => void }) {
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<City[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [query, setQuery] = useState("");
  const ref = useDismiss(open, () => setOpen(false));

  const load = () => {
    setLoadError("");
    fetchCities()
      .then(setCities)
      .catch((err) => setLoadError(apiError(err).message));
  };

  useEffect(() => {
    if (open && cities === null) load();
    if (open) {
      setQuery("");
      setSaveError("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (city: City) => {
    if (city.id === user.city?.id) {
      setOpen(false);
      return;
    }
    setSaving(city.id);
    setSaveError("");
    try {
      onUserChange(await updateMe({ city_id: city.id }));
      setOpen(false);
    } catch (err) {
      setSaveError(apiError(err).message);
    } finally {
      setSaving(null);
    }
  };

  const shown = (cities || []).filter((c) =>
    `${c.name} ${c.state}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="gl-pop-anchor" ref={ref}>
      <button
        type="button"
        className={`gl-city-btn ${user.city ? "" : "unset"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {PinIcon}
        <span>{user.city?.name || "Choose city"}</span>
        <span className="gl-chev" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="gl-pop gl-city-pop" role="dialog" aria-label="Choose your city">
          <div className="gl-pop-title">Which city are you in?</div>
          {cities && cities.length > 6 && (
            <input
              className="gl-pop-search"
              placeholder="Search cities"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          )}
          {loadError ? (
            <div className="gl-pop-msg">
              {loadError} <button type="button" className="gl-link" onClick={load}>Retry</button>
            </div>
          ) : cities === null ? (
            <div className="gl-pop-msg">Loading cities…</div>
          ) : shown.length === 0 ? (
            <div className="gl-pop-msg">No matching city yet. GoLoc is launching in more cities soon.</div>
          ) : (
            <ul className="gl-city-list" role="listbox">
              {shown.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.id === user.city?.id}
                    className={c.id === user.city?.id ? "selected" : ""}
                    disabled={saving !== null}
                    onClick={() => choose(c)}
                  >
                    <span className="gl-city-name">{c.name}</span>
                    <span className="gl-city-state">{saving === c.id ? "Saving…" : c.state}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {saveError && <div className="gl-pop-error" role="alert">{saveError}</div>}
        </div>
      )}
    </div>
  );
}

const ROLE_LABEL: Record<User["role"], string> = { traveler: "Traveler", captain: "Captain", admin: "Admin" };

export function AccountMenu({ user, onLogout }: { user: User; onLogout: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const name = user.full_name || "Your account";
  const firstName = (user.full_name || "Account").split(" ")[0];
  const initial = (user.full_name || user.phone_number.replace("+91", "")).charAt(0).toUpperCase();
  const phone = user.phone_number.startsWith("+91")
    ? `+91 ${user.phone_number.slice(3, 8)} ${user.phone_number.slice(8)}`
    : user.phone_number;

  return (
    <div className="gl-pop-anchor" ref={ref}>
      <button type="button" className="gl-account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="gl-avatar">{initial}</span>
        <span className="gl-account-name">{firstName}</span>
      </button>
      {open && (
        <div className="gl-pop gl-account-pop" role="menu">
          <div className="gl-account-head">
            <span className="gl-avatar lg">{initial}</span>
            <div>
              <div className="gl-account-full">{name}</div>
              <div className="gl-account-phone">{phone}</div>
              <div className="gl-account-role">{ROLE_LABEL[user.role]} account</div>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="gl-menu-item danger"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await onLogout();
            }}
          >
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
