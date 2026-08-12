import React from "react";

function Row({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value ?? <span className="muted">—</span>}</span>
    </div>
  );
}

export default function CandidateDetailModal({ candidate, onClose }) {
  if (!candidate) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="flex items-center gap-12" style={{ marginBottom: 18 }}>
          <div className="brand-mark" style={{ background: "radial-gradient(circle at 30% 30%, #4C86E8, #12326E)" }}>
            {candidate.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <h3 style={{ fontSize: 18 }}>{candidate.name}</h3>
            <span className="badge badge-active">{candidate.unique_id}</span>
          </div>
        </div>

        <Row label="Phone" value={candidate.phone} />
        <Row label="Email" value={candidate.email} />
        <Row label="College" value={candidate.college} />
        <Row label="Branch" value={candidate.branch} />
        <Row label="CGPA" value={candidate.cgpa} />
        <Row label="Passout Year" value={candidate.passout_year} />
        <Row label="Resume Link" value={candidate.resume_link ? (
          <a href={candidate.resume_link} target="_blank" rel="noreferrer">{candidate.resume_link}</a>
        ) : null} />
        <Row label="Source" value={<span style={{ textTransform: "capitalize" }}>{candidate.source?.replace("_", "-")}</span>} />
        <Row label="QR Status" value={<span className={`badge badge-${candidate.qr_send_status}`}>{candidate.qr_send_status}</span>} />
        <Row label="Checked In" value={candidate.checked_in
          ? <span className="badge badge-sent">Yes{candidate.checked_in_at ? ` — ${new Date(candidate.checked_in_at).toLocaleString()}` : ""}</span>
          : <span className="badge badge-pending">No</span>} />
        <Row label="Welcome Sent" value={candidate.welcome_sent
          ? <span className="badge badge-sent">Yes</span>
          : <span className="badge badge-pending">No</span>} />
        <Row label="Registered" value={candidate.registered_at ? new Date(candidate.registered_at).toLocaleString() : null} />
      </div>
    </div>
  );
}
