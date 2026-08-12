import React, { useEffect, useState } from "react";
import api from "../api/client";
import { LoadingBlock } from "../components/Spinner.jsx";

const DEFAULTS = {
  whatsapp_enabled: false,
  twilio_account_sid: "", twilio_auth_token: "", twilio_whatsapp_from: "",
  smtp_host: "", smtp_port: 587, smtp_user: "", smtp_password: "", smtp_from_name: "",
  public_base_url: "", dry_run: "auto", max_tab_violations: 1,
};

export default function Settings() {
  const [form, setForm] = useState(DEFAULTS);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const res = await api.get("/settings");
      setForm(res.data);
      const cs = await api.get("/settings/channels-status");
      setStatus(cs.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  function set(field, value) {
    setForm({ ...form, [field]: value });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await api.put("/settings", form);
      setSaved(true);
      load({ silent: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {loading ? (
        <LoadingBlock label="Loading settings…" />
      ) : (
      <>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Configure WhatsApp (Twilio) and Email (SMTP) once here — every send action across the portal respects these.</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Settings"}
        </button>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="settings-section">
            <div className="flex justify-between items-center">
              <div>
                <h3>WhatsApp via Twilio</h3>
                <p className="small muted mt-8">
                  Optional on every step — never required. Turn on once your Twilio WhatsApp
                  sender is approved; until then, or if it's off, WhatsApp checkboxes across
                  the portal will show greyed out and Email is used instead.
                </p>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={!!form.whatsapp_enabled}
                  onChange={(e) => set("whatsapp_enabled", e.target.checked)} />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {status && (
              <div className="mt-16">
                <span className={`badge ${status.whatsapp.available ? "badge-sent" : "badge-pending"}`}>
                  {status.whatsapp.available ? "Active — WhatsApp will send live" : status.whatsapp.enabled ? "Enabled but not fully configured" : "Turned off"}
                </span>
              </div>
            )}

            <div className="field-row mt-16">
              <label>Twilio Account SID</label>
              <input value={form.twilio_account_sid || ""} onChange={(e) => set("twilio_account_sid", e.target.value)} placeholder="ACxxxxxxxxxxxxxxxx" />
            </div>
            <div className="field-row">
              <label>Twilio Auth Token</label>
              <input type="password" value={form.twilio_auth_token || ""} onChange={(e) => set("twilio_auth_token", e.target.value)} placeholder="Leave unchanged to keep existing" />
            </div>
            <div className="field-row">
              <label>WhatsApp Sender Number</label>
              <input value={form.twilio_whatsapp_from || ""} onChange={(e) => set("twilio_whatsapp_from", e.target.value)} placeholder="whatsapp:+14155238886" />
            </div>
          </div>

          <div>
            <h3>Email via SMTP</h3>
            <p className="small muted mt-8">Used for every invite, welcome, test, and result message alongside — or instead of — WhatsApp.</p>
            <div className="field-row mt-16">
              <label>SMTP Host</label>
              <input value={form.smtp_host || ""} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div className="grid grid-2">
              <div className="field-row">
                <label>SMTP Port</label>
                <input type="number" value={form.smtp_port || 587} onChange={(e) => set("smtp_port", Number(e.target.value))} />
              </div>
              <div className="field-row">
                <label>From Name</label>
                <input value={form.smtp_from_name || ""} onChange={(e) => set("smtp_from_name", e.target.value)} placeholder="Talent Acquisition Team" />
              </div>
            </div>
            <div className="field-row">
              <label>SMTP Username</label>
              <input value={form.smtp_user || ""} onChange={(e) => set("smtp_user", e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="field-row">
              <label>SMTP Password</label>
              <input type="password" value={form.smtp_password || ""} onChange={(e) => set("smtp_password", e.target.value)} placeholder="Leave unchanged to keep existing" />
            </div>
          </div>
        </div>

        <div className="card">
          <h3>General</h3>
          <div className="field-row mt-16">
            <label>Public Base URL</label>
            <input value={form.public_base_url || ""} onChange={(e) => set("public_base_url", e.target.value)} placeholder="https://drive.yourcompany.com" />
            <span className="small muted">Embedded into every QR code and message link — must be reachable by candidates.</span>
          </div>
          <div className="field-row">
            <label>Message Sending Mode</label>
            <select value={form.dry_run} onChange={(e) => set("dry_run", e.target.value)}>
              <option value="auto">Auto — simulate only when credentials are missing/incomplete</option>
              <option value="true">Always simulate (demo mode, nothing sent live)</option>
              <option value="false">Always send live</option>
            </select>
          </div>
          <div className="field-row">
            <label>Max tab-switch violations before flagging a candidate</label>
            <input type="number" min={1} value={form.max_tab_violations || 1}
              onChange={(e) => set("max_tab_violations", Number(e.target.value))} style={{ maxWidth: 120 }} />
          </div>

          <div className="mt-24" style={{ background: "var(--bg)", borderRadius: 10, padding: 14 }}>
            <div className="small muted">
              <b>Email status:</b> {status?.email.configured ? "Configured ✓" : "Not fully configured — add SMTP details above"}
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
