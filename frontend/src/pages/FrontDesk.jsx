import React, { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useEvent } from "../context/EventContext.jsx";
import ChannelSelect from "../components/ChannelSelect.jsx";
import { LoadingBlock } from "../components/Spinner.jsx";

export default function FrontDesk() {
  const { activeEvent } = useEvent();
  const [manualId, setManualId] = useState("");
  const [scanned, setScanned] = useState([]); // batch reviewed before confirming present
  const [error, setError] = useState("");
  const [scannerOn, setScannerOn] = useState(false);
  const [channels, setChannels] = useState({ whatsapp: true, email: true });
  const [checkedInList, setCheckedInList] = useState([]);
  const [loadingCheckedIn, setLoadingCheckedIn] = useState(true);
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);

  const loadCheckedIn = async () => {
    if (!activeEvent) return;
    setLoadingCheckedIn(true);
    try {
      const res = await api.get(`/frontdesk/checked-in?event_id=${activeEvent.id}`);
      setCheckedInList(res.data);
    } finally {
      setLoadingCheckedIn(false);
    }
  };
  useEffect(() => { loadCheckedIn(); }, [activeEvent]);

  async function lookup(uniqueId) {
    setError("");
    try {
      const res = await api.post("/frontdesk/scan", { unique_id: uniqueId.trim() });
      const candidate = res.data.candidate;
      if (scanned.find((c) => c.id === candidate.id)) return;
      setScanned((prev) => [...prev, candidate]);
    } catch (e) {
      setError(e.response?.data?.error || "Candidate not found");
    }
  }

  async function submitManual(e) {
    e.preventDefault();
    if (!manualId.trim()) return;
    await lookup(manualId);
    setManualId("");
  }

  async function startCamera() {
    setScannerOn(true);
    const { Html5Qrcode } = await import("html5-qrcode");
    const el = "qr-reader";
    html5QrRef.current = new Html5Qrcode(el);
    try {
      await html5QrRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        (decodedText) => lookup(decodedText),
        () => {}
      );
    } catch (e) {
      setError("Could not access camera. Use manual ID entry instead.");
      setScannerOn(false);
    }
  }

  async function stopCamera() {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop(); } catch {}
    }
    setScannerOn(false);
  }

  function removeFromBatch(id) {
    setScanned((prev) => prev.filter((c) => c.id !== id));
  }

  async function markPresent() {
    const ids = scanned.map((c) => c.id);
    if (ids.length === 0) return;
    await api.post("/frontdesk/mark-present", { candidate_ids: ids });
    const chs = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    await api.post("/frontdesk/send-welcome", { candidate_ids: ids, channels: chs });
    setScanned([]);
    loadCheckedIn();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Front Desk</h2>
          <p>Scan a candidate's QR (or enter their Candidate ID) to check them in and send a welcome message.</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3>Scan QR</h3>
          <div id="qr-reader" style={{ marginTop: 12, borderRadius: 12, overflow: "hidden" }} />
          <div className="flex gap-8 mt-16">
            {!scannerOn ? (
              <button className="btn btn-secondary" onClick={startCamera}>📷 Start Camera Scanner</button>
            ) : (
              <button className="btn btn-outline" onClick={stopCamera}>Stop Scanner</button>
            )}
          </div>

          <form onSubmit={submitManual} className="flex gap-8 mt-16">
            <input placeholder="Or type Candidate ID (e.g. AFPL7F3A9B)" value={manualId}
              onChange={(e) => setManualId(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-outline">Add</button>
          </form>
          {error && <div className="small mt-8" style={{ color: "var(--red)" }}>{error}</div>}
        </div>

        <div className="card">
          <div className="flex justify-between items-center">
            <h3>Scanned Batch ({scanned.length})</h3>
          </div>
          {scanned.length === 0 ? (
            <div className="empty-state">Scanned candidates will appear here for review before marking present.</div>
          ) : (
            <>
              <table className="mt-8">
                <thead><tr><th>ID</th><th>Name</th><th></th></tr></thead>
                <tbody>
                  {scanned.map((c) => (
                    <tr key={c.id}>
                      <td>{c.unique_id}</td>
                      <td>{c.name} {c.checked_in && <span className="small muted">(already in)</span>}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => removeFromBatch(c.id)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-16">
                <ChannelSelect channels={channels} setChannels={setChannels} />
              </div>
              <button className="btn btn-primary mt-16" onClick={markPresent}>
                ✅ Mark Present & Send Welcome
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card mt-24">
        <h3 style={{ marginBottom: 14 }}>Checked-in so far ({checkedInList.length})</h3>
        {loadingCheckedIn ? (
          <LoadingBlock label="Loading checked-in candidates…" />
        ) : checkedInList.length === 0 ? (
          <div className="empty-state">No one checked in yet.</div>
        ) : (
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Source</th><th>Welcome Sent</th></tr></thead>
            <tbody>
              {checkedInList.map((c) => (
                <tr key={c.id}>
                  <td>{c.unique_id}</td><td>{c.name}</td>
                  <td style={{ textTransform: "capitalize" }}>{c.source.replace("_", "-")}</td>
                  <td>{c.welcome_sent ? <span className="badge badge-sent">Sent</span> : <span className="badge badge-pending">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
