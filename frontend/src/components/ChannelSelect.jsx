import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChannelsStatus } from "../api/client";

/**
 * Renders WhatsApp + Email checkboxes for a "send" action. WhatsApp is never
 * forced on — if Twilio isn't enabled/configured in Settings, the checkbox is
 * shown greyed out and unselectable with a link to Settings, and the parent's
 * `channels` state is kept in sync so a disabled channel never gets submitted.
 */
export default function ChannelSelect({ channels, setChannels }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getChannelsStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (status && !status.whatsapp.available && channels.whatsapp) {
      setChannels((prev) => ({ ...prev, whatsapp: false }));
    }
  }, [status]);

  const waAvailable = status ? status.whatsapp.available : true; // assume available until we know otherwise

  return (
    <div className="flex gap-16" style={{ flexWrap: "wrap" }}>
      <label className="flex items-center gap-8 small" title={waAvailable ? "" : "Enable & configure WhatsApp (Twilio) in Settings"}
        style={{ opacity: waAvailable ? 1 : 0.5, cursor: waAvailable ? "pointer" : "not-allowed" }}>
        <input type="checkbox" checked={waAvailable && channels.whatsapp} disabled={!waAvailable}
          onChange={(e) => setChannels({ ...channels, whatsapp: e.target.checked })} />
        WhatsApp
        {!waAvailable && status && (
          <Link to="/settings" className="small" style={{ color: "var(--navy-light)", marginLeft: 2 }}>
            (enable in Settings)
          </Link>
        )}
      </label>
      <label className="flex items-center gap-8 small">
        <input type="checkbox" checked={channels.email}
          onChange={(e) => setChannels({ ...channels, email: e.target.checked })} />
        Email
      </label>
    </div>
  );
}
