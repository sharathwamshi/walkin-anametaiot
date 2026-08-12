import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Permissive but real: optional leading +, 7-15 digits total, common separators stripped before matching.
PHONE_RE = re.compile(r"^\+?\d{7,15}$")

FIELD_LABELS = {
    "phone": "Phone number", "email": "Email", "college": "College",
    "branch": "Branch", "cgpa": "CGPA", "passout_year": "Passout year",
    "resume_link": "Resume link",
}


def validate_registration_data(event, data):
    """Validates a public self-registration submission against the event's
    configured form — which optional fields are required, and whether phone /
    email need to pass a format check. Returns (True, None) or (False, error_message).
    "name" is always required and isn't part of the configurable set."""
    if not (data.get("name") or "").strip():
        return False, "Name is required"

    config = event.get_registration_form_config()

    phone = (data.get("phone") or "").strip()
    phone_cfg = config.get("phone", {})
    if phone_cfg.get("required", True) and not phone:
        return False, "Phone number is required"
    if phone and phone_cfg.get("validate", True):
        cleaned = re.sub(r"[\s\-()]", "", phone)
        if not PHONE_RE.match(cleaned):
            return False, "Please enter a valid phone number (7-15 digits)"

    email = (data.get("email") or "").strip()
    email_cfg = config.get("email", {})
    if email_cfg.get("enabled", True):
        if email_cfg.get("required", False) and not email:
            return False, "Email is required"
        if email and email_cfg.get("validate", True) and not EMAIL_RE.match(email):
            return False, "Please enter a valid email address"

    for field in ("college", "branch", "cgpa", "passout_year", "resume_link"):
        cfg = config.get(field, {})
        if cfg.get("enabled", True) and cfg.get("required", False) and not (data.get(field) or "").strip():
            return False, f"{FIELD_LABELS[field]} is required"

    return True, None
