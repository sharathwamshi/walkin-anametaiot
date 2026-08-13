import threading
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, current_app
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import (
    Event, TestLevel, Question, Candidate, CandidateTestSession,
    CandidateAnswer, CandidateLevelResult, to_iso_z, normalize_unique_id, unique_id_match_filter,
)
from app.utils.excel_utils import question_template_bytes, parse_question_excel, build_export_xlsx, safe_filename
from app.utils.messaging import send_whatsapp, send_email
from app.utils.message_templates import (
    test_invite_whatsapp, test_invite_email_html,
    next_level_whatsapp, next_level_email_html,
    final_selection_whatsapp, final_selection_email_html,
)
from app.utils.qr_utils import generate_link_qr, generate_candidate_qr
from app.utils.settings_utils import sanitize_channels, get_settings, effective_public_base_url

tests_bp = Blueprint("tests", __name__)


def _require_session_token(session, request):
    """Signed per-session token check: every candidate-facing session call after
    /start must present the exact token issued at start time, so a session id
    alone (guessable/sequential) can't be used to hijack or peek at someone
    else's attempt."""
    token = request.headers.get("X-Session-Token") or (request.get_json(silent=True) or {}).get("session_token")
    return bool(token) and token == session.session_token


# ---------------------------------------------------------------------------
# ADMIN — level & question setup
# ---------------------------------------------------------------------------

@tests_bp.get("/question-template")
@jwt_required()
def question_template():
    buf = question_template_bytes()
    return send_file(buf, as_attachment=True, download_name="question_upload_template.xlsx",
                      mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@tests_bp.get("/levels")
@jwt_required()
def list_levels():
    event_id = request.args.get("event_id")
    q = TestLevel.query
    if event_id:
        q = q.filter_by(event_id=event_id)
    levels = q.order_by(TestLevel.level_number).all()
    return jsonify([lv.to_dict(include_counts=True) for lv in levels])


@tests_bp.post("/levels")
@jwt_required()
def create_level():
    data = request.get_json(force=True) or {}
    for field in ("event_id", "level_number", "name", "test_type"):
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    Event.query.get_or_404(data["event_id"])
    level = TestLevel(
        event_id=data["event_id"], level_number=data["level_number"], name=data["name"],
        test_type=data["test_type"], duration_minutes=data.get("duration_minutes", 30),
    )
    db.session.add(level)
    db.session.commit()
    return jsonify(level.to_dict()), 201


@tests_bp.post("/levels/<int:level_id>/questions/upload")
@jwt_required()
def upload_questions(level_id):
    level = TestLevel.query.get_or_404(level_id)
    if level.status == "completed":
        return jsonify({"error": "This round is completed — its question set can no longer be changed."}), 400
    if "file" not in request.files:
        return jsonify({"error": "Excel file is required (field name 'file')"}), 400

    parsed, errors = parse_question_excel(request.files["file"].stream)
    # Append after whatever's already there instead of resetting order_index to
    # 0 — otherwise a second upload onto the same level collides with the
    # first batch's ordering instead of extending it.
    start_order = (db.session.query(db.func.max(Question.order_index))
                    .filter_by(test_level_id=level.id).scalar() or -1) + 1
    created = []
    for i, row in enumerate(parsed):
        q = Question(test_level_id=level.id, order_index=start_order + i, **row)
        db.session.add(q)
        created.append(q)
    db.session.commit()

    return jsonify({
        "created_count": len(created), "row_errors": errors,
        "questions": [q.to_dict() for q in created],
    }), 201


@tests_bp.get("/levels/<int:level_id>/questions")
@jwt_required()
def list_questions(level_id):
    level = TestLevel.query.get_or_404(level_id)
    return jsonify([q.to_dict(reveal_answer=True) for q in level.questions.order_by(Question.order_index)])


def _validate_question_payload(data, partial=False):
    """Shared field validation for add/edit. Returns (cleaned_fields, error)."""
    cleaned = {}
    if not partial or "question_text" in data:
        if not (data.get("question_text") or "").strip():
            return None, "question_text is required"
        cleaned["question_text"] = data["question_text"].strip()

    for opt in ("option_a", "option_b", "option_c", "option_d"):
        if opt in data:
            cleaned[opt] = data[opt]

    if not partial or "correct_option" in data:
        correct = str(data.get("correct_option") or "").strip().upper()[:1]
        if correct not in ("A", "B", "C", "D"):
            return None, "correct_option must be A, B, C, or D"
        cleaned["correct_option"] = correct

    if "marks" in data:
        try:
            cleaned["marks"] = float(data["marks"])
        except (TypeError, ValueError):
            return None, "marks must be a number"
    if "negative_marks" in data:
        try:
            cleaned["negative_marks"] = float(data["negative_marks"])
        except (TypeError, ValueError):
            return None, "negative_marks must be a number"

    return cleaned, None


@tests_bp.post("/levels/<int:level_id>/questions")
@jwt_required()
def add_question(level_id):
    """Adds a single question to an existing set — used by the question
    management screen to grow a set after the initial Excel upload."""
    level = TestLevel.query.get_or_404(level_id)
    if level.status == "completed":
        return jsonify({"error": "This round is completed — its question set can no longer be changed."}), 400

    data = request.get_json(force=True) or {}
    cleaned, error = _validate_question_payload(data)
    if error:
        return jsonify({"error": error}), 400

    next_order = (db.session.query(db.func.max(Question.order_index))
                  .filter_by(test_level_id=level.id).scalar() or -1) + 1
    q = Question(
        test_level_id=level.id, order_index=next_order,
        marks=cleaned.get("marks", 1.0), negative_marks=cleaned.get("negative_marks", 0.0),
        **{k: v for k, v in cleaned.items() if k not in ("marks", "negative_marks")},
    )
    db.session.add(q)
    db.session.commit()
    return jsonify(q.to_dict(reveal_answer=True)), 201


@tests_bp.put("/questions/<int:question_id>")
@jwt_required()
def update_question(question_id):
    """Edits one question in place — text, options, correct answer, or marks."""
    q = Question.query.get_or_404(question_id)
    if q.test_level.status == "completed":
        return jsonify({"error": "This round is completed — its question set can no longer be changed."}), 400

    data = request.get_json(force=True) or {}
    cleaned, error = _validate_question_payload(data, partial=True)
    if error:
        return jsonify({"error": error}), 400

    for field, value in cleaned.items():
        setattr(q, field, value)
    db.session.commit()
    return jsonify(q.to_dict(reveal_answer=True))


@tests_bp.delete("/questions/<int:question_id>")
@jwt_required()
def delete_question(question_id):
    """Removes a question from the set. Any answers already recorded against
    it (from candidates mid-attempt) are removed along with it, since the
    question no longer exists to be scored against — already-completed
    sessions keep whatever score they were given at submit time, this only
    affects the question set going forward."""
    q = Question.query.get_or_404(question_id)
    level = q.test_level
    if level.status == "completed":
        return jsonify({"error": "This round is completed — its question set can no longer be changed."}), 400

    CandidateAnswer.query.filter_by(question_id=q.id).delete(synchronize_session=False)
    db.session.delete(q)
    db.session.commit()
    return jsonify({"deleted": True, "question_id": question_id})


# ---------------------------------------------------------------------------
# ADMIN — start a level (broadcast invite + QR/ID), live proctoring, reset
# ---------------------------------------------------------------------------

def _entry_url(level):
    return f"{effective_public_base_url()}/assessment/{level.id}"


def _broadcast_invite(app, level_id, candidate_ids, channels):
    with app.app_context():
        level = TestLevel.query.get(level_id)
        entry_url = _entry_url(level)
        for cid in candidate_ids:
            c = Candidate.query.get(cid)
            if not c:
                continue
            if "whatsapp" in channels:
                send_whatsapp(c, test_invite_whatsapp(c, level, entry_url), "test_invite")
            if "email" in channels:
                send_email(c, f"Round {level.level_number} — {level.name} is live",
                           test_invite_email_html(c, level, entry_url), "test_invite")


@tests_bp.post("/levels/<int:level_id>/start")
@jwt_required()
def start_level(level_id):
    level = TestLevel.query.get_or_404(level_id)
    if level.questions.count() == 0:
        return jsonify({"error": "Upload questions before starting this level"}), 400

    data = request.get_json(force=True) or {}
    channels = sanitize_channels(data.get("channels", ["whatsapp", "email"]))

    # Target audience: everyone registered (pre-list) or checked-in (walk-in) for the event,
    # i.e. the combined pre-list + on-spot registration pool described in the flow.
    candidates = Candidate.query.filter(
        Candidate.event_id == level.event_id,
        db.or_(Candidate.source == "walkin", Candidate.checked_in == True),  # noqa: E712
    ).all()

    level.status = "active"
    level.started_at = datetime.utcnow()
    db.session.commit()

    app = current_app._get_current_object()
    if channels:
        t = threading.Thread(target=_broadcast_invite, args=(app, level.id, [c.id for c in candidates], channels),
                              daemon=True)
        t.start()

    # Generate a display QR for the entry link too — this is what's shown/printed
    # at the venue for candidates without WhatsApp/email (or who prefer scanning).
    entry_url = _entry_url(level)
    generate_link_qr(entry_url, f"test_entry_{level.id}.png", label="T")

    return jsonify({
        "level": level.to_dict(),
        "invited_count": len(candidates),
        "channels_used": channels,
        "entry_url": entry_url,
        "entry_qr_image": f"/static/qrcodes/test_entry_{level.id}.png",
    })


@tests_bp.get("/levels/<int:level_id>/entry-qr")
@jwt_required()
def entry_qr(level_id):
    level = TestLevel.query.get_or_404(level_id)
    entry_url = _entry_url(level)
    filename = f"test_entry_{level.id}.png"
    generate_link_qr(entry_url, filename, label="T")
    return jsonify({"url": entry_url, "qr_image": f"/static/qrcodes/{filename}"})


@tests_bp.get("/levels/<int:level_id>/live")
@jwt_required()
def live_monitor(level_id):
    """Polled every few seconds by the admin's live monitoring page."""
    level = TestLevel.query.get_or_404(level_id)
    sessions = level.sessions.all()
    return jsonify({
        "level": level.to_dict(),
        "sessions": [s.to_dict() for s in sessions],
        "flagged_count": sum(1 for s in sessions if s.is_flagged),
        "in_progress_count": sum(1 for s in sessions if s.status == "in_progress"),
        "completed_count": sum(1 for s in sessions if s.status == "completed"),
    })


@tests_bp.get("/levels/<int:level_id>/live/export")
@jwt_required()
def export_live_monitor(level_id):
    level = TestLevel.query.get_or_404(level_id)
    sessions = level.sessions.order_by(CandidateTestSession.id).all()

    headers = [
        "Candidate ID", "Name", "Status", "Tab Violations", "Score",
        "Interviewed By", "Admin Reset Count", "Last Heartbeat",
    ]
    rows = [[
        s.candidate.unique_id if s.candidate else "",
        s.candidate.name if s.candidate else "",
        "flagged" if s.is_flagged else s.status,
        s.tab_violation_count, s.score, s.interviewed_by or "",
        s.admin_reset_count,
        s.last_heartbeat.strftime("%Y-%m-%d %H:%M") if s.last_heartbeat else "",
    ] for s in sessions]

    buf = build_export_xlsx(headers, rows, sheet_title="Live Monitor")
    filename = f"live_monitor_round{level.level_number}_{safe_filename(level.name)}.xlsx"
    return send_file(buf, as_attachment=True, download_name=filename,
                      mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@tests_bp.post("/sessions/<int:session_id>/reset")
@jwt_required()
def reset_session(session_id):
    """Resets a tab-violation flag so the candidate can resume — this is the
    violation flow specifically, and stays exactly as it was. For every other
    'my session is stuck' scenario, see set_session_status() below, which is
    a separate, more general admin override."""
    session = CandidateTestSession.query.get_or_404(session_id)
    session.is_flagged = False
    session.status = "in_progress"
    session.admin_reset_count = (session.admin_reset_count or 0) + 1
    db.session.commit()
    return jsonify(session.to_dict())


ADMIN_OVERRIDABLE_STATUSES = ["not_started", "in_progress", "flagged", "completed", "disqualified", "interviewed"]
INTERVIEWER_OPTIONS = ["int-1", "int-2", "int-3", "int-4"]


def _score_session(session):
    """Computes and stores a session's score from whatever answers exist.
    Shared by the candidate's own submit and the admin's manual override, so
    force-completing a stuck session still produces a real score instead of
    leaving it null."""
    score = 0.0
    for answer in session.answers:
        q = Question.query.get(answer.question_id)
        if q and answer.selected_option:
            score += q.marks if answer.is_correct else -abs(q.negative_marks)
    session.score = score
    return score


@tests_bp.put("/sessions/<int:session_id>/status")
@jwt_required()
def set_session_status(session_id):
    """Manual admin override for a candidate's session status — separate from
    the tab-violation flag/reset flow above, which is untouched. This exists
    for the general 'candidate is stuck' case: e.g. they closed the browser
    mid-test without submitting, their heartbeat stalled, or any other state
    the admin needs to move past without waiting on the normal flag/reset
    cycle. Setting status to 'completed' also computes a real score from
    whatever answers were saved, so the round's Results page reflects it."""
    session = CandidateTestSession.query.get_or_404(session_id)
    data = request.get_json(force=True) or {}
    new_status = data.get("status")
    if new_status not in ADMIN_OVERRIDABLE_STATUSES:
        return jsonify({"error": f"status must be one of {ADMIN_OVERRIDABLE_STATUSES}"}), 400

    session.status = new_status
    if new_status != "flagged":
        session.is_flagged = False
    if new_status == "completed":
        _score_session(session)
        if not session.end_time:
            session.end_time = datetime.utcnow()
    db.session.commit()
    return jsonify(session.to_dict())


@tests_bp.put("/sessions/<int:session_id>/interviewer")
@jwt_required()
def set_session_interviewer(session_id):
    """Assigns (or clears) which interviewer handled this candidate — a
    separate concern from the session status above, so the two can be set
    independently from the Live Monitor."""
    session = CandidateTestSession.query.get_or_404(session_id)
    data = request.get_json(force=True) or {}
    interviewer = data.get("interviewed_by")

    if interviewer == "" or interviewer is None:
        session.interviewed_by = None
    elif interviewer in INTERVIEWER_OPTIONS:
        session.interviewed_by = interviewer
    else:
        return jsonify({"error": f"interviewed_by must be one of {INTERVIEWER_OPTIONS} or empty to clear"}), 400

    db.session.commit()
    return jsonify(session.to_dict())


# ---------------------------------------------------------------------------
# ADMIN — cutoff, selection, next-level invite, final results
# ---------------------------------------------------------------------------

@tests_bp.post("/levels/<int:level_id>/apply-cutoff")
@jwt_required()
def apply_cutoff(level_id):
    level = TestLevel.query.get_or_404(level_id)
    data = request.get_json(force=True) or {}
    cutoff = data.get("cutoff_score")
    if cutoff is None:
        return jsonify({"error": "cutoff_score is required"}), 400

    level.cutoff_score = cutoff
    level.status = "completed"
    level.completed_at = datetime.utcnow()

    results = []
    for session in level.sessions.filter(CandidateTestSession.score.isnot(None)):
        existing = CandidateLevelResult.query.filter_by(
            candidate_id=session.candidate_id, test_level_id=level.id).first()
        passed = (session.score or 0) >= cutoff
        if existing:
            existing.score = session.score
            existing.passed = passed
        else:
            existing = CandidateLevelResult(
                candidate_id=session.candidate_id, test_level_id=level.id,
                score=session.score, max_score=sum(q.marks for q in level.questions),
                passed=passed,
            )
            db.session.add(existing)
        results.append(existing)
    db.session.commit()

    return jsonify({"level": level.to_dict(), "results": [r.to_dict() for r in results]})


def _notify_selected(app, level_id, candidate_ids, channels, is_final):
    with app.app_context():
        level = TestLevel.query.get(level_id)
        next_level = (TestLevel.query
                      .filter_by(event_id=level.event_id, level_number=level.level_number + 1)
                      .first())
        for cid in candidate_ids:
            c = Candidate.query.get(cid)
            if not c:
                continue
            if is_final or not next_level:
                results_url = f"{effective_public_base_url()}/results/{level.id}"
                if "whatsapp" in channels:
                    send_whatsapp(c, final_selection_whatsapp(c, results_url), "result")
                if "email" in channels:
                    send_email(c, "Congratulations — you've been selected!",
                               final_selection_email_html(c, results_url), "result")
            else:
                if "whatsapp" in channels:
                    send_whatsapp(c, next_level_whatsapp(c, next_level), "next_level")
                if "email" in channels:
                    send_email(c, f"You're through to Round {next_level.level_number}!",
                               next_level_email_html(c, next_level), "next_level")
            result = CandidateLevelResult.query.filter_by(candidate_id=cid, test_level_id=level_id).first()
            if result:
                result.selected_for_next = True
                result.next_level_invite_sent = True
                db.session.commit()


@tests_bp.post("/levels/<int:level_id>/select-and-notify")
@jwt_required()
def select_and_notify(level_id):
    level = TestLevel.query.get_or_404(level_id)
    data = request.get_json(force=True) or {}
    channels = sanitize_channels(data.get("channels", ["whatsapp", "email"]))
    candidate_ids = data.get("candidate_ids")
    is_final = bool(data.get("is_final", False))

    if not candidate_ids:
        candidate_ids = [r.candidate_id for r in level.results.filter_by(passed=True)]

    app = current_app._get_current_object()
    t = threading.Thread(target=_notify_selected, args=(app, level.id, candidate_ids, channels, is_final),
                          daemon=True)
    t.start()

    return jsonify({"notified_count": len(candidate_ids), "candidate_ids": candidate_ids})


@tests_bp.get("/levels/<int:level_id>/results-qr")
@jwt_required()
def results_qr(level_id):
    level = TestLevel.query.get_or_404(level_id)
    url = f"{effective_public_base_url()}/results/{level.id}"
    filename = f"results_{level.id}.png"
    generate_link_qr(url, filename)
    return jsonify({"url": url, "qr_image": f"/static/qrcodes/{filename}"})


def _build_results_output(level):
    """Shared by the JSON results endpoint and the Excel export — see
    results_admin() below for why this reads from completed sessions rather
    than only from CandidateLevelResult rows.

    Filters on "has a computed score" rather than strictly status=="completed":
    a session that moves on to "interviewed" (or any other downstream status)
    after finishing the test already has its score locked in and must keep
    showing up here — filtering on the literal status string would make a
    candidate silently vanish from Results the moment an admin updates their
    status on Live Monitor, which is not the intent of that status field."""
    sessions = (level.sessions.filter(CandidateTestSession.score.isnot(None))
                .order_by(CandidateTestSession.score.desc()).all())
    results_by_candidate = {r.candidate_id: r for r in level.results}
    max_score = sum(q.marks for q in level.questions) or None

    output = []
    for s in sessions:
        r = results_by_candidate.get(s.candidate_id)
        output.append({
            "id": r.id if r else None,
            "candidate_id": s.candidate_id,
            "candidate_name": s.candidate.name if s.candidate else None,
            "candidate_unique_id": s.candidate.unique_id if s.candidate else None,
            "test_level_id": level.id,
            "score": s.score,
            "max_score": max_score,
            "passed": r.passed if r else None,
            "selected_for_next": r.selected_for_next if r else False,
            "next_level_invite_sent": r.next_level_invite_sent if r else False,
        })
    return output


@tests_bp.get("/levels/<int:level_id>/results")
@jwt_required()
def results_admin(level_id):
    """Scores for every completed session in this round, visible as soon as
    candidates finish — not gated behind having already applied a cut-off.
    (CandidateLevelResult rows only exist after apply-cutoff runs, so building
    this view from them was hiding every score until the admin had already
    committed to a cutoff number, which is backwards — you need to see the
    scores to pick a sensible cutoff in the first place.) Once a cutoff has
    been applied, pass/fail and selection status are merged in from those
    rows; before that, "passed" is null to mean "not decided yet", distinct
    from an actual fail."""
    level = TestLevel.query.get_or_404(level_id)
    return jsonify(_build_results_output(level))


@tests_bp.get("/levels/<int:level_id>/results/export")
@jwt_required()
def export_results(level_id):
    level = TestLevel.query.get_or_404(level_id)
    results = _build_results_output(level)

    headers = ["Candidate ID", "Name", "Score", "Max Score", "Passed", "Selected For Next", "Next Level Invite Sent"]
    rows = [[
        r["candidate_unique_id"], r["candidate_name"], r["score"], r["max_score"],
        "Awaiting cut-off" if r["passed"] is None else ("Yes" if r["passed"] else "No"),
        "Yes" if r["selected_for_next"] else "No",
        "Yes" if r["next_level_invite_sent"] else "No",
    ] for r in results]

    buf = build_export_xlsx(headers, rows, sheet_title="Results")
    filename = f"results_round{level.level_number}_{safe_filename(level.name)}.xlsx"
    return send_file(buf, as_attachment=True, download_name=filename,
                      mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ---------------------------------------------------------------------------
# PUBLIC — results page shown when scanning the results QR
# ---------------------------------------------------------------------------

@tests_bp.get("/public/results/<int:level_id>")
def public_results(level_id):
    level = TestLevel.query.get_or_404(level_id)
    selected = level.results.filter_by(selected_for_next=True).all()
    return jsonify({
        "level_name": level.name,
        "level_number": level.level_number,
        "selected": [
            {"name": r.candidate.name, "unique_id": r.candidate.unique_id}
            for r in selected
        ],
    })


# ---------------------------------------------------------------------------
# PUBLIC — candidate-facing assessment flow (entry via QR / ID, proctored)
# ---------------------------------------------------------------------------

@tests_bp.get("/public/levels/<int:level_id>")
def public_level_info(level_id):
    level = TestLevel.query.get_or_404(level_id)
    return jsonify({
        "id": level.id, "name": level.name, "test_type": level.test_type,
        "duration_minutes": level.duration_minutes, "status": level.status,
        "question_count": level.questions.count(),
    })


@tests_bp.post("/public/levels/<int:level_id>/start")
def candidate_start(level_id):
    """Candidate enters their Candidate ID (received via WhatsApp/Email, or the
    ID given at spot registration) to unlock the assessment tab."""
    level = TestLevel.query.get_or_404(level_id)
    data = request.get_json(force=True) or {}
    unique_id = normalize_unique_id(data.get("unique_id"))

    candidate = Candidate.query.filter(
        unique_id_match_filter(data.get("unique_id")), Candidate.event_id == level.event_id
    ).first()
    if not candidate:
        return jsonify({"error": "Candidate ID not recognized for this event"}), 404

    if level.status != "active":
        return jsonify({"error": "This assessment is not currently active"}), 400

    session = CandidateTestSession.query.filter_by(
        candidate_id=candidate.id, test_level_id=level.id).first()
    if not session:
        # Explicitly set status here rather than relying on the column default —
        # the default only applies at INSERT/flush time, so checking
        # session.status on a freshly-constructed, not-yet-flushed object would
        # see None instead of "not_started" and skip the in_progress transition below.
        session = CandidateTestSession(candidate_id=candidate.id, test_level_id=level.id, status="not_started")
        db.session.add(session)

    if session.status in (None, "not_started"):
        session.status = "in_progress"
        session.start_time = datetime.utcnow()
    db.session.commit()

    questions = [q.to_dict() for q in level.questions.order_by(Question.order_index)]

    # Restore any answers already saved for this session (e.g. candidate
    # refreshed the page mid-exam) so the UI can re-highlight their selections
    # instead of silently losing them visually.
    existing_answers = {
        a.question_id: a.selected_option
        for a in session.answers if a.selected_option
    }

    return jsonify({
        "session": session.to_dict(),
        "session_token": session.session_token,
        "candidate_name": candidate.name,
        "duration_minutes": level.duration_minutes,
        "questions": questions,
        "existing_answers": existing_answers,
        # Server's own clock at this exact instant, so the frontend can correct
        # for any drift in the candidate's device clock rather than trusting
        # Date.now() blindly — see Assessment.jsx for how this is used.
        "server_now": to_iso_z(datetime.utcnow()),
    })


@tests_bp.get("/public/sessions/<int:session_id>/status")
def candidate_session_status(session_id):
    session = CandidateTestSession.query.get_or_404(session_id)
    token = request.args.get("session_token")
    if token != session.session_token:
        return jsonify({"error": "Invalid session token"}), 403
    return jsonify(session.to_dict())


@tests_bp.post("/public/sessions/<int:session_id>/heartbeat")
def heartbeat(session_id):
    session = CandidateTestSession.query.get_or_404(session_id)
    if not _require_session_token(session, request):
        return jsonify({"error": "Invalid session token"}), 403
    session.last_heartbeat = datetime.utcnow()
    db.session.commit()
    return jsonify({"ok": True})


@tests_bp.post("/public/sessions/<int:session_id>/violation")
def report_violation(session_id):
    """Called by the candidate's browser when it detects a tab switch /
    visibility change / window blur during an active assessment."""
    session = CandidateTestSession.query.get_or_404(session_id)
    if not _require_session_token(session, request):
        return jsonify({"error": "Invalid session token"}), 403
    if session.status not in ("in_progress", "flagged"):
        return jsonify(session.to_dict())

    session.tab_violation_count = (session.tab_violation_count or 0) + 1
    threshold = get_settings().max_tab_violations or current_app.config["MAX_TAB_VIOLATIONS_BEFORE_FLAG"]
    if session.tab_violation_count >= threshold:
        session.is_flagged = True
        session.status = "flagged"
    db.session.commit()
    return jsonify(session.to_dict())


@tests_bp.post("/public/sessions/<int:session_id>/answer")
def submit_answer(session_id):
    session = CandidateTestSession.query.get_or_404(session_id)
    if not _require_session_token(session, request):
        return jsonify({"error": "Invalid session token"}), 403
    if session.status == "flagged":
        return jsonify({"error": "Session is flagged. Waiting for admin to resume."}), 423
    if session.status != "in_progress":
        return jsonify({"error": "Session is not active"}), 400

    data = request.get_json(force=True) or {}
    question = Question.query.get_or_404(data.get("question_id"))
    selected = (data.get("selected_option") or "").upper()[:1]

    answer = CandidateAnswer.query.filter_by(session_id=session.id, question_id=question.id).first()
    is_correct = selected == question.correct_option
    if not answer:
        answer = CandidateAnswer(session_id=session.id, question_id=question.id)
        db.session.add(answer)
    answer.selected_option = selected
    answer.is_correct = is_correct
    db.session.commit()
    return jsonify({"saved": True})


@tests_bp.post("/public/sessions/<int:session_id>/submit")
def submit_session(session_id):
    session = CandidateTestSession.query.get_or_404(session_id)
    if not _require_session_token(session, request):
        return jsonify({"error": "Invalid session token"}), 403

    _score_session(session)
    session.status = "completed"
    session.end_time = datetime.utcnow()
    db.session.commit()

    return jsonify(session.to_dict())
