import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { LoadingBlock } from "../components/Spinner.jsx";

const STATUS_OPTIONS = ["not_started", "in_progress", "flagged", "completed", "disqualified"];

export default function LiveMonitor() {
  const { levelId } = useParams();
  const [data, setData] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const load = async () => {
    const res = await api.get(`/tests/levels/${levelId}/live`);
    setData(res.data);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [levelId]);

  async function resetSession(sessionId) {
    // Violation flow — unchanged. Only clears a tab-switch flag and resumes.
    await api.post(`/tests/sessions/${sessionId}/reset`);
    load();
  }

  async function overrideStatus(sessionId, newStatus) {
    // Separate, more general override — for a session stuck in any state,
    // not just the tab-violation flag/reset case above.
    setUpdatingId(sessionId);
    try {
      await api.put(`/tests/sessions/${sessionId}/status`, { status: newStatus });
      await load();
    } finally {
      setUpdatingId(null);
    }
  }

  if (!data) return <LoadingBlock label="Loading live session data…" />;
  const { level, sessions, flagged_count, in_progress_count, completed_count } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Live Monitor — Round {level.level_number}: {level.name}</h2>
          <p>Auto-refreshes every 3 seconds. Flagged candidates are locked until you reset them.</p>
        </div>
        <Link to="/tests" className="btn btn-outline">← Back to Levels</Link>
      </div>

      <div className="grid grid-3">
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: "var(--navy-light)" }}>👥</div>
          <div><div className="stat-value">{in_progress_count}</div><div className="stat-label">In Progress</div></div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: "var(--red)" }}>🚩</div>
          <div><div className="stat-value">{flagged_count}</div><div className="stat-label">Flagged (tab switched)</div></div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: "var(--green)" }}>✔</div>
          <div><div className="stat-value">{completed_count}</div><div className="stat-label">Completed</div></div>
        </div>
      </div>

      <div className="card mt-24">
        <div className="flex justify-between items-center" style={{ marginBottom: 14 }}>
          <h3>Candidate Sessions</h3>
          <span className="small muted">
            "Set status" is a manual override for stuck sessions — separate from tab-violation flags.
          </span>
        </div>
        {sessions.length === 0 ? (
          <div className="empty-state">No candidate has started this round yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Status</th><th>Tab Violations</th><th>Score</th>
                <th>Violation Reset</th><th>Set Status (admin override)</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} style={s.is_flagged ? { background: "var(--red-light)" } : {}}>
                  <td>{s.candidate_unique_id}</td>
                  <td>{s.candidate_name}</td>
                  <td>
                    <span className={`badge badge-${s.is_flagged ? "flagged" : s.status}`}>
                      {s.is_flagged ? "flagged" : s.status.replace("_", " ")}
                    </span>
                  </td>
                  <td>{s.tab_violation_count}</td>
                  <td>{s.score ?? "—"}</td>
                  <td>
                    {s.is_flagged ? (
                      <button className="btn btn-secondary btn-sm" onClick={() => resetSession(s.id)}>
                        ⟲ Reset & Resume
                      </button>
                    ) : "—"}
                  </td>
                  <td>
                    <select
                      value={s.is_flagged ? "flagged" : s.status}
                      disabled={updatingId === s.id}
                      onChange={(e) => overrideStatus(s.id, e.target.value)}
                      style={{ fontSize: 12.5, padding: "6px 8px" }}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt.replace("_", " ")}</option>
                      ))}
                    </select>
                    {updatingId === s.id && <span className="small muted" style={{ marginLeft: 6 }}>saving…</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
