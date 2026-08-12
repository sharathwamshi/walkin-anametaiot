import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { LoadingBlock } from "../components/Spinner.jsx";

const BLANK_QUESTION = {
  question_text: "", option_a: "", option_b: "", option_c: "", option_d: "",
  correct_option: "A", marks: 1, negative_marks: 0,
};

export default function ManageQuestions() {
  const { levelId } = useParams();
  const [level, setLevel] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState(BLANK_QUESTION);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const qRes = await api.get(`/tests/levels/${levelId}/questions`);
      setQuestions(qRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // Pull just this level's own summary (status/name/etc.) via the live/basic
    // level info endpoint used elsewhere for admin views.
    api.get(`/tests/levels/${levelId}/live`).then((r) => setLevel(r.data.level)).catch(() => {});
  }, [levelId]);

  const locked = level?.status === "completed";

  function startEdit(q) {
    setError("");
    setEditingId(q.id);
    setEditDraft({ ...q });
  }

  async function saveEdit() {
    setError("");
    setSaving(true);
    try {
      await api.put(`/tests/questions/${editingId}`, editDraft);
      setEditingId(null);
      setEditDraft(null);
      loadAll();
    } catch (e) {
      setError(e.response?.data?.error || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id) {
    setSaving(true);
    try {
      await api.delete(`/tests/questions/${id}`);
      setDeletingId(null);
      loadAll();
    } catch (e) {
      setError(e.response?.data?.error || "Could not delete question.");
    } finally {
      setSaving(false);
    }
  }

  async function submitNewQuestion(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post(`/tests/levels/${levelId}/questions`, newQuestion);
      setNewQuestion(BLANK_QUESTION);
      setAdding(false);
      loadAll();
    } catch (e) {
      setError(e.response?.data?.error || "Could not add question.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Manage Questions{level ? ` — Round ${level.level_number}: ${level.name}` : ""}</h2>
          <p>View, edit, delete, or add questions to this round's set.</p>
        </div>
        <Link to="/tests" className="btn btn-outline">← Back to Levels</Link>
      </div>

      {locked && (
        <div className="callout" style={{ background: "var(--orange-light)", borderLeft: "4px solid var(--orange)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
          <b style={{ color: "var(--orange)" }}>This round is completed</b>
          <div className="small muted mt-8">
            Results have already been finalized for this round, so its question set is locked and can no
            longer be edited, added to, or deleted from.
          </div>
        </div>
      )}

      {error && (
        <div className="small mt-8" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>
      )}

      <div className="flex" style={{ flexDirection: "column", gap: 14 }}>
        {loading ? (
          <LoadingBlock label="Loading questions…" />
        ) : (
          <>
        {questions.map((q, i) => (
          <div className="card" key={q.id}>
            {editingId === q.id ? (
              <div className="flex" style={{ flexDirection: "column", gap: 10 }}>
                <label className="small muted">Question text</label>
                <textarea rows={2} value={editDraft.question_text}
                  onChange={(e) => setEditDraft({ ...editDraft, question_text: e.target.value })} />
                <div className="grid grid-2">
                  {["A", "B", "C", "D"].map((opt) => (
                    <div key={opt}>
                      <label className="small muted">Option {opt}</label>
                      <input value={editDraft[`option_${opt.toLowerCase()}`] || ""}
                        onChange={(e) => setEditDraft({ ...editDraft, [`option_${opt.toLowerCase()}`]: e.target.value })}
                        style={{ width: "100%" }} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-3">
                  <div>
                    <label className="small muted">Correct option</label>
                    <select value={editDraft.correct_option}
                      onChange={(e) => setEditDraft({ ...editDraft, correct_option: e.target.value })} style={{ width: "100%" }}>
                      <option value="A">A</option><option value="B">B</option>
                      <option value="C">C</option><option value="D">D</option>
                    </select>
                  </div>
                  <div>
                    <label className="small muted">Marks</label>
                    <input type="number" step="0.5" value={editDraft.marks}
                      onChange={(e) => setEditDraft({ ...editDraft, marks: Number(e.target.value) })} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label className="small muted">Negative marks</label>
                    <input type="number" step="0.5" value={editDraft.negative_marks}
                      onChange={(e) => setEditDraft({ ...editDraft, negative_marks: Number(e.target.value) })} style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="flex gap-8 mt-8">
                  <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => { setEditingId(null); setEditDraft(null); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : deletingId === q.id ? (
              <div>
                <p className="small">Delete this question permanently? This can't be undone.</p>
                <div className="flex gap-8 mt-8">
                  <button className="btn btn-outline btn-sm" onClick={() => setDeletingId(null)}>Cancel</button>
                  <button className="btn btn-sm" style={{ background: "var(--red)", color: "#fff" }}
                    disabled={saving} onClick={() => confirmDelete(q.id)}>
                    {saving ? "Deleting…" : "Yes, delete"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start">
                  <div style={{ flex: 1 }}>
                    <b>{i + 1}. {q.question_text}</b>
                    <div className="grid grid-2 mt-8" style={{ gap: 6 }}>
                      {["A", "B", "C", "D"].map((opt) => (
                        <div key={opt} className="small" style={{
                          padding: "4px 10px", borderRadius: 6,
                          background: q.correct_option === opt ? "var(--green-light)" : "var(--bg)",
                          color: q.correct_option === opt ? "var(--green)" : "var(--text)",
                          fontWeight: q.correct_option === opt ? 700 : 400,
                        }}>
                          {opt}. {q[`option_${opt.toLowerCase()}`] || <span className="muted">—</span>}
                          {q.correct_option === opt && " ✓"}
                        </div>
                      ))}
                    </div>
                    <div className="small muted mt-8">Marks: {q.marks} · Negative: {q.negative_marks}</div>
                  </div>
                  {!locked && (
                    <div className="flex gap-8" style={{ flexShrink: 0, marginLeft: 12 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => startEdit(q)}>Edit</button>
                      <button className="btn btn-sm" style={{ background: "var(--red-light)", color: "var(--red)" }}
                        onClick={() => setDeletingId(q.id)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {questions.length === 0 && (
          <div className="empty-state">No questions yet — upload an Excel file from Test Levels, or add one below.</div>
        )}
          </>
        )}
      </div>

      {!locked && (
        <div className="card mt-24">
          {!adding ? (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add a Question</button>
          ) : (
            <form onSubmit={submitNewQuestion} className="flex" style={{ flexDirection: "column", gap: 10 }}>
              <h3>Add a question</h3>
              <textarea required rows={2} placeholder="Question text" value={newQuestion.question_text}
                onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })} />
              <div className="grid grid-2">
                {["A", "B", "C", "D"].map((opt) => (
                  <input key={opt} placeholder={`Option ${opt}`} value={newQuestion[`option_${opt.toLowerCase()}`]}
                    onChange={(e) => setNewQuestion({ ...newQuestion, [`option_${opt.toLowerCase()}`]: e.target.value })} />
                ))}
              </div>
              <div className="grid grid-3">
                <div>
                  <label className="small muted">Correct option</label>
                  <select value={newQuestion.correct_option}
                    onChange={(e) => setNewQuestion({ ...newQuestion, correct_option: e.target.value })} style={{ width: "100%" }}>
                    <option value="A">A</option><option value="B">B</option>
                    <option value="C">C</option><option value="D">D</option>
                  </select>
                </div>
                <div>
                  <label className="small muted">Marks</label>
                  <input type="number" step="0.5" value={newQuestion.marks}
                    onChange={(e) => setNewQuestion({ ...newQuestion, marks: Number(e.target.value) })} style={{ width: "100%" }} />
                </div>
                <div>
                  <label className="small muted">Negative marks</label>
                  <input type="number" step="0.5" value={newQuestion.negative_marks}
                    onChange={(e) => setNewQuestion({ ...newQuestion, negative_marks: Number(e.target.value) })} style={{ width: "100%" }} />
                </div>
              </div>
              <div className="flex gap-8">
                <button className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Adding…" : "Add Question"}</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAdding(false); setNewQuestion(BLANK_QUESTION); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
