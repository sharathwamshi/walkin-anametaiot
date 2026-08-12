import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useEvent } from "../context/EventContext.jsx";

const NAV = [
  { section: "Drive" },
  { to: "/", label: "Dashboard", icon: "◧" },
  { to: "/events", label: "Events", icon: "🗂" },
  { to: "/candidates", label: "Candidates & QR", icon: "🪪" },
  { to: "/frontdesk", label: "Front Desk", icon: "🛎" },
  { section: "Assessment" },
  { to: "/tests", label: "Test Levels", icon: "📝" },
  { to: "/results", label: "Results & Selection", icon: "🏆" },
  { section: "Admin" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export default function Layout({ children }) {
  const navigate = useNavigate();
  const { events, activeEvent, setActiveEventId } = useEvent();
  const [collapsed, setCollapsed] = useState(localStorage.getItem("awd_sidebar_collapsed") === "true");

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("awd_sidebar_collapsed", String(next));
  }

  function logout() {
    localStorage.removeItem("awd_token");
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className={"sidebar" + (collapsed ? " collapsed" : "")}>
        <div className="brand">
          <div className="brand-mark">N</div>
          <div className="brand-text">
            <b>AnametaIoT</b>
            <span>HRMS · WALK-IN DRIVE</span>
          </div>
          {!collapsed && (
            <button className="collapse-toggle" onClick={toggleCollapsed} title="Collapse menu">⟨⟨</button>
          )}
        </div>
        {collapsed && (
          <button className="collapse-toggle" style={{ margin: "0 auto 14px" }} onClick={toggleCollapsed} title="Expand menu">⟩⟩</button>
        )}

        {NAV.map((item, i) =>
          item.section ? (
            <div className="nav-section" key={i}>{item.section}</div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              title={collapsed ? item.label : ""}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              <span>{item.icon}</span> <span>{item.label}</span>
            </NavLink>
          )
        )}

        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <button className="nav-link" style={{ width: "100%" }} onClick={logout} title={collapsed ? "Sign out" : ""}>
            <span>⎋</span> <span>Sign out</span>
          </button>
          <div className="small sidebar-footer-text" style={{ color: "rgba(255,255,255,.35)", padding: "10px 14px 0" }}>
            Powered by +veGroww
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div>
            <select
              value={activeEvent?.id || ""}
              onChange={(e) => setActiveEventId(Number(e.target.value))}
              style={{ minWidth: 260 }}
            >
              {events.length === 0 && <option>No drives created yet</option>}
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-12">
            <span className="badge badge-active">{activeEvent?.status || "—"}</span>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
