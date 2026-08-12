from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.settings_utils import get_settings, whatsapp_available, email_available

settings_bp = Blueprint("settings", __name__)


@settings_bp.get("")
@jwt_required()
def read_settings():
    return jsonify(get_settings().to_dict())


@settings_bp.put("")
@jwt_required()
def update_settings():
    settings = get_settings()
    data = request.get_json(force=True) or {}

    simple_fields = [
        "whatsapp_enabled", "twilio_account_sid", "twilio_whatsapp_from",
        "smtp_host", "smtp_port", "smtp_user", "smtp_from_name",
        "public_base_url", "dry_run", "max_tab_violations",
    ]
    for field in simple_fields:
        if field in data:
            setattr(settings, field, data[field])

    # Secrets: only overwrite if the admin actually typed a new value (the GET
    # response masks these with bullets, so an unchanged masked value must not
    # get written back over the real secret).
    if data.get("twilio_auth_token") and not set(data["twilio_auth_token"]) <= {"•"}:
        settings.twilio_auth_token = data["twilio_auth_token"]
    if data.get("smtp_password") and not set(data["smtp_password"]) <= {"•"}:
        settings.smtp_password = data["smtp_password"]

    db.session.commit()
    return jsonify(settings.to_dict())


@settings_bp.get("/channels-status")
@jwt_required()
def channels_status():
    """Used by every 'send' UI in the app to grey out WhatsApp when it isn't
    usable, without ever making WhatsApp mandatory."""
    s = get_settings()
    return jsonify({
        "whatsapp": {
            "enabled": bool(s.whatsapp_enabled),
            "configured": s.to_dict()["twilio_configured"],
            "available": whatsapp_available(),
        },
        "email": {
            "configured": email_available(),
            "available": email_available(),
        },
    })
