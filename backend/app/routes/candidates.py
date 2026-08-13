from flask import Blueprint, request, jsonify, send_file, current_app
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import Candidate, Event, normalize_unique_id, unique_id_match_filter
from app.utils.excel_utils import candidate_template_bytes, parse_candidate_excel, build_export_xlsx, safe_filename
from app.utils.qr_utils import generate_candidate_qr
from app.utils.form_validation import validate_registration_data

candidates_bp = Blueprint("candidates", __name__)


@candidates_bp.get("/template")
@jwt_required()
def download_template():
    buf = candidate_template_bytes()
    return send_file(buf, as_attachment=True, download_name="candidate_upload_template.xlsx",
                      mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@candidates_bp.post("/upload")
@jwt_required()
def upload_candidates():
    event_id = request.form.get("event_id") or (request.json or {}).get("event_id") if request.is_json else request.form.get("event_id")
    if "file" not in request.files:
        return jsonify({"error": "Excel file is required (field name 'file')"}), 400
    if not event_id:
        return jsonify({"error": "event_id is required"}), 400

    event = Event.query.get_or_404(int(event_id))
    file = request.files["file"]
    parsed, errors = parse_candidate_excel(file.stream)

    created = []
    skipped_duplicates = []
    for row in parsed:
        exists = Candidate.query.filter_by(event_id=event.id, phone=row["phone"]).first()
        if exists:
            skipped_duplicates.append(row["phone"])
            continue
        c = Candidate(event_id=event.id, source="pre_list", **row)
        db.session.add(c)
        created.append(c)
    db.session.commit()

    return jsonify({
        "created_count": len(created),
        "skipped_duplicates": skipped_duplicates,
        "row_errors": errors,
        "candidates": [c.to_dict() for c in created],
    }), 201


@candidates_bp.get("")
@jwt_required()
def list_candidates():
    event_id = request.args.get("event_id")
    q = Candidate.query
    if event_id:
        q = q.filter_by(event_id=event_id)
    checked_in = request.args.get("checked_in")
    if checked_in is not None:
        q = q.filter_by(checked_in=(checked_in == "true"))
    candidates = q.order_by(Candidate.registered_at.desc()).all()
    return jsonify([c.to_dict() for c in candidates])


@candidates_bp.get("/export")
@jwt_required()
def export_candidates():
    event_id = request.args.get("event_id")
    if not event_id:
        return jsonify({"error": "event_id is required"}), 400

    event = Event.query.get_or_404(event_id)
    candidates = Candidate.query.filter_by(event_id=event_id).order_by(Candidate.registered_at.desc()).all()

    headers = [
        "Candidate ID", "Name", "Email", "Phone", "College", "Branch", "CGPA",
        "Passout Year", "Resume Link", "Source", "QR Status", "Checked In",
        "Checked In At", "Welcome Sent", "Registered At",
    ]
    rows = [[
        c.unique_id, c.name, c.email, c.phone, c.college, c.branch, c.cgpa,
        c.passout_year, c.resume_link, c.source, c.qr_send_status,
        "Yes" if c.checked_in else "No",
        c.checked_in_at.strftime("%Y-%m-%d %H:%M") if c.checked_in_at else "",
        "Yes" if c.welcome_sent else "No",
        c.registered_at.strftime("%Y-%m-%d %H:%M") if c.registered_at else "",
    ] for c in candidates]

    buf = build_export_xlsx(headers, rows, sheet_title="Candidates")
    return send_file(buf, as_attachment=True, download_name=f"candidates_{safe_filename(event.name)}.xlsx",
                      mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@candidates_bp.get("/<int:candidate_id>")
@jwt_required()
def get_candidate(candidate_id):
    c = Candidate.query.get_or_404(candidate_id)
    return jsonify(c.to_dict())


# ---------------------------------------------------------------------------
# PUBLIC endpoints — used by the walk-in standee QR flow (no auth required).
# ---------------------------------------------------------------------------

@candidates_bp.get("/public/event-by-token/<token>")
def public_event_by_token(token):
    event = Event.query.filter_by(standee_token=token).first_or_404()
    return jsonify({
        "id": event.id, "name": event.name, "venue": event.venue,
        "registration_form_config": event.get_registration_form_config(),
    })


@candidates_bp.post("/public/walkin-register/<token>")
def public_walkin_register(token):
    event = Event.query.filter_by(standee_token=token).first_or_404()
    data = request.get_json(force=True) or {}

    is_valid, error = validate_registration_data(event, data)
    if not is_valid:
        return jsonify({"error": error}), 400

    already_registered = False
    existing = Candidate.query.filter_by(event_id=event.id, phone=data["phone"]).first()
    if existing:
        already_registered = True
        candidate = existing
        # Backfill any field that's currently blank with whatever they just
        # entered — e.g. they were bulk-uploaded from Excel with only
        # name/email/phone, and are now filling in college/branch/etc.
        # themselves. Never overwrites a value that's already on file.
        fillable_fields = ["email", "college", "branch", "cgpa", "passout_year", "resume_link"]
        changed = False
        for field in fillable_fields:
            new_val = data.get(field)
            new_val = new_val.strip() if isinstance(new_val, str) else new_val
            if new_val and not getattr(candidate, field):
                setattr(candidate, field, new_val)
                changed = True
        if changed:
            db.session.commit()
    else:
        candidate = Candidate(
            event_id=event.id, source="walkin",
            name=data["name"], phone=data["phone"], email=data.get("email"),
            college=data.get("college"), branch=data.get("branch"),
            cgpa=data.get("cgpa"), passout_year=data.get("passout_year"),
            resume_link=data.get("resume_link"),
            checked_in=True,
        )
        from datetime import datetime
        candidate.checked_in_at = datetime.utcnow()
        db.session.add(candidate)
        db.session.commit()

    # Generate their downloadable QR immediately (spot registration flow) —
    # covers both a brand-new walk-in and a pre-listed candidate whose QR
    # hasn't been sent yet.
    if not candidate.qr_path:
        candidate.qr_path = generate_candidate_qr(candidate)
        candidate.qr_send_status = "sent"
        db.session.commit()

    message = (
        "You're already registered for this drive — here's your saved Candidate ID and QR code."
        if already_registered else
        "Please save your Candidate ID and download your QR code."
    )

    return jsonify({
        "candidate": candidate.to_dict(),
        "already_registered": already_registered,
        "qr_image_url": f"/static/{candidate.qr_path}",
        "message": message,
    }), (200 if already_registered else 201)


@candidates_bp.get("/public/qr-image/<unique_id>")
def public_qr_image(unique_id):
    candidate = Candidate.query.filter(unique_id_match_filter(unique_id)).first_or_404()
    if not candidate.qr_path:
        candidate.qr_path = generate_candidate_qr(candidate)
        db.session.commit()
    return jsonify({"qr_image_url": f"/static/{candidate.qr_path}", "unique_id": candidate.unique_id})
