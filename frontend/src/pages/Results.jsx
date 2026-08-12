import React, { useEffect, useState } from "react";
import api from "../api/client";
import { useEvent } from "../context/EventContext.jsx";
import ChannelSelect from "../components/ChannelSelect.jsx";
import QrViewer from "../components/QrViewer.jsx";
import { LoadingBlock } from "../components/Spinner.jsx";

export default function Results() {
  const { activeEvent } = useEvent();
  const [levels, setLevels] = useState([]);
  const [selectedLevelId, setSelectedLevelId] = useState(null);
  const [results, setResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [cutoff, setCutoff] = useState("");
  const [channels, setChannels] = useState({ whatsapp: false, email: true });
  const [isFinal, setIsFinal] = useState(false);
  const [qr, setQr] = useState(null);

  useEffect(() => {
    if (!activeEvent) return;
    api.get(`/tests/levels?event_id=${activeEvent.id}`).then((r) => {
      setLevels(r.data);
      if (r.data.length > 0) setSelectedLevelId(r.data[r.data.length - 1].id);
      else setLoadingResults(false);
    });
  }, [activeEvent]);

  useEffect(() => {
    if (!selectedLevelId) return;
    loadResults();
    setQr(null);
  }, [selectedLevelId]);

  async function loadResults() {
    setLoadingResults(true);
    try {
      const res = await api.get(`/tests/levels/${selectedLevelId}/results`);
      setResults(res.data);
    } finally {
      setLoadingResults(false);
    }
  }

  async function applyCutoff() {
    if (cutoff === "") return;
    await api.post(`/tests/levels/${selectedLevelId}/apply-cutoff`, { cutoff_score: Number(cutoff) });
    loadResults();
  }

  async function selectAndNotify() {
    const chs = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    if (chs.length === 0) return alert("Select at least one channel (WhatsApp and/or Email)");
    const passedIds = results.filter((r) => r.passed).map((r) => r.candidate_id);
    await api.post(`/tests/levels/${selectedLevelId}/select-and-notify`, {
      candidate_ids: passedIds, channels: chs, is_final: isFinal,
    });
    alert(`Notifications queued for ${passedIds.length} candidates.`);
    loadResults();
  }

  async function loadResultsQr() {
    const res = await api.get(`/tests/levels/${selectedLevelId}/results-qr`);
    setQr(res.data);
  }

  const level = levels.find((l) => l.id === selectedLevelId);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Results & Selection</h2>
          <p>Set a cut-off score, notify shortlisted candidates, and share the results QR at the venue.</p>
        </div>
        <select value={selectedLevelId || ""} onChange={(e) => setSelectedLevelId(Number(e.target.value))}>
          {levels.map((lv) => (
            <option key={lv.id} value={lv.id}>Round {lv.level_number} — {lv.name}</option>
          ))}
        </select>
      </div>

      {level && (
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div className="card">
            <h3>Cut-off & Selection</h3>
            <div className="flex gap-8 mt-16">
              <input type="number" placeholder="Cut-off score" value={cutoff}
                onChange={(e) => setCutoff(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-outline" onClick={applyCutoff}>Apply Cut-off</button>
            </div>

            <div className="mt-16">
              <ChannelSelect channels={channels} setChannels={setChannels} />
            </div>
            <label className="flex items-center gap-8 small mt-16">
              <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
              This is the final round
            </label>

            <button className="btn btn-primary mt-16" onClick={selectAndNotify}>
              🎉 Select & Send {isFinal ? "Final Result" : "Next Round Invite"}
            </button>
          </div>

          <div className="card">
            <h3>Results QR</h3>
            <p className="small muted mt-8">
              Display this at the venue — candidates scan it to see who's selected for this round.
            </p>
            <button className="btn btn-outline mt-16" onClick={loadResultsQr}>Generate / Show QR</button>
            {qr && (
              <div className="flex items-center gap-16 mt-16">
                <QrViewer qrImage={qr.qr_image} url={qr.url} label={`${level?.name || "Round"} Results`} />
                <div className="small muted" style={{ wordBreak: "break-all" }}>{qr.url}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card mt-24">
        <h3 style={{ marginBottom: 14 }}>Scores ({results.length})</h3>
        {loadingResults ? (
          <LoadingBlock label="Loading scores…" />
        ) : results.length === 0 ? (
          <div className="empty-state">No completed sessions yet for this round.</div>
        ) : (
          <table>
            <thead>
              <tr><th>ID</th><th>Name</th><th>Score</th><th>Result</th><th>Notified</th></tr>
            </thead>
            <tbody>
              {results.sort((a, b) => b.score - a.score).map((r) => (
                <tr key={r.candidate_id}>
                  <td>{r.candidate_unique_id}</td>
                  <td>{r.candidate_name}</td>
                  <td>{r.score} / {r.max_score}</td>
                  <td>
                    {r.passed === null || r.passed === undefined ? (
                      <span className="badge badge-pending">Awaiting cut-off</span>
                    ) : r.passed ? (
                      <span className="badge badge-passed">Passed</span>
                    ) : (
                      <span className="badge badge-failed">Not selected</span>
                    )}
                  </td>
                  <td>{r.next_level_invite_sent ? <span className="badge badge-sent">Sent</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
