import React from "react";

export const DEFAULT_FORM_CONFIG = {
  phone: { required: true, validate: true },
  email: { enabled: true, required: false, validate: true },
  college: { enabled: true, required: false },
  branch: { enabled: true, required: false },
  cgpa: { enabled: true, required: false },
  passout_year: { enabled: true, required: false },
  resume_link: { enabled: false, required: false },
};

const OPTIONAL_FIELDS = [
  { key: "college", label: "College" },
  { key: "branch", label: "Branch" },
  { key: "cgpa", label: "CGPA" },
  { key: "passout_year", label: "Passout Year" },
  { key: "resume_link", label: "Resume Link" },
];

/**
 * Lets the event creator decide what the candidate self-registration form
 * looks like: which optional fields appear, which of those are mandatory,
 * and whether phone/email get format validation. Name is always shown and
 * required, so it isn't configurable here.
 */
export default function RegistrationFormBuilder({ config, setConfig }) {
  function update(field, patch) {
    setConfig({ ...config, [field]: { ...config[field], ...patch } });
  }

  return (
    <div>
      <table style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={{ width: "34%" }}>Field</th>
            <th style={{ width: "22%", textAlign: "center" }}>Show on form</th>
            <th style={{ width: "22%", textAlign: "center" }}>Required</th>
            <th style={{ width: "22%", textAlign: "center" }}>Validate format</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Name</b></td>
            <td style={{ textAlign: "center" }} className="small muted">Always shown</td>
            <td style={{ textAlign: "center" }} className="small muted">Always required</td>
            <td style={{ textAlign: "center" }} className="small muted">—</td>
          </tr>
          <tr>
            <td><b>Phone</b></td>
            <td style={{ textAlign: "center" }} className="small muted">Always shown</td>
            <td style={{ textAlign: "center" }}>
              <input type="checkbox" checked={config.phone?.required ?? true}
                onChange={(e) => update("phone", { required: e.target.checked })} />
            </td>
            <td style={{ textAlign: "center" }}>
              <input type="checkbox" checked={config.phone?.validate ?? true}
                onChange={(e) => update("phone", { validate: e.target.checked })}
                title="Requires a valid 7-15 digit phone number" />
            </td>
          </tr>
          <tr>
            <td><b>Email</b></td>
            <td style={{ textAlign: "center" }}>
              <input type="checkbox" checked={config.email?.enabled ?? true}
                onChange={(e) => update("email", { enabled: e.target.checked })} />
            </td>
            <td style={{ textAlign: "center" }}>
              <input type="checkbox" disabled={!(config.email?.enabled ?? true)}
                checked={config.email?.required ?? false}
                onChange={(e) => update("email", { required: e.target.checked })} />
            </td>
            <td style={{ textAlign: "center" }}>
              <input type="checkbox" disabled={!(config.email?.enabled ?? true)}
                checked={config.email?.validate ?? true}
                onChange={(e) => update("email", { validate: e.target.checked })}
                title="Requires a valid email address format" />
            </td>
          </tr>
          {OPTIONAL_FIELDS.map(({ key, label }) => (
            <tr key={key}>
              <td>{label}</td>
              <td style={{ textAlign: "center" }}>
                <input type="checkbox" checked={config[key]?.enabled ?? true}
                  onChange={(e) => update(key, { enabled: e.target.checked })} />
              </td>
              <td style={{ textAlign: "center" }}>
                <input type="checkbox" disabled={!(config[key]?.enabled ?? true)}
                  checked={config[key]?.required ?? false}
                  onChange={(e) => update(key, { required: e.target.checked })} />
              </td>
              <td style={{ textAlign: "center" }} className="small muted">—</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted mt-8">
        This controls the on-spot self-registration form candidates fill out by scanning the
        standee QR — not the bulk Excel upload, which always uses its fixed template.
      </p>
    </div>
  );
}
