from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import Candidate, normalize_unique_id, unique_id_match_filter
from app.utils.messaging import send_whatsapp, send_email
from app.utils.message_templates import welcome_whatsapp, welcome_email_html
from app.utils.settings_utils import sanitize_channels

frontdesk_bp = Blueprint("frontdesk", __name__)


@frontdesk_bp.post("/scan")
@jwt_required()
def scan():
    """Front desk scans a candidate's QR (payload = unique_id). Looks the
    candidate up so the operator can see who it is before confirming attendance.
    Does NOT mark present by itself — that happens in /mark-present, once the
    admin has reviewed the scanned batch, per the requested flow."""
    data = request.get_json(force=True) or {}
    unique_id = normalize_unique_id(data.get("unique_id"))
    if not unique_id:
        return jsonify({"error": "unique_id is required"}), 400

    candidate = Candidate.query.filter(unique_id_match_filter(data.get("unique_id"))).first()
    if not candidate:
        return jsonify({"error": "No candidate found for this QR / ID", "unique_id": unique_id}), 404

    return jsonify({"candidate": candidate.to_dict(), "already_checked_in": candidate.checked_in})


@frontdesk_bp.post("/mark-present")
@jwt_required()
def mark_present():
    data = request.get_json(force=True) or {}
    candidate_ids = data.get("candidate_ids", [])
    if not candidate_ids:
        return jsonify({"error": "candidate_ids is required"}), 400

    updated = []
    for cid in candidate_ids:
        c = Candidate.query.get(cid)
        if not c:
            continue
        c.checked_in = True
        c.checked_in_at = datetime.utcnow()
        updated.append(c)
    db.session.commit()

    return jsonify({"updated_count": len(updated), "candidates": [c.to_dict() for c in updated]})


@frontdesk_bp.post("/send-welcome")
@jwt_required()
def send_welcome():
    data = request.get_json(force=True) or {}
    candidate_ids = data.get("candidate_ids", [])
    channels = sanitize_channels(data.get("channels", ["whatsapp", "email"]))
    if not channels:
        return jsonify({"error": "No usable channel selected. Enable WhatsApp/email in Settings, or pick a different channel."}), 400

    results = []
    for cid in candidate_ids:
        c = Candidate.query.get(cid)
        if not c:
            continue
        event = c.event
        sent_any = False
        if "whatsapp" in channels:
            ok, _ = send_whatsapp(c, welcome_whatsapp(c, event), "welcome")
            sent_any = sent_any or ok
        if "email" in channels:
            ok, _ = send_email(c, f"Welcome to {event.name}!", welcome_email_html(c, event), "welcome")
            sent_any = sent_any or ok
        c.welcome_sent = sent_any
        results.append({"candidate_id": c.id, "sent": sent_any})
    db.session.commit()

    return jsonify({"results": results})


@frontdesk_bp.get("/checked-in")
@jwt_required()
def checked_in_list():
    event_id = request.args.get("event_id")
    q = Candidate.query.filter_by(checked_in=True)
    if event_id:
        q = q.filter_by(event_id=event_id)
    candidates = q.order_by(Candidate.checked_in_at.desc()).all()
    return jsonify([c.to_dict() for c in candidates])
