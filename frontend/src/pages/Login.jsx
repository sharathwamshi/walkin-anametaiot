import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { username, password });
      localStorage.setItem("awd_token", res.data.access_token);
      navigate("/");
    } catch (e) {
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="centered-auth">
      <div className="card" style={{ width: 380 }}>
        <div className="flex items-center gap-12 mt-8" style={{ marginBottom: 18 }}>
          <div className="brand-mark" style={{ background: "radial-gradient(circle at 30% 30%, #3E7BE0, #0F2A5C)" }}>N</div>
          <div>
            <h2 style={{ fontSize: 18 }}>AnametaIoT HRMS</h2>
            <div className="muted small">Walk-in Drive Console</div>
          </div>
        </div>

        <form onSubmit={submit} className="flex" style={{ flexDirection: "column", gap: 14 }}>
          <div>
            <label className="small muted">Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", marginTop: 4 }} placeholder="admin" required />
          </div>
          <div>
            <label className="small muted">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", marginTop: 4 }} placeholder="••••••••" required />
          </div>
          {error && <div className="small" style={{ color: "var(--red)" }}>{error}</div>}
          <button className="btn btn-primary" disabled={loading} style={{ justifyContent: "center" }}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="small muted mt-16" style={{ textAlign: "center" }}>Powered by +veGroww</div>
      </div>
    </div>
  );
}
