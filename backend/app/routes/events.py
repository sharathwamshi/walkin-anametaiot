from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from datetime import datetime
from app.extensions import db
from app.models.models import (
    Event, Candidate, TestLevel, CandidateLevelResult,
    CandidateTestSession, CandidateAnswer, Question, MessageLog,
)
from app.utils.qr_utils import generate_link_qr
from app.utils.settings_utils import effective_public_base_url

events_bp = Blueprint("events", __name__)


@events_bp.get("")
@jwt_required()
def list_events():
    events = Event.query.order_by(Event.created_at.desc()).all()
    return jsonify([e.to_dict() for e in events])


@events_bp.post("")
@jwt_required()
def create_event():
    data = request.get_json(force=True) or {}
    if not data.get("name"):
        return jsonify({"error": "Event name is required"}), 400

    drive_date = None
    if data.get("drive_date"):
        drive_date = datetime.strptime(data["drive_date"], "%Y-%m-%d").date()

    event = Event(
        name=data["name"], description=data.get("description"),
        venue=data.get("venue"), drive_date=drive_date, status="active",
    )
    if data.get("registration_form_config"):
        event.set_registration_form_config(data["registration_form_config"])
    db.session.add(event)
    db.session.commit()

    # Generate the standee QR (walk-in self-registration link) up front.
    standee_url = f"{effective_public_base_url()}/walkin-register/{event.standee_token}"
    generate_link_qr(standee_url, f"standee_{event.id}.png", label="R")

    return jsonify(event.to_dict()), 201


@events_bp.get("/<int:event_id>")
@jwt_required()
def get_event(event_id):
    event = Event.query.get_or_404(event_id)
    return jsonify(event.to_dict())


@events_bp.put("/<int:event_id>")
@jwt_required()
def update_event(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json(force=True) or {}
    for field in ("name", "description", "venue", "status"):
        if field in data:
            setattr(event, field, data[field])
    if "drive_date" in data and data["drive_date"]:
        event.drive_date = datetime.strptime(data["drive_date"], "%Y-%m-%d").date()
    if "registration_form_config" in data:
        event.set_registration_form_config(data["registration_form_config"])
    db.session.commit()
    return jsonify(event.to_dict())


@events_bp.delete("/<int:event_id>")
@jwt_required()
def delete_event(event_id):
    """Permanently deletes a drive and everything scoped to it — candidates,
    test levels, questions, sessions, answers, results, and message logs.
    This cannot be undone, so it requires an explicit confirm flag (the
    frontend's own confirmation dialog is the first line of defense, this is
    the second — a stray DELETE call without confirmation is rejected)."""
    event = Event.query.get_or_404(event_id)
    data = request.get_json(silent=True) or {}

    candidate_count = event.candidates.count()
    level_count = event.test_levels.count()

    if not data.get("confirm"):
        return jsonify({
            "error": "Confirmation required to delete this event",
            "candidate_count": candidate_count,
            "level_count": level_count,
        }), 400

    candidate_ids = [c.id for c in event.candidates]
    level_ids = [lv.id for lv in event.test_levels]

    session_ids = []
    if level_ids:
        session_ids = [
            s.id for s in CandidateTestSession.query
            .filter(CandidateTestSession.test_level_id.in_(level_ids)).all()
        ]

    if session_ids:
        CandidateAnswer.query.filter(CandidateAnswer.session_id.in_(session_ids)) \
            .delete(synchronize_session=False)
        CandidateTestSession.query.filter(CandidateTestSession.id.in_(session_ids)) \
            .delete(synchronize_session=False)

    if level_ids:
        CandidateLevelResult.query.filter(CandidateLevelResult.test_level_id.in_(level_ids)) \
            .delete(synchronize_session=False)
        Question.query.filter(Question.test_level_id.in_(level_ids)) \
            .delete(synchronize_session=False)
        TestLevel.query.filter(TestLevel.id.in_(level_ids)) \
            .delete(synchronize_session=False)

    if candidate_ids:
        MessageLog.query.filter(MessageLog.candidate_id.in_(candidate_ids)) \
            .delete(synchronize_session=False)
        Candidate.query.filter(Candidate.id.in_(candidate_ids)) \
            .delete(synchronize_session=False)

    db.session.delete(event)
    db.session.commit()

    return jsonify({
        "deleted": True, "event_id": event_id,
        "candidates_removed": candidate_count, "levels_removed": level_count,
    })


@events_bp.get("/<int:event_id>/stats")
@jwt_required()
def event_stats(event_id):
    """Aggregated funnel numbers for the event-wise dashboard: registration
    source split, invite/check-in progress, and per-round pass-through."""
    event = Event.query.get_or_404(event_id)
    candidates = Candidate.query.filter_by(event_id=event_id).all()

    pre_list = [c for c in candidates if c.source == "pre_list"]
    walkins = [c for c in candidates if c.source == "walkin"]
    checked_in = [c for c in candidates if c.checked_in]
    qr_sent = [c for c in pre_list if c.qr_send_status == "sent"]
    qr_failed = [c for c in pre_list if c.qr_send_status == "failed"]
    welcome_sent = [c for c in candidates if c.welcome_sent]

    levels = TestLevel.query.filter_by(event_id=event_id).order_by(TestLevel.level_number).all()
    level_stats = []
    for lv in levels:
        total_sessions = lv.sessions.count()
        completed = lv.sessions.filter_by(status="completed").count()
        flagged = lv.sessions.filter_by(is_flagged=True).count()
        passed = CandidateLevelResult.query.filter_by(test_level_id=lv.id, passed=True).count()
        level_stats.append({
            "id": lv.id, "level_number": lv.level_number, "name": lv.name,
            "status": lv.status, "total_sessions": total_sessions,
            "completed": completed, "flagged": flagged, "passed": passed,
        })

    return jsonify({
        "event": event.to_dict(),
        "total_candidates": len(candidates),
        "pre_list_count": len(pre_list),
        "walkin_count": len(walkins),
        "checked_in_count": len(checked_in),
        "qr_sent_count": len(qr_sent),
        "qr_failed_count": len(qr_failed),
        "welcome_sent_count": len(welcome_sent),
        "levels": level_stats,
    })


@events_bp.get("/<int:event_id>/standee-qr")
@jwt_required()
def standee_qr(event_id):
    event = Event.query.get_or_404(event_id)
    standee_url = f"{effective_public_base_url()}/walkin-register/{event.standee_token}"
    return jsonify({
        "url": standee_url,
        "qr_image": f"/static/qrcodes/standee_{event.id}.png",
    })
