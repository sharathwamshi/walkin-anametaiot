from flask import current_app
from app.extensions import db
from app.models.models import Settings


def get_settings():
    """Returns the singleton Settings row, creating it (seeded from the .env-based
    Config defaults) on first access so the admin always has something editable
    in the Settings tab."""
    settings = Settings.query.get(1)
    if not settings:
        cfg = current_app.config
        settings = Settings(
            id=1,
            whatsapp_enabled=bool(cfg.get("TWILIO_ACCOUNT_SID") and cfg.get("TWILIO_AUTH_TOKEN")),
            twilio_account_sid=cfg.get("TWILIO_ACCOUNT_SID", ""),
            twilio_auth_token=cfg.get("TWILIO_AUTH_TOKEN", ""),
            twilio_whatsapp_from=cfg.get("TWILIO_WHATSAPP_FROM", ""),
            smtp_host=cfg.get("SMTP_HOST", ""),
            smtp_port=cfg.get("SMTP_PORT", 587),
            smtp_user=cfg.get("SMTP_USER", ""),
            smtp_password=cfg.get("SMTP_PASSWORD", ""),
            smtp_from_name=cfg.get("SMTP_FROM_NAME", ""),
            public_base_url=cfg.get("PUBLIC_BASE_URL", ""),
            dry_run=cfg.get("DRY_RUN", "auto"),
            max_tab_violations=cfg.get("MAX_TAB_VIOLATIONS_BEFORE_FLAG", 1),
        )
        db.session.add(settings)
        db.session.commit()
    return settings


def whatsapp_available():
    """WhatsApp is only usable when the admin has explicitly turned it on AND
    Twilio credentials are actually filled in — this is the single source of
    truth the rest of the app checks before ever offering/using the channel."""
    s = get_settings()
    return bool(s.whatsapp_enabled and s.twilio_account_sid and s.twilio_auth_token and s.twilio_whatsapp_from)


def email_available():
    s = get_settings()
    return bool(s.smtp_host and s.smtp_user and s.smtp_password)


def effective_public_base_url():
    """The URL embedded in every QR code and message link. Prefers whatever the
    admin has set on the Settings page (DB-backed, no restart needed) and falls
    back to the .env-based Config default only if the Settings field is blank."""
    s = get_settings()
    return s.public_base_url or current_app.config["PUBLIC_BASE_URL"]


def sanitize_channels(requested_channels):
    """Filters a requested channel list down to what's actually usable, so
    WhatsApp is never sent when the admin hasn't enabled/configured it —
    regardless of what a client happens to send."""
    allowed = []
    if "whatsapp" in requested_channels and whatsapp_available():
        allowed.append("whatsapp")
    if "email" in requested_channels and email_available():
        allowed.append("email")
    return allowed
