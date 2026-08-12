import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import { LoadingBlock } from "../../components/Spinner.jsx";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?\d{7,15}$/;

const OPTIONAL_FIELDS = [
  { key: "college", label: "College" },
  { key: "branch", label: "Branch" },
  { key: "cgpa", label: "CGPA" },
  { key: "passout_year", label: "Passout Year" },
  { key: "resume_link", label: "Resume Link (URL)" },
];

export default function WalkinRegister() {
  const { token } = useParams();
  const [event, setEvent] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", college: "", branch: "", cgpa: "", passout_year: "", resume_link: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/candidates/public/event-by-token/${token}`)
      .then((r) => setEvent(r.data))
      .catch(() => setLoadError("This registration link is invalid or has expired."));
  }, [token]);

  function validate(config) {
    if (!form.name.trim()) return "Name is required";

    const phoneCfg = config.phone || {};
    const phone = form.phone.trim();
    if ((phoneCfg.required ?? true) && !phone) return "Phone number is required";
    if (phone && (phoneCfg.validate ?? true)) {
      const cleaned = phone.replace(/[\s\-()]/g, "");
      if (!PHONE_RE.test(cleaned)) return "Please enter a valid phone number (7-15 digits)";
    }

    const emailCfg = config.email || {};
    const email = form.email.trim();
    if (emailCfg.enabled ?? true) {
      if (emailCfg.required && !email) return "Email is required";
      if (email && (emailCfg.validate ?? true) && !EMAIL_RE.test(email)) return "Please enter a valid email address";
    }

    for (const { key, label } of OPTIONAL_FIELDS) {
      const cfg = config[key] || {};
      if ((cfg.enabled ?? true) && cfg.required && !(form[key] || "").trim()) {
        return `${label} is required`;
      }
    }
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    const config = event?.registration_form_config || {};
    const clientError = validate(config);
    if (clientError) {
      setError(clientError);
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post(`/candidates/public/walkin-register/${token}`, form);
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.error || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="public-shell">
        <div className="card public-card" style={{ textAlign: "center" }}>
          <h3>Link not valid</h3>
          <p className="muted mt-8">{loadError}</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="public-shell">
        <div className="card public-card" style={{ textAlign: "center" }}>
          {result.already_registered && (
            <div className="badge badge-active mt-8" style={{ marginBottom: 14 }}>Already registered</div>
          )}
          <h2>
            {result.already_registered
              ? `Welcome back, ${result.candidate.name}!`
              : `You're registered, ${result.candidate.name}! 🎉`}
          </h2>
          <p className="muted mt-8">
            {result.already_registered
              ? "You were already registered for this drive — here are your saved Candidate ID and QR code. Any new details you just entered have been added to your profile."
              : "Save your Candidate ID and QR — you'll need them at the front desk and for assessments."}
          </p>
          <div className="mt-24">
            <div className="badge badge-active" style={{ fontSize: 16, padding: "8px 18px" }}>{result.candidate.unique_id}</div>
          </div>
          <img src={result.qr_image_url} alt="Your QR" width={200} height={200} className="mt-24"
            style={{ borderRadius: 12, border: "1px solid var(--border)" }} />
          <a href={result.qr_image_url} download className="btn btn-primary mt-24" style={{ width: "100%", justifyContent: "center" }}>
            ⬇ Download QR
          </a>
        </div>
      </div>
    );
  }

  const config = event?.registration_form_config || {};

  return (
    <div className="public-shell">
      <div className="card public-card">
        <div className="flex items-center gap-12" style={{ marginBottom: 16 }}>
          <div className="brand-mark">N</div>
          <div>
            <h3>{event ? event.name : "Walk-in Registration"}</h3>
            <div className="small muted">{event?.venue}</div>
          </div>
        </div>

        {!event ? (
          <LoadingBlock label="Loading registration form…" />
        ) : (
          <>
            {error && <div className="small mt-8" style={{ color: "var(--red)" }}>{error}</div>}
            <form onSubmit={submit} className="flex" style={{ flexDirection: "column", gap: 12 }}>
              <input required placeholder="Full name *" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />

              <input placeholder={`Phone number${(config.phone?.required ?? true) ? " *" : ""}`}
                required={config.phone?.required ?? true}
                value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

              {(config.email?.enabled ?? true) && (
                <input placeholder={`Email${config.email?.required ? " *" : ""}`}
                  required={!!config.email?.required} type="email"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              )}

              {OPTIONAL_FIELDS.map(({ key, label }) => {
                const cfg = config[key] || {};
                if (!(cfg.enabled ?? true)) return null;
                return (
                  <input key={key} placeholder={`${label}${cfg.required ? " *" : ""}`}
                    required={!!cfg.required}
                    value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                );
              })}

              <button className="btn btn-primary" disabled={submitting} style={{ justifyContent: "center" }}>
                {submitting ? "Registering…" : "Register & Get My QR"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
