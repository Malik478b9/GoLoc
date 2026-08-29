import React, { useEffect, useState } from "react";

import { fetchIncidents, updateIncident } from "../api/client";

const SEVERITY_CLASS: Record<string, string> = {
  low: "badge-neutral",
  medium: "badge-warning",
  high: "badge-danger",
  critical: "badge-danger",
};

/** Section 2.3 Trust/Growth > Incidents — the SOS escalation queue. */
export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([]);

  const load = () => fetchIncidents().then(({ data }) => setIncidents(data.results ?? data));

  useEffect(() => {
    load();
  }, []);

  const markInvestigating = (id: string) => updateIncident(id, { status: "investigating" }).then(load);
  const close = (id: string) => updateIncident(id, { status: "closed" }).then(load);

  return (
    <div>
      <h1 className="page-title">Incidents</h1>
      <p className="page-subtitle">SOS alerts and safety escalations across all active trips.</p>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Booking</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Summary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 && (
              <tr><td colSpan={5}>No incidents recorded.</td></tr>
            )}
            {incidents.map((i) => (
              <tr key={i.id}>
                <td>{i.bkg_id}</td>
                <td><span className={`badge ${SEVERITY_CLASS[i.severity]}`}>{i.severity}</span></td>
                <td>{i.status}</td>
                <td>{i.summary}</td>
                <td>
                  {i.status === "open" && (
                    <button className="btn btn-ghost" onClick={() => markInvestigating(i.id)}>
                      Investigate
                    </button>
                  )}
                  {i.status !== "closed" && (
                    <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={() => close(i.id)}>
                      Close
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
