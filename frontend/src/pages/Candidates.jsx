import React, { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useEvent } from "../context/EventContext.jsx";
import ChannelSelect from "../components/ChannelSelect.jsx";
import QrViewer from "../components/QrViewer.jsx";
import { LoadingBlock } from "../components/Spinner.jsx";
import CandidateDetailModal from "../components/CandidateDetailModal.jsx";

export default function Candidates() {
  const { activeEvent } = useEvent();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState({ whatsapp: true, email: true });
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [sending, setSending] = useState(false);
  const [standee, setStandee] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const fileRef = useRef();
  const pollRef = useRef();

  const load = async () => {
    if (!activeEvent) return;
    setLoading(true);
    try {
      const res = await api.get(`/candidates?event_id=${activeEvent.id}`);
      setCandidates(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activeEvent]);
  useEffect(() => {
    if (!activeEvent) return;
    api.get(`/events/${activeEvent.id}/standee-qr`).then((r) => setStandee(r.data));
  }, [activeEvent]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function downloadTemplate() {
    const res = await api.get("/candidates/template", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = "candidate_upload_template.xlsx"; a.click();
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file || !activeEvent) return;
    setUploading(true);
    setUploadResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("event_id", activeEvent.id);
    try {
      const res = await api.post("/candidates/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadResult(res.data);
      load();
    } finally {
      setUploading(false);
      fileRef.current.value = "";
    }
  }

  async function startSend() {
    if (!activeEvent) return;
    const chs = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    if (chs.length === 0) return alert("Select at least one channel (WhatsApp and/or Email)");
    setSending(true);
    await api.post(`/qr/generate-send/${activeEvent.id}`, { channels: chs });
    pollRef.current = setInterval(async () => {
      const res = await api.get(`/qr/progress/${activeEvent.id}`);
      setProgress(res.data);
      setCandidates(res.data.candidates);
      const busy = res.data.counts.queued + res.data.counts.sending;
      if (busy === 0) {
        clearInterval(pollRef.current);
        setSending(false);
      }
    }, 1500);
  }

  const preList = candidates.filter((c) => c.source === "pre_list");
  const total = preList.length || 1;
  const sentCount = preList.filter((c) => c.qr_send_status === "sent").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Candidates & QR Invites</h2>
          <p>Upload your pre-list, generate a unique QR + Candidate ID for each, and send invites.</p>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline" onClick={downloadTemplate}>⬇ Download Template</button>
          <button className="btn btn-primary" onClick={() => fileRef.current.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "⬆ Upload Candidate List"}
          </button>
          <input type="file" ref={fileRef} accept=".xlsx" hidden onChange={handleUpload} />
        </div>
      </div>

      {uploadResult && (
        <div className="card mt-16" style={{ marginBottom: 18 }}>
          <b>{uploadResult.created_count}</b> candidates added.
          {uploadResult.skipped_duplicates?.length > 0 && (
            <span className="muted small"> &nbsp;{uploadResult.skipped_duplicates.length} duplicate phone numbers skipped.</span>
          )}
          {uploadResult.row_errors?.length > 0 && (
            <div className="small" style={{ color: "var(--red)", marginTop: 6 }}>
              {uploadResult.row_errors.length} row(s) had errors — e.g. {uploadResult.row_errors[0]}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="flex justify-between items-center">
            <h3>Send QR Invites</h3>
            <span className="small muted">{sentCount}/{preList.length} sent</span>
          </div>
          <div className="progress-track mt-16">
            <div className="progress-fill" style={{ width: `${(sentCount / total) * 100}%` }} />
          </div>
          <div className="mt-16">
            <ChannelSelect channels={channels} setChannels={setChannels} />
          </div>
          <button className="btn btn-primary mt-16" onClick={startSend} disabled={sending || preList.length === 0}>
            {sending ? "Sending…" : "Generate QR & Send to Pending"}
          </button>
          {progress && (
            <div className="small muted mt-8">
              Queued {progress.counts.queued} · Sending {progress.counts.sending} ·
              &nbsp;Sent {progress.counts.sent} · Failed {progress.counts.failed}
            </div>
          )}
        </div>

        <div className="card">
          <h3>On-spot Registration Standee</h3>
          <p className="small muted mt-8">
            Print this QR at the venue entrance. Walk-in candidates not on your pre-list scan it,
            fill their details, and instantly receive a downloadable QR + Candidate ID.
          </p>
          {standee && (
            <div className="flex items-center gap-16 mt-16">
              <QrViewer qrImage={standee.qr_image} url={standee.url} label="On-spot Registration Standee" />
              <div className="small muted" style={{ wordBreak: "break-all" }}>{standee.url}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card mt-24">
        <h3 style={{ marginBottom: 14 }}>All Candidates ({candidates.length})</h3>
        {loading ? (
          <LoadingBlock label="Loading candidates…" />
        ) : candidates.length === 0 ? (
          <div className="empty-state">No candidates yet — upload your list to get started.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Candidate ID</th><th>Name</th><th>Phone</th><th>Source</th>
                <th>QR Status</th><th>Checked In</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} onClick={() => setSelectedCandidate(c)} style={{ cursor: "pointer" }}>
                  <td><b>{c.unique_id}</b></td>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td style={{ textTransform: "capitalize" }}>{c.source.replace("_", "-")}</td>
                  <td><span className={`badge badge-${c.qr_send_status}`}>{c.qr_send_status}</span></td>
                  <td>{c.checked_in ? <span className="badge badge-sent">Yes</span> : <span className="badge badge-pending">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CandidateDetailModal candidate={selectedCandidate} onClose={() => setSelectedCandidate(null)} />
    </div>
  );
}
