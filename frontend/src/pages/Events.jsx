import React, { useEffect, useState } from "react";
import api from "../api/client";
import { useEvent } from "../context/EventContext.jsx";
import RegistrationFormBuilder, { DEFAULT_FORM_CONFIG } from "../components/RegistrationFormBuilder.jsx";
import { LoadingBlock } from "../components/Spinner.jsx";

const STATUS_OPTIONS = ["draft", "active", "closed"];

export default function Events() {
  const { events, activeEvent, setActiveEventId, refresh, loading } = useEvent();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", venue: "", drive_date: "", description: "" });
  const [formConfig, setFormConfig] = useState(DEFAULT_FORM_CONFIG);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState(null); // event id being edited
  const [editForm, setEditForm] = useState({});
  const [editFormConfig, setEditFormConfig] = useState(DEFAULT_FORM_CONFIG);
  const [editTab, setEditTab] = useState("details"); // "details" | "form"

  const [deletingId, setDeletingId] = useState(null); // event id pending delete confirmation
  const [deleteInfo, setDeleteInfo] = useState(null); // {candidate_count, level_count} from server
  const [deleting, setDeleting] = useState(false);

  const [statsById, setStatsById] = useState({});

  useEffect(() => {
    events.forEach((e) => {
      if (!statsById[e.id]) {
        api.get(`/events/${e.id}/stats`).then((r) =>
          setStatsById((prev) => ({ ...prev, [e.id]: r.data }))
        );
      }
    });
  }, [events]);

  async function createEvent(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post("/events", { ...form, registration_form_config: formConfig });
      setShowCreate(false);
      setForm({ name: "", venue: "", drive_date: "", description: "" });
      setFormConfig(DEFAULT_FORM_CONFIG);
      await refresh();
      setActiveEventId(res.data.id);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(ev) {
    setEditing(ev.id);
    setEditTab("details");
    setEditForm({
      name: ev.name, venue: ev.venue || "", drive_date: ev.drive_date || "",
      status: ev.status, description: ev.description || "",
    });
    setEditFormConfig(ev.registration_form_config || DEFAULT_FORM_CONFIG);
  }

  async function saveEdit(id) {
    await api.put(`/events/${id}`, { ...editForm, registration_form_config: editFormConfig });
    setEditing(null);
    refresh();
  }

  async function requestDelete(ev) {
    setDeletingId(ev.id);
    setDeleteInfo(null);
    try {
      // First call intentionally omits confirm — the backend responds with
      // exactly what's about to be deleted so we can show real counts.
      await api.delete(`/events/${ev.id}`);
    } catch (err) {
      setDeleteInfo(err.response?.data || null);
    }
  }

  async function confirmDelete(id) {
    setDeleting(true);
    try {
      await api.delete(`/events/${id}`, { data: { confirm: true } });
      setDeletingId(null);
      setDeleteInfo(null);
      if (activeEvent?.id === id) {
        // Fetch the fresh list directly rather than relying on refresh()'s
        // internal auto-select — its closure still has the just-deleted
        // event's id at this point, so it wouldn't pick a replacement.
        const res = await api.get("/events");
        setActiveEventId(res.data.length > 0 ? res.data[0].id : null);
      }
      refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Events</h2>
          <p>Every drive is tracked independently — candidates, tests, and results never mix across events.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>+ New Drive</button>
      </div>

      {showCreate && (
        <div className="card mt-16" style={{ maxWidth: 640, marginBottom: 20 }}>
          <h3 style={{ marginBottom: 14 }}>Create a walk-in drive</h3>
          <form onSubmit={createEvent} className="flex" style={{ flexDirection: "column", gap: 12 }}>
            <input placeholder="Drive name (e.g. Campus Walk-in — Aug 2026)" required
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            <input type="date" value={form.drive_date} onChange={(e) => setForm({ ...form, drive_date: e.target.value })} />
            <textarea placeholder="Description (optional)" rows={2}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <h4 style={{ marginTop: 8 }}>Candidate registration form</h4>
            <p className="small muted" style={{ marginTop: -8 }}>
              Choose what a walk-in candidate is asked for when they self-register by scanning the standee QR.
            </p>
            <RegistrationFormBuilder config={formConfig} setConfig={setFormConfig} />

            <button className="btn btn-primary" disabled={creating} style={{ alignSelf: "flex-start" }}>
              {creating ? "Creating…" : "Create Drive"}
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-2">
        {loading ? (
          <LoadingBlock label="Loading events…" />
        ) : (
          <>
          {events.map((ev) => {
          const stats = statsById[ev.id];
          const isActive = activeEvent?.id === ev.id;
          const isEditing = editing === ev.id;
          const isDeleting = deletingId === ev.id;

          return (
            <div key={ev.id} className={"event-card" + (isActive ? " active" : "")}
              onClick={() => !isEditing && !isDeleting && setActiveEventId(ev.id)}>

              {isDeleting ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <h3 style={{ fontSize: 16, color: "var(--red)" }}>Delete "{ev.name}"?</h3>
                  {deleteInfo ? (
                    <>
                      <p className="small mt-8">
                        This permanently removes <b>{deleteInfo.candidate_count}</b> candidate(s) and{" "}
                        <b>{deleteInfo.level_count}</b> test round(s) — including every score, session,
                        and message log tied to this drive. This cannot be undone.
                      </p>
                      <div className="flex gap-8 mt-16">
                        <button className="btn btn-outline btn-sm" onClick={() => { setDeletingId(null); setDeleteInfo(null); }}>
                          Cancel
                        </button>
                        <button className="btn btn-sm" style={{ background: "var(--red)", color: "#fff" }}
                          disabled={deleting} onClick={() => confirmDelete(ev.id)}>
                          {deleting ? "Deleting…" : "Yes, delete permanently"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="small muted mt-8">Checking what will be removed…</p>
                  )}
                </div>
              ) : isEditing ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="tabs" style={{ marginBottom: 14 }}>
                    <button type="button" className={"tab" + (editTab === "details" ? " active" : "")}
                      onClick={() => setEditTab("details")}>Details</button>
                    <button type="button" className={"tab" + (editTab === "form" ? " active" : "")}
                      onClick={() => setEditTab("form")}>Registration Form</button>
                  </div>

                  {editTab === "details" ? (
                    <div className="flex" style={{ flexDirection: "column", gap: 10 }}>
                      <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                      <input value={editForm.venue} onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })} placeholder="Venue" />
                      <input type="date" value={editForm.drive_date || ""} onChange={(e) => setEditForm({ ...editForm, drive_date: e.target.value })} />
                      <textarea rows={2} value={editForm.description} placeholder="Description"
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                      <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  ) : (
                    <RegistrationFormBuilder config={editFormConfig} setConfig={setEditFormConfig} />
                  )}

                  <div className="flex gap-8 mt-16">
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(ev.id)}>Save</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <h3 style={{ fontSize: 16 }}>{ev.name}</h3>
                    <span className={`badge badge-${ev.status}`}>{ev.status}</span>
                  </div>
                  <p className="small muted mt-8">{ev.venue || "Venue not set"} {ev.drive_date ? `· ${ev.drive_date}` : ""}</p>

                  {stats && (
                    <div className="grid grid-4 mt-16" style={{ gap: 10 }}>
                      <MiniStat value={stats.total_candidates} label="Candidates" />
                      <MiniStat value={stats.checked_in_count} label="Checked In" />
                      <MiniStat value={stats.qr_sent_count} label="QR Sent" />
                      <MiniStat value={stats.levels.length} label="Rounds" />
                    </div>
                  )}

                  <div className="flex gap-8 mt-16">
                    <button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); startEdit(ev); }}>Edit</button>
                    {!isActive && (
                      <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setActiveEventId(ev.id); }}>
                        Switch to this drive
                      </button>
                    )}
                    <button className="btn btn-sm" style={{ marginLeft: "auto", background: "var(--red-light)", color: "var(--red)" }}
                      onClick={(e) => { e.stopPropagation(); requestDelete(ev); }}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
          {events.length === 0 && <div className="empty-state">No drives yet — create your first one above.</div>}
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ value, label }) {
  return (
    <div style={{ textAlign: "center", background: "var(--bg)", borderRadius: 10, padding: "10px 4px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--navy)" }}>{value}</div>
      <div className="small muted" style={{ fontSize: 10.5 }}>{label}</div>
    </div>
  );
}
