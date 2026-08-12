import threading
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import Candidate, Event
from app.utils.qr_utils import generate_candidate_qr
from app.utils.messaging import send_whatsapp, send_email
from app.utils.message_templates import qr_invite_whatsapp, qr_invite_email_html
from app.utils.settings_utils import sanitize_channels

qr_bp = Blueprint("qr", __name__)


def _process_candidate(app, candidate_id, channels):
    """Runs in a background thread: generate QR, send over selected channels,
    update candidate.qr_send_status so the front-end progress bar can poll it."""
    with app.app_context():
        candidate = Candidate.query.get(candidate_id)
        if not candidate:
            return
        candidate.qr_send_status = "sending"
        db.session.commit()

        try:
            if not candidate.qr_path:
                candidate.qr_path = generate_candidate_qr(candidate)
                db.session.commit()

            event = candidate.event
            ok_any, last_error = False, None

            if "whatsapp" in channels:
                ok, info = send_whatsapp(candidate, qr_invite_whatsapp(candidate, event),
                                          "qr_invite", media_path=candidate.qr_path)
                ok_any = ok_any or ok
                if not ok:
                    last_error = info

            if "email" in channels:
                import os
                attach = os.path.join(app.config["QR_FOLDER"], os.path.basename(candidate.qr_path))
                ok, info = send_email(candidate, f"Your Candidate ID for {event.name}",
                                       qr_invite_email_html(candidate, event), "qr_invite",
                                       attachment_path=attach)
                ok_any = ok_any or ok
                if not ok:
                    last_error = info

            candidate.qr_send_status = "sent" if ok_any else "failed"
            candidate.qr_send_error = last_error
            candidate.qr_sent_at = datetime.utcnow()
            db.session.commit()
        except Exception as e:
            candidate.qr_send_status = "failed"
            candidate.qr_send_error = str(e)
            db.session.commit()


@qr_bp.post("/generate-send/<int:event_id>")
@jwt_required()
def generate_send(event_id):
    Event.query.get_or_404(event_id)
    data = request.get_json(force=True) or {}
    channels = sanitize_channels(data.get("channels", ["whatsapp", "email"]))
    if not channels:
        return jsonify({"error": "No usable channel selected. Enable WhatsApp/email in Settings, or pick a different channel."}), 400
    candidate_ids = data.get("candidate_ids")  # optional subset; default = all pre_list not yet sent

    q = Candidate.query.filter_by(event_id=event_id, source="pre_list")
    if candidate_ids:
        q = q.filter(Candidate.id.in_(candidate_ids))
    else:
        q = q.filter(Candidate.qr_send_status.in_(["pending", "failed"]))
    targets = q.all()

    app = current_app._get_current_object()
    for c in targets:
        c.qr_send_status = "queued"
    db.session.commit()

    for c in targets:
        t = threading.Thread(target=_process_candidate, args=(app, c.id, channels), daemon=True)
        t.start()

    return jsonify({"queued_count": len(targets), "candidate_ids": [c.id for c in targets]})


@qr_bp.get("/progress/<int:event_id>")
@jwt_required()
def progress(event_id):
    candidates = Candidate.query.filter_by(event_id=event_id, source="pre_list").all()
    counts = {"pending": 0, "queued": 0, "sending": 0, "sent": 0, "failed": 0}
    for c in candidates:
        counts[c.qr_send_status] = counts.get(c.qr_send_status, 0) + 1
    return jsonify({
        "total": len(candidates),
        "counts": counts,
        "candidates": [c.to_dict() for c in candidates],
    })
