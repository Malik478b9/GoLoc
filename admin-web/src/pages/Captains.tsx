import React, { useEffect, useState } from "react";

import { fetchCaptains } from "../api/client";

interface CaptainRow {
  id: string;
  cap_id: string;
  business_name: string;
  home_city: string;
  average_rating: string;
  total_trips: number;
}

/**
 * Section 2.3 Marketplace > Captains / Verification. Note this page hits
 * the same /captains/discover/ endpoint the Traveler app uses; a
 * production build would add a staff-only /admin/captains/ endpoint that
 * also returns non-live and unverified Captains (this discover endpoint
 * only returns already-live ones by design — see backend CaptainDiscoveryViewSet).
 */
export default function CaptainsPage() {
  const [query, setQuery] = useState("");
  const [captains, setCaptains] = useState<CaptainRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchCaptains({ q: query })
      .then(({ data }) => setCaptains(data.results ?? data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="page-title">Captains & Verification</h1>
      <p className="page-subtitle">Search by CAP-ID, business name, or specialty (BR-7).</p>

      <div className="search-bar">
        <input
          placeholder="e.g. CAP-HYD-0001"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button onClick={load}>Search</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>CAP-ID</th>
              <th>Business name</th>
              <th>City</th>
              <th>Rating</th>
              <th>Trips</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}>Loading…</td>
              </tr>
            )}
            {!loading && captains.length === 0 && (
              <tr>
                <td colSpan={5}>No Captains match this search.</td>
              </tr>
            )}
            {captains.map((c) => (
              <tr key={c.id}>
                <td>{c.cap_id}</td>
                <td>{c.business_name}</td>
                <td>{c.home_city}</td>
                <td>★ {c.average_rating}</td>
                <td>{c.total_trips}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
