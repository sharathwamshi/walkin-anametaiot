import smtplib
import os
from email.message import EmailMessage
from flask import current_app
from app.extensions import db
from app.models.models import MessageLog
from app.utils.settings_utils import get_settings, whatsapp_available, email_available


def _dry_run_for_whatsapp():
    settings = get_settings()
    if settings.dry_run == "true":
        return True
    if settings.dry_run == "false":
        return False
    return not whatsapp_available()


def _dry_run_for_email():
    settings = get_settings()
    if settings.dry_run == "true":
        return True
    if settings.dry_run == "false":
        return False
    return not email_available()


def _log(candidate_id, channel, msg_type, status, error=None):
    log = MessageLog(candidate_id=candidate_id, channel=channel, msg_type=msg_type,
                      status=status, error=error)
    db.session.add(log)
    db.session.commit()
    return log


def send_whatsapp(candidate, body, msg_type, media_path=None):
    settings = get_settings()

    if not settings.whatsapp_enabled:
        _log(candidate.id, "whatsapp", msg_type, "skipped",
             error="WhatsApp is turned off in Settings.")
        return False, "WhatsApp is turned off in Settings"

    if _dry_run_for_whatsapp():
        _log(candidate.id, "whatsapp", msg_type, "simulated",
             error="DRY_RUN: Twilio not fully configured/enabled; message logged only.")
        return True, "simulated"
    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        kwargs = dict(
            from_=settings.twilio_whatsapp_from,
            to=f"whatsapp:{candidate.phone}",
            body=body,
        )
        if media_path:
            # NOTE: Twilio requires a publicly reachable URL for media_url, not a
            # local file path. In production, serve QR images from a public static
            # URL (settings.public_base_url + '/static/qrcodes/<file>').
            base = settings.public_base_url or current_app.config["PUBLIC_BASE_URL"]
            kwargs["media_url"] = [f"{base}/static/{media_path}"]
        client.messages.create(**kwargs)
        _log(candidate.id, "whatsapp", msg_type, "sent")
        return True, "sent"
    except Exception as e:
        _log(candidate.id, "whatsapp", msg_type, "failed", error=str(e))
        return False, str(e)


def send_email(candidate, subject, body_html, msg_type, attachment_path=None):
    settings = get_settings()

    if not candidate.email:
        _log(candidate.id, "email", msg_type, "failed", error="No email on file")
        return False, "No email on file"

    if _dry_run_for_email():
        _log(candidate.id, "email", msg_type, "simulated",
             error="DRY_RUN: SMTP not fully configured; message logged only.")
        return True, "simulated"
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f'{settings.smtp_from_name or "Walk-in Drive"} <{settings.smtp_user}>'
        msg["To"] = candidate.email
        msg.set_content("This email requires an HTML-capable client.")
        msg.add_alternative(body_html, subtype="html")

        if attachment_path and os.path.exists(attachment_path):
            with open(attachment_path, "rb") as f:
                msg.add_attachment(f.read(), maintype="image", subtype="png",
                                    filename=os.path.basename(attachment_path))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)

        _log(candidate.id, "email", msg_type, "sent")
        return True, "sent"
    except Exception as e:
        _log(candidate.id, "email", msg_type, "failed", error=str(e))
        return False, str(e)
