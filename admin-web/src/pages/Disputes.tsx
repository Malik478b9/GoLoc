import React, { useEffect, useState } from "react";

import { fetchDisputes, resolveDispute } from "../api/client";

/** Section 2.3 Trust/Growth > Disputes — e.g. refund disagreements post BR-4. */
export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const load = () => fetchDisputes().then(({ data }) => setDisputes(data.results ?? data));

  useEffect(() => {
    load();
  }, []);

  const resolve = (id: string, status: string) => {
    resolveDispute(id, { status, resolution_notes: notesById[id] ?? "" }).then(load);
  };

  return (
    <div>
      <h1 className="page-title">Disputes</h1>
      <p className="page-subtitle">Traveler/Captain disagreements requiring Admin mediation.</p>

      {disputes.length === 0 && <p style={{ color: "var(--text-3)" }}>No open disputes.</p>}

      {disputes.map((d) => (
        <div key={d.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>{d.bkg_id}</strong>
            <span className="badge badge-warning">{d.status}</span>
          </div>
          <p style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 12 }}>{d.reason}</p>

          {d.status === "open" && (
            <>
              <textarea
                placeholder="Resolution notes"
                value={notesById[d.id] ?? ""}
                onChange={(e) => setNotesById((prev) => ({ ...prev, [d.id]: e.target.value }))}
                style={{ width: "100%", minHeight: 60, padding: 10, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 10 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => resolve(d.id, "resolved_traveler")}>
                  Resolve for Traveler
                </button>
                <button className="btn btn-primary" onClick={() => resolve(d.id, "resolved_captain")}>
                  Resolve for Captain
                </button>
                <button className="btn btn-ghost" onClick={() => resolve(d.id, "resolved_split")}>
                  Split resolution
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
