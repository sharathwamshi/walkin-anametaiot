import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useEvent } from "../context/EventContext.jsx";
import ChannelSelect from "../components/ChannelSelect.jsx";
import QrViewer from "../components/QrViewer.jsx";
import { LoadingBlock } from "../components/Spinner.jsx";

export default function TestLevels() {
  const { activeEvent } = useEvent();
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ level_number: 1, name: "", test_type: "aptitude", duration_minutes: 30 });
  const [channels, setChannels] = useState({ whatsapp: false, email: true });
  const [entryQr, setEntryQr] = useState({});
  const fileRefs = useRef({});

  const load = async () => {
    if (!activeEvent) return;
    setLoading(true);
    try {
      const res = await api.get(`/tests/levels?event_id=${activeEvent.id}`);
      setLevels(res.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [activeEvent]);

  async function downloadQTemplate() {
    const res = await api.get("/tests/question-template", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = "question_upload_template.xlsx"; a.click();
  }

  async function createLevel(e) {
    e.preventDefault();
    await api.post("/tests/levels", { ...form, event_id: activeEvent.id });
    setForm({ level_number: levels.length + 2, name: "", test_type: "aptitude", duration_minutes: 30 });
    load();
  }

  async function uploadQuestions(levelId, file) {
    const fd = new FormData();
    fd.append("file", file);
    await api.post(`/tests/levels/${levelId}/questions/upload`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    load();
  }

  async function startLevel(levelId) {
    const chs = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    const res = await api.post(`/tests/levels/${levelId}/start`, { channels: chs });
    setEntryQr((prev) => ({ ...prev, [levelId]: { url: res.data.entry_url, qr_image: res.data.entry_qr_image } }));
    load();
  }

  async function loadEntryQr(levelId) {
    const res = await api.get(`/tests/levels/${levelId}/entry-qr`);
    setEntryQr((prev) => ({ ...prev, [levelId]: res.data }));
  }

  if (!activeEvent) return <div className="empty-state">Create a drive first from the Dashboard.</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Test Levels</h2>
          <p>Set up multi-level screening (aptitude, technical, etc.), upload question banks, and go live.</p>
        </div>
        <button className="btn btn-outline" onClick={downloadQTemplate}>⬇ Question Template</button>
      </div>

      <div className="card" style={{ maxWidth: 560, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 14 }}>Add a level</h3>
        <form onSubmit={createLevel} className="grid grid-2" style={{ gap: 12 }}>
          <div>
            <label className="small muted">Level number</label>
            <input type="number" min={1} value={form.level_number}
              onChange={(e) => setForm({ ...form, level_number: Number(e.target.value) })} style={{ width: "100%" }} />
          </div>
          <div>
            <label className="small muted">Type</label>
            <select value={form.test_type} onChange={(e) => setForm({ ...form, test_type: e.target.value })} style={{ width: "100%" }}>
              <option value="aptitude">Aptitude</option>
              <option value="technical">Technical</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="small muted">Round name</label>
            <input required placeholder="e.g. Quantitative Aptitude" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%" }} />
          </div>
          <div>
            <label className="small muted">Duration (minutes)</label>
            <input type="number" min={5} value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} style={{ width: "100%" }} />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn btn-primary" style={{ width: "100%" }}>+ Create Level</button>
          </div>
        </form>
      </div>

      <div className="card mt-8" style={{ marginBottom: 20, maxWidth: 560 }}>
        <div className="small muted" style={{ marginBottom: 10 }}>
          Broadcast channel when a round is started (candidates without WhatsApp/email
          can still scan the round's entry QR shown after starting):
        </div>
        <ChannelSelect channels={channels} setChannels={setChannels} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        {loading ? (
          <LoadingBlock label="Loading test levels…" />
        ) : (
          <>
            {levels.map((lv) => (
          <div className="card" key={lv.id}>
            <div className="flex justify-between items-center">
              <div>
                <h3>Round {lv.level_number}: {lv.name}</h3>
                <p className="small muted" style={{ marginTop: 4, textTransform: "capitalize" }}>
                  {lv.test_type} · {lv.duration_minutes} min · {lv.question_count} questions
                </p>
              </div>
              <span className={`badge badge-${lv.status}`}>{lv.status}</span>
            </div>

            <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-outline btn-sm" onClick={() => fileRefs.current[lv.id]?.click()}>
                ⬆ Upload Questions
              </button>
              <input type="file" accept=".xlsx" hidden
                ref={(el) => (fileRefs.current[lv.id] = el)}
                onChange={(e) => e.target.files[0] && uploadQuestions(lv.id, e.target.files[0])} />

              <Link to={`/tests/${lv.id}/questions`} className="btn btn-outline btn-sm">
                📋 Manage Questions {lv.question_count > 0 ? `(${lv.question_count})` : ""}
              </Link>

              {lv.status === "draft" && (
                <button className="btn btn-primary btn-sm" onClick={() => startLevel(lv.id)} disabled={lv.question_count === 0}>
                  ▶ Start Round & Send Invites
                </button>
              )}
              {(lv.status === "active" || lv.status === "completed") && (
                <>
                  <Link to={`/tests/${lv.id}/live`} className="btn btn-secondary btn-sm">📡 Live Monitor</Link>
                  <button className="btn btn-outline btn-sm" onClick={() => loadEntryQr(lv.id)}>🔗 Entry QR</button>
                </>
              )}
            </div>

            {entryQr[lv.id] && (
              <div className="flex items-center gap-16 mt-16" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <QrViewer qrImage={entryQr[lv.id].qr_image} url={entryQr[lv.id].url} label={`Round ${lv.level_number} Entry QR`} size={100} />
                <div>
                  <div className="small muted">Display or print this at the venue — anyone can scan it to reach the assessment and enter their Candidate ID.</div>
                  <div className="small" style={{ wordBreak: "break-all", marginTop: 4 }}>{entryQr[lv.id].url}</div>
                </div>
              </div>
            )}
          </div>
        ))}
            {levels.length === 0 && <div className="empty-state">No levels yet — create your first round above.</div>}
          </>
        )}
      </div>
    </div>
  );
}
