import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

import { fetchCaptains, fetchDisputes, fetchIncidents } from "../api/client";

/** Section 2.3 Overview > Command Center. */
export default function DashboardPage() {
  const [stats, setStats] = useState({ captains: 0, pendingVerification: 0, incidents: 0, disputes: 0 });

  useEffect(() => {
    Promise.all([
      fetchCaptains(),
      fetchCaptains({ verification_status: "in_review" }),
      fetchIncidents(),
      fetchDisputes(),
    ]).then(([captains, pending, incidents, disputes]) => {
      const count = (r: any) => (r.data.count ?? (r.data.results ?? r.data).length) || 0;
      setStats({
        captains: count(captains),
        pendingVerification: count(pending),
        incidents: count(incidents),
        disputes: count(disputes),
      });
    });
  }, []);

  // Illustrative revenue-mix chart per Section 6.2 of the technical spec
  // (Commission / Insurance / Sponsored-ads / Pro-B2B target mix).
  const revenueMix = [
    { name: "Commission", value: 70 },
    { name: "Insurance", value: 12 },
    { name: "Ads", value: 10 },
    { name: "Pro/B2B", value: 8 },
  ];

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="page-subtitle">Live marketplace snapshot across all cities.</p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.captains}</div>
          <div className="stat-label">Live Captains</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.pendingVerification}</div>
          <div className="stat-label">Pending verification</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.incidents}</div>
          <div className="stat-label">Open incidents</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.disputes}</div>
          <div className="stat-label">Open disputes</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 700 }}>
          Target revenue mix (Section 6.2)
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={revenueMix}>
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit="%" />
            <Tooltip />
            <Bar dataKey="value" fill="#0F766E" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
