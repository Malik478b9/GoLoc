import React from "react";
import { NavLink, Outlet } from "react-router-dom";

/**
 * Sidebar groups mirror Section 2.3 of the spec exactly:
 * Marketplace / Ops-Finance / Trust-Growth / Platform.
 */
export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          GoLoc Admin
          <span>Command Center</span>
        </div>

        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          Overview
        </NavLink>

        <div className="nav-section-label">Marketplace</div>
        <NavLink to="/captains" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          Captains & Verification
        </NavLink>

        <div className="nav-section-label">Ops / Finance</div>
        <NavLink to="/bookings" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          Bookings (BKG lookup)
        </NavLink>

        <div className="nav-section-label">Trust / Growth</div>
        <NavLink to="/incidents" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          Incidents
        </NavLink>
        <NavLink to="/disputes" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          Disputes
        </NavLink>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
