import React, { useState } from "react";

import { lookupBooking } from "../api/client";

const STATUS_CLASS: Record<string, string> = {
  requested: "badge-warning",
  accepted: "badge-neutral",
  paid: "badge-success",
  in_progress: "badge-success",
  completed: "badge-neutral",
  cancelled_by_traveler: "badge-danger",
  cancelled_by_captain: "badge-danger",
  disputed: "badge-danger",
};

/** Section 2.3 Ops/Finance > Bookings, implementing BR-7 (Admin: BKG-ID search). */
export default function BookingsPage() {
  const [bkgId, setBkgId] = useState("");
  const [booking, setBooking] = useState<any>(null);
  const [error, setError] = useState("");

  const search = async () => {
    setError("");
    setBooking(null);
    try {
      const { data } = await lookupBooking(bkgId.trim());
      setBooking(data);
    } catch {
      setError("No booking found with that BKG-ID.");
    }
  };

  return (
    <div>
      <h1 className="page-title">Bookings</h1>
      <p className="page-subtitle">Look up any booking by its BKG-ID for reconciliation or support.</p>

      <div className="search-bar">
        <input
          placeholder="BKG-0000123"
          value={bkgId}
          onChange={(e) => setBkgId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button onClick={search}>Look up</button>
      </div>

      {error && <p style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</p>}

      {booking && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18 }}>{booking.bkg_id}</h2>
            <span className={`badge ${STATUS_CLASS[booking.status] ?? "badge-neutral"}`}>
              {booking.status.replace(/_/g, " ")}
            </span>
          </div>

          <table>
            <tbody>
              <tr><td>Captain</td><td>{booking.captain_cap_id}</td></tr>
              <tr><td>Trip dates</td><td>{booking.trip_start_date} → {booking.trip_end_date}</td></tr>
              <tr><td>Pax</td><td>{booking.pax_count}</td></tr>
              <tr><td>Fare</td><td>₹{booking.fare_amount}</td></tr>
              <tr><td>Insurance</td><td>₹{booking.insurance_amount}</td></tr>
              <tr><td>Total</td><td>₹{booking.total_amount}</td></tr>
              <tr><td>Commission (platform)</td><td>₹{booking.commission_amount}</td></tr>
              <tr><td>Captain net</td><td>₹{booking.captain_net_amount}</td></tr>
              <tr><td>SOS active</td><td>{booking.sos_active ? "Yes" : "No"}</td></tr>
              <tr><td>Insurance active</td><td>{booking.insurance_active ? "Yes" : "No"}</td></tr>
              {booking.refund && (
                <tr><td>Refund</td><td>{booking.refund.refund_percentage}% · ₹{booking.refund.refund_amount}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
