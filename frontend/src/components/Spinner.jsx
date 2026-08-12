import React from "react";

/** Full-block spinner — use in place of a blank/empty page while data loads. */
export function LoadingBlock({ label = "Loading…" }) {
  return (
    <div className="loading-block">
      <div className="spinner" />
      <div>{label}</div>
    </div>
  );
}

/** Small inline spinner — use next to a button or short line of text. */
export function LoadingInline({ label = "Loading…" }) {
  return (
    <span className="loading-inline">
      <span className="spinner spinner-sm" />
      {label}
    </span>
  );
}
