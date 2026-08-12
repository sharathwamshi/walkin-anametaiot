import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import { LoadingBlock } from "../../components/Spinner.jsx";

export default function PublicResults() {
  const { levelId } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/tests/public/results/${levelId}`).then((r) => setData(r.data));
  }, [levelId]);

  return (
    <div className="public-shell">
      <div className="card public-card">
        {!data ? (
          <LoadingBlock label="Loading results…" />
        ) : (
          <>
            <div className="flex items-center gap-12" style={{ marginBottom: 16 }}>
              <div className="brand-mark">N</div>
              <div>
                <h3>Round {data.level_number} Results</h3>
                <div className="small muted">{data.level_name}</div>
              </div>
            </div>
            {data.selected.length === 0 ? (
              <div className="empty-state">Results haven't been published yet — please check back shortly.</div>
            ) : (
              <table>
                <thead><tr><th>Candidate ID</th><th>Name</th></tr></thead>
                <tbody>
                  {data.selected.map((s) => (
                    <tr key={s.unique_id}><td>{s.unique_id}</td><td>{s.name}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
