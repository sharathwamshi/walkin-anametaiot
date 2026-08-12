import React, { useState } from "react";

/**
 * Wraps a QR thumbnail. Clicking it opens a large modal view of the same QR
 * with the underlying URL shown as text and a one-click "Copy Link" button —
 * used everywhere a QR is shown on the admin dashboard (standee QR, test
 * entry QR, results QR) so it's readable/scannable/shareable at a glance.
 */
export default function QrViewer({ qrImage, url, label, size = 110 }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS context) — fall back silently,
      // the URL is still selectable as plain text in the modal.
    }
  }

  return (
    <>
      <div className="qr-thumb" style={{ width: size, height: size }} onClick={() => setOpen(true)} title="Click to enlarge">
        <img src={qrImage} alt={label || "QR code"} width={size} height={size} />
      </div>

      {open && (
        <div className="qr-modal-overlay" onClick={() => setOpen(false)}>
          <div className="qr-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="qr-modal-close" onClick={() => setOpen(false)}>✕</button>
            {label && <h3 style={{ marginBottom: 14 }}>{label}</h3>}
            <img src={qrImage} alt={label || "QR code"} className="qr-modal-image" />
            <div className="qr-modal-url small muted">{url}</div>
            <div className="flex gap-8 mt-16" style={{ justifyContent: "center" }}>
              <button className="btn btn-primary btn-sm" onClick={copyLink}>
                {copied ? "✓ Copied" : "📋 Copy Link"}
              </button>
              <a href={qrImage} download className="btn btn-outline btn-sm">⬇ Download QR</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
