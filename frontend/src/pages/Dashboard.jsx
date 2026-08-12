import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useEvent } from "../context/EventContext.jsx";
import { LoadingBlock } from "../components/Spinner.jsx";

function StatCard({ icon, color, value, label }) {
  return (
    <div className="card stat-card">
      <div className="stat-icon" style={{ background: color }}>{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function FunnelBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mt-16">
      <div className="flex justify-between small" style={{ marginBottom: 6 }}>
        <span>{label}</span>
        <span className="muted">{value}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { activeEvent, loading } = useEvent();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!activeEvent) return;
    setStats(null);
    api.get(`/events/${activeEvent.id}/stats`).then((r) => setStats(r.data));
  }, [activeEvent]);

  if (loading) return <LoadingBlock label="Loading…" />;

  if (!activeEvent) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h2>Welcome to the Walk-in Drive Console</h2>
            <p>Create your first drive to start inviting and screening candidates.</p>
          </div>
        </div>
        <div className="card" style={{ maxWidth: 480, textAlign: "center" }}>
          <p className="muted">
            Drives are created and configured — including a custom candidate registration form —
            from the Events page.
          </p>
          <Link to="/events" className="btn btn-primary mt-16" style={{ justifyContent: "center" }}>
            + Create your first drive
          </Link>
        </div>
      </div>
    );
  }

  if (!stats) return <LoadingBlock label="Loading dashboard…" />;

  const total = stats.total_candidates || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{activeEvent.name}</h2>
          <p>{activeEvent.venue || "Venue not set"} {activeEvent.drive_date ? `· ${activeEvent.drive_date}` : ""}</p>
        </div>
        <div className="flex gap-8">
          <Link to="/events" className="btn btn-outline">🗂 Manage Events</Link>
        </div>
      </div>

      <div className="grid grid-4">
        <StatCard icon="📋" color="var(--badge-4)" value={stats.pre_list_count} label="Pre-list Candidates" />
        <StatCard icon="🚶" color="var(--badge-3)" value={stats.walkin_count} label="Walk-in Registrations" />
        <StatCard icon="✅" color="var(--green)" value={stats.checked_in_count} label="Checked In" />
        <StatCard icon="📤" color="var(--orange)" value={stats.qr_sent_count} label="QR Invites Sent" />
      </div>

      <div className="grid grid-2 mt-24" style={{ alignItems: "start" }}>
        <div className="card">
          <h3>Registration & Invite Funnel</h3>
          <FunnelBar label="Total candidates" value={stats.total_candidates} max={total} color="var(--navy-light)" />
          <FunnelBar label="QR invites sent" value={stats.qr_sent_count} max={total} color="var(--orange)" />
          <FunnelBar label="Checked in at venue" value={stats.checked_in_count} max={total} color="var(--green)" />
          <FunnelBar label="Welcome message sent" value={stats.welcome_sent_count} max={total} color="var(--badge-4)" />
          {stats.qr_failed_count > 0 && (
            <div className="small mt-16" style={{ color: "var(--red)" }}>
              ⚠ {stats.qr_failed_count} QR invite(s) failed to send — check Candidates & QR.
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Assessment Funnel</h3>
          {stats.levels.length === 0 ? (
            <div className="empty-state">No test levels created yet. Head to <b>Test Levels</b> to set one up.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Level</th><th>Status</th><th>Sessions</th><th>Completed</th><th>Flagged</th><th>Passed</th></tr>
              </thead>
              <tbody>
                {stats.levels.map((lv) => (
                  <tr key={lv.id}>
                    <td><b>Round {lv.level_number}</b> — {lv.name}</td>
                    <td><span className={`badge badge-${lv.status}`}>{lv.status}</span></td>
                    <td>{lv.total_sessions}</td>
                    <td>{lv.completed}</td>
                    <td>{lv.flagged > 0 ? <span className="badge badge-flagged">{lv.flagged}</span> : 0}</td>
                    <td>{lv.passed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
