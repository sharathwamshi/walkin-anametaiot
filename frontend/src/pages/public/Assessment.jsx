import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/client";
import { LoadingBlock } from "../../components/Spinner.jsx";

export default function Assessment() {
  const { levelId } = useParams();
  const [levelInfo, setLevelInfo] = useState(null);
  const [uniqueId, setUniqueId] = useState("");
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [remainingSec, setRemainingSec] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [starting, setStarting] = useState(false);

  // Exam duration and the end-of-exam instant, both anchored to the server's
  // clock rather than recomputed from possibly-stale state on every render.
  const durationMsRef = useRef(null);
  const endTimeMsRef = useRef(null);
  // clockOffsetMs = (server's clock) - (this device's clock) at the moment the
  // exam started. Added to Date.now() everywhere below so a candidate's wrong
  // device clock — or a timezone/DST quirk — can never desync the countdown.
  const clockOffsetMsRef = useRef(0);

  const pollRef = useRef();
  const heartbeatRef = useRef();
  const timerRef = useRef();

  useEffect(() => {
    api.get(`/tests/public/levels/${levelId}`).then((r) => setLevelInfo(r.data)).catch(() => {});
  }, [levelId]);

  // Tab-switch / minimize detection — only while an active, unflagged session exists.
  useEffect(() => {
    function reportViolation() {
      if (session && session.status === "in_progress" && document.hidden) {
        api.post(`/tests/public/sessions/${session.id}/violation`, {}, {
          headers: { "X-Session-Token": session.session_token },
        }).then((r) => setSession({ ...r.data, session_token: session.session_token }));
      }
    }
    document.addEventListener("visibilitychange", reportViolation);
    window.addEventListener("blur", reportViolation);
    return () => {
      document.removeEventListener("visibilitychange", reportViolation);
      window.removeEventListener("blur", reportViolation);
    };
  }, [session]);

  // Poll session status so a flagged candidate knows the moment admin resets them.
  useEffect(() => {
    if (!session || submitted) return;
    pollRef.current = setInterval(async () => {
      const r = await api.get(`/tests/public/sessions/${session.id}/status`, {
        params: { session_token: session.session_token },
      });
      setSession((prev) => ({ ...r.data, session_token: prev.session_token }));
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [session?.id, submitted]);

  // Heartbeat
  useEffect(() => {
    if (!session || submitted) return;
    heartbeatRef.current = setInterval(() => {
      api.post(`/tests/public/sessions/${session.id}/heartbeat`, { session_token: session.session_token });
    }, 15000);
    return () => clearInterval(heartbeatRef.current);
  }, [session?.id, submitted]);

  // Countdown timer — anchored to server time via clockOffsetMsRef, immune to
  // the candidate's device clock or timezone being wrong.
  useEffect(() => {
    if (!session || submitted || endTimeMsRef.current == null) return;
    timerRef.current = setInterval(() => {
      const correctedNow = Date.now() + clockOffsetMsRef.current;
      const secs = Math.max(0, Math.round((endTimeMsRef.current - correctedNow) / 1000));
      setRemainingSec(secs);
      if (secs <= 0) {
        clearInterval(timerRef.current);
        submit();
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [session?.id, submitted]);

  async function startAssessment(e) {
    e.preventDefault();
    setError("");
    setStarting(true);
    try {
      const res = await api.post(`/tests/public/levels/${levelId}/start`, { unique_id: uniqueId.trim() });
      const data = res.data;

      // Anchor all timing to the server's clock, computed once at start.
      const serverNowMs = new Date(data.server_now).getTime();
      clockOffsetMsRef.current = serverNowMs - Date.now();
      durationMsRef.current = data.duration_minutes * 60000;
      endTimeMsRef.current = new Date(data.session.start_time).getTime() + durationMsRef.current;

      setCandidateName(data.candidate_name);
      setQuestions(data.questions);
      setAnswers(data.existing_answers || {});
      setSession({ ...data.session, session_token: data.session_token });

      // Re-opening an already-finished attempt (e.g. page refresh after
      // submitting, or scanning the entry QR again) should show the
      // "already completed" screen immediately, not a stale/expired exam.
      if (data.session.status === "completed") {
        setAlreadyCompleted(true);
        setSubmitted({ status: "completed" });
      }
    } catch (e) {
      setError(e.response?.data?.error || "Could not start assessment.");
    } finally {
      setStarting(false);
    }
  }

  async function selectOption(questionId, option) {
    if (session.status !== "in_progress") return;
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
    await api.post(`/tests/public/sessions/${session.id}/answer`, {
      question_id: questionId, selected_option: option, session_token: session.session_token,
    });
  }

  async function submit() {
    if (submitted) return; // guard against double-submit (timer race + manual click)
    const res = await api.post(`/tests/public/sessions/${session.id}/submit`, { session_token: session.session_token });
    setSubmitted(res.data);
    clearInterval(pollRef.current);
    clearInterval(heartbeatRef.current);
    clearInterval(timerRef.current);
  }

  if (submitted) {
    return (
      <div className="public-shell">
        <div className="card public-card" style={{ textAlign: "center" }}>
          <h2>{alreadyCompleted ? "Assessment already submitted" : "Assessment submitted ✅"}</h2>
          <p className="muted mt-8">
            {alreadyCompleted
              ? `Hi ${candidateName || "there"}, our records show you've already completed this assessment.`
              : `Thanks, ${candidateName}. Your responses have been recorded.`}
          </p>
          <p className="muted small mt-16">You'll be notified via WhatsApp/Email about the next steps.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="public-shell">
        <div className="card public-card">
          {!levelInfo ? (
            <LoadingBlock label="Loading assessment…" />
          ) : (
            <>
              <h3>{levelInfo.name}</h3>
              <p className="small muted mt-8">
                {levelInfo.test_type} · {levelInfo.duration_minutes} minutes · {levelInfo.question_count} questions
              </p>

              <div className="card mt-16" style={{ background: "var(--orange-light)", border: "none", textAlign: "left" }}>
                <b style={{ color: "var(--orange)" }}>⚠ Important — read before you start</b>
                <ul className="small mt-8" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Once your test begins, do not close this tab, switch to another tab, minimize the browser, or navigate away.</li>
                  <li>Doing any of the above will <b>immediately stop your test</b> and lock your session — you cannot resume it yourself.</li>
                  <li>If this happens, contact your coordinator right away — only they can reset your session so you can continue.</li>
                </ul>
              </div>

              <form onSubmit={startAssessment} className="flex mt-16" style={{ flexDirection: "column", gap: 12 }}>
                <input required placeholder="Enter your Candidate ID (e.g. AFPL7F3A9B)" value={uniqueId}
                  onChange={(e) => setUniqueId(e.target.value)} />
                {error && <div className="small" style={{ color: "var(--red)" }}>{error}</div>}
                <button className="btn btn-primary" disabled={starting} style={{ justifyContent: "center" }}>
                  {starting ? "Starting…" : "Start Assessment"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  if (session.status === "flagged") {
    return (
      <div className="public-shell">
        <div className="public-card">
          <div className="violation-banner">
            ⚠ Your assessment has been paused because you left this tab.<br />
            Please stay on this page — the invigilator has been notified and will resume your test shortly.
          </div>
        </div>
      </div>
    );
  }

  const mins = remainingSec != null ? Math.floor(remainingSec / 60) : "--";
  const secs = remainingSec != null ? String(remainingSec % 60).padStart(2, "0") : "--";
  const lowTime = remainingSec != null && remainingSec <= 60;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div className="topbar" style={{ position: "sticky", top: 0 }}>
        <b>{candidateName}</b>
        <div className={`badge ${lowTime ? "badge-flagged" : "badge-active"}`} style={{ fontSize: 14 }}>
          ⏱ {mins}:{secs}
        </div>
      </div>
      <div className="content" style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="card mt-16" style={{ marginBottom: 16, background: "var(--orange-light)", border: "none" }}>
          <b>Do not close or switch this tab</b> — doing so will pause your test until an invigilator resumes it.
        </div>
        {questions.map((q, i) => (
          <div className="card mt-16" key={q.id}>
            <b>{i + 1}. {q.question_text}</b>
            <div className="flex mt-16" style={{ flexDirection: "column", gap: 10 }}>
              {["A", "B", "C", "D"].map((opt) => {
                const text = q[`option_${opt.toLowerCase()}`];
                if (!text) return null;
                return (
                  <label key={opt} className="flex items-center gap-8"
                    style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer",
                      background: answers[q.id] === opt ? "var(--orange-light)" : "#fff" }}>
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === opt}
                      onChange={() => selectOption(q.id, opt)} />
                    <span>{opt}. {text}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <button className="btn btn-primary mt-24" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>
          Submit Assessment
        </button>
      </div>
    </div>
  );
}
