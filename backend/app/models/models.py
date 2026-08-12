import uuid
import re
import secrets
import json
from datetime import datetime
from app.extensions import db


def gen_uuid():
    return str(uuid.uuid4())


UNIQUE_ID_PREFIX = "AFPL"


def gen_unique_id():
    # Short candidate-facing ID. No special characters (only the prefix plus
    # uppercase letters/digits) so it's easy to read aloud, type on a phone
    # keyboard, or key in manually at a scanner with zero ambiguity — and
    # always starts with AFPL. e.g. AFPL7F3A9B
    return UNIQUE_ID_PREFIX + secrets.token_hex(3).upper()


def normalize_unique_id(raw):
    """Normalizes a candidate-entered ID before matching it against the
    database: case-insensitive, and forgiving of stray spaces/hyphens/other
    punctuation someone might type out of habit (e.g. 'afpl-7f3a9b' or
    'AFPL 7F3A9B' both resolve the same as 'AFPL7F3A9B')."""
    if not raw:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", raw).upper()


def unique_id_match_filter(raw):
    """SQLAlchemy filter condition matching a candidate's unique_id against
    user-entered text — case-insensitive and hyphen/space-tolerant on BOTH
    sides of the comparison, not just the input. That matters because IDs
    generated before the AFPL-prefixed, hyphen-free format (the older
    'AWD-XXXXXX' style) are still sitting in the database with a hyphen in
    them; normalizing only the typed input would silently break lookups for
    every candidate who already received one of those. Comparing both sides
    the same way means old and new formats both keep working, with no data
    migration required. Uses SQL REPLACE/UPPER, portable across SQLite and
    MySQL."""
    from sqlalchemy import func
    normalized = normalize_unique_id(raw)
    stored_normalized = func.upper(func.replace(func.replace(Candidate.unique_id, "-", ""), " ", ""))
    return stored_normalized == normalized


def gen_session_token():
    return secrets.token_urlsafe(32)


def to_iso_z(dt):
    """Serializes a naive UTC datetime with an explicit 'Z' suffix. Without this,
    JavaScript's Date parser treats a zone-less ISO string as LOCAL time (per the
    ECMAScript Date Time String Format spec), not UTC — on a candidate whose
    browser is e.g. IST (UTC+5:30), that silently shifts every timestamp by
    5.5 hours, which is exactly what was making assessments appear already
    expired the instant they started. Every datetime sent to the frontend goes
    through this helper so that never happens again."""
    if dt is None:
        return None
    return dt.isoformat() + "Z"


class Settings(db.Model):
    """Singleton row (id is always 1) holding admin-editable runtime settings so
    the operator can configure Twilio/SMTP and toggle WhatsApp from the portal
    itself, instead of only via server-side .env files."""
    __tablename__ = "settings"
    id = db.Column(db.Integer, primary_key=True)

    whatsapp_enabled = db.Column(db.Boolean, default=False)
    twilio_account_sid = db.Column(db.String(200))
    twilio_auth_token = db.Column(db.String(200))
    twilio_whatsapp_from = db.Column(db.String(50))

    smtp_host = db.Column(db.String(150))
    smtp_port = db.Column(db.Integer, default=587)
    smtp_user = db.Column(db.String(150))
    smtp_password = db.Column(db.String(200))
    smtp_from_name = db.Column(db.String(150))

    public_base_url = db.Column(db.String(200))
    dry_run = db.Column(db.String(10), default="auto")  # auto/true/false
    max_tab_violations = db.Column(db.Integer, default=1)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, mask_secrets=True):
        return {
            "whatsapp_enabled": self.whatsapp_enabled,
            "twilio_account_sid": self.twilio_account_sid or "",
            "twilio_auth_token": ("•" * 8 if (mask_secrets and self.twilio_auth_token) else (self.twilio_auth_token or "")),
            "twilio_whatsapp_from": self.twilio_whatsapp_from or "",
            "smtp_host": self.smtp_host or "",
            "smtp_port": self.smtp_port,
            "smtp_user": self.smtp_user or "",
            "smtp_password": ("•" * 8 if (mask_secrets and self.smtp_password) else (self.smtp_password or "")),
            "smtp_from_name": self.smtp_from_name or "",
            "public_base_url": self.public_base_url or "",
            "dry_run": self.dry_run,
            "max_tab_violations": self.max_tab_violations,
            "twilio_configured": bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_whatsapp_from),
            "smtp_configured": bool(self.smtp_host and self.smtp_user and self.smtp_password),
        }


class Event(db.Model):
    __tablename__ = "events"

    # Default self-registration form shape for a newly created drive. "name" is
    # intentionally not configurable — every candidate needs one and it's
    # always shown/required. Everything else the event creator can toggle.
    DEFAULT_REGISTRATION_FORM_CONFIG = {
        "phone": {"required": True, "validate": True},
        "email": {"enabled": True, "required": False, "validate": True},
        "college": {"enabled": True, "required": False},
        "branch": {"enabled": True, "required": False},
        "cgpa": {"enabled": True, "required": False},
        "passout_year": {"enabled": True, "required": False},
        "resume_link": {"enabled": False, "required": False},
    }

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    venue = db.Column(db.String(200))
    drive_date = db.Column(db.Date)
    status = db.Column(db.String(20), default="draft")  # draft/active/closed
    standee_token = db.Column(db.String(64), unique=True, default=gen_uuid)  # walk-in QR link token
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    registration_form_config_json = db.Column(db.Text)  # JSON — see DEFAULT_REGISTRATION_FORM_CONFIG

    candidates = db.relationship("Candidate", backref="event", lazy="dynamic")
    test_levels = db.relationship("TestLevel", backref="event", lazy="dynamic",
                                   order_by="TestLevel.level_number")

    def get_registration_form_config(self):
        if not self.registration_form_config_json:
            return dict(Event.DEFAULT_REGISTRATION_FORM_CONFIG)
        try:
            stored = json.loads(self.registration_form_config_json)
        except (ValueError, TypeError):
            return dict(Event.DEFAULT_REGISTRATION_FORM_CONFIG)
        # Merge over the default so an old event created before a new
        # optional field existed still gets a sane default for it.
        merged = {k: dict(v) for k, v in Event.DEFAULT_REGISTRATION_FORM_CONFIG.items()}
        for field, cfg in (stored or {}).items():
            if field in merged and isinstance(cfg, dict):
                merged[field].update(cfg)
        return merged

    def set_registration_form_config(self, config):
        if not isinstance(config, dict):
            return
        merged = self.get_registration_form_config()
        for field, cfg in config.items():
            if field in merged and isinstance(cfg, dict):
                merged[field].update({k: v for k, v in cfg.items() if k in ("enabled", "required", "validate")})
        self.registration_form_config_json = json.dumps(merged)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "description": self.description,
            "venue": self.venue,
            "drive_date": self.drive_date.isoformat() if self.drive_date else None,
            "status": self.status, "standee_token": self.standee_token,
            "created_at": to_iso_z(self.created_at),
            "candidate_count": self.candidates.count(),
            "registration_form_config": self.get_registration_form_config(),
        }


class Candidate(db.Model):
    __tablename__ = "candidates"
    id = db.Column(db.Integer, primary_key=True)
    unique_id = db.Column(db.String(20), unique=True, default=gen_unique_id, index=True)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=False)

    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(150))
    phone = db.Column(db.String(20), nullable=False)
    college = db.Column(db.String(200))
    branch = db.Column(db.String(100))
    cgpa = db.Column(db.String(20))
    passout_year = db.Column(db.String(10))
    resume_link = db.Column(db.String(300))

    source = db.Column(db.String(20), default="pre_list")  # pre_list / walkin

    # QR invite lifecycle
    qr_path = db.Column(db.String(300))
    qr_send_status = db.Column(db.String(20), default="pending")  # pending/sending/sent/failed
    qr_send_error = db.Column(db.Text)
    qr_sent_at = db.Column(db.DateTime)

    # Front desk attendance
    checked_in = db.Column(db.Boolean, default=False)
    checked_in_at = db.Column(db.DateTime)
    welcome_sent = db.Column(db.Boolean, default=False)

    registered_at = db.Column(db.DateTime, default=datetime.utcnow)

    sessions = db.relationship("CandidateTestSession", backref="candidate", lazy="dynamic")
    level_results = db.relationship("CandidateLevelResult", backref="candidate", lazy="dynamic")
    messages = db.relationship("MessageLog", backref="candidate", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id, "unique_id": self.unique_id, "event_id": self.event_id,
            "name": self.name, "email": self.email, "phone": self.phone,
            "college": self.college, "branch": self.branch, "cgpa": self.cgpa,
            "passout_year": self.passout_year, "resume_link": self.resume_link,
            "source": self.source,
            "qr_send_status": self.qr_send_status, "qr_sent_at": to_iso_z(self.qr_sent_at),
            "checked_in": self.checked_in,
            "checked_in_at": to_iso_z(self.checked_in_at),
            "welcome_sent": self.welcome_sent,
            "registered_at": to_iso_z(self.registered_at),
        }


class MessageLog(db.Model):
    __tablename__ = "message_logs"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    channel = db.Column(db.String(20))  # whatsapp / email
    msg_type = db.Column(db.String(30))  # qr_invite / welcome / test_invite / next_level / result
    status = db.Column(db.String(20))  # sent / failed / simulated
    error = db.Column(db.Text)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "candidate_id": self.candidate_id, "channel": self.channel,
            "msg_type": self.msg_type, "status": self.status, "error": self.error,
            "sent_at": to_iso_z(self.sent_at),
        }


class TestLevel(db.Model):
    __tablename__ = "test_levels"
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=False)
    level_number = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(150), nullable=False)
    test_type = db.Column(db.String(30), default="aptitude")  # aptitude / technical / other
    duration_minutes = db.Column(db.Integer, default=30)
    cutoff_score = db.Column(db.Float)
    status = db.Column(db.String(20), default="draft")  # draft/active/completed
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    questions = db.relationship("Question", backref="test_level", lazy="dynamic",
                                 cascade="all, delete-orphan")
    sessions = db.relationship("CandidateTestSession", backref="test_level", lazy="dynamic")
    results = db.relationship("CandidateLevelResult", backref="test_level", lazy="dynamic")

    def to_dict(self, include_counts=False):
        d = {
            "id": self.id, "event_id": self.event_id, "level_number": self.level_number,
            "name": self.name, "test_type": self.test_type,
            "duration_minutes": self.duration_minutes, "cutoff_score": self.cutoff_score,
            "status": self.status,
            "started_at": to_iso_z(self.started_at),
            "completed_at": to_iso_z(self.completed_at),
            "question_count": self.questions.count(),
        }
        if include_counts:
            d["session_count"] = self.sessions.count()
        return d


class Question(db.Model):
    __tablename__ = "questions"
    id = db.Column(db.Integer, primary_key=True)
    test_level_id = db.Column(db.Integer, db.ForeignKey("test_levels.id"), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    option_a = db.Column(db.String(500))
    option_b = db.Column(db.String(500))
    option_c = db.Column(db.String(500))
    option_d = db.Column(db.String(500))
    correct_option = db.Column(db.String(1))  # A/B/C/D
    marks = db.Column(db.Float, default=1.0)
    negative_marks = db.Column(db.Float, default=0.0)
    order_index = db.Column(db.Integer, default=0)

    def to_dict(self, reveal_answer=False):
        d = {
            "id": self.id, "question_text": self.question_text,
            "option_a": self.option_a, "option_b": self.option_b,
            "option_c": self.option_c, "option_d": self.option_d,
            "marks": self.marks, "negative_marks": self.negative_marks,
        }
        if reveal_answer:
            d["correct_option"] = self.correct_option
        return d


class CandidateTestSession(db.Model):
    __tablename__ = "candidate_test_sessions"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    test_level_id = db.Column(db.Integer, db.ForeignKey("test_levels.id"), nullable=False)

    status = db.Column(db.String(20), default="not_started")
    # not_started / in_progress / flagged / completed / disqualified
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    score = db.Column(db.Float)
    tab_violation_count = db.Column(db.Integer, default=0)
    is_flagged = db.Column(db.Boolean, default=False)
    admin_reset_count = db.Column(db.Integer, default=0)
    last_heartbeat = db.Column(db.DateTime)
    session_token = db.Column(db.String(64), default=gen_session_token)

    answers = db.relationship("CandidateAnswer", backref="session", lazy="dynamic",
                               cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id, "candidate_id": self.candidate_id,
            "candidate_name": self.candidate.name if self.candidate else None,
            "candidate_unique_id": self.candidate.unique_id if self.candidate else None,
            "test_level_id": self.test_level_id, "status": self.status,
            "start_time": to_iso_z(self.start_time),
            "end_time": to_iso_z(self.end_time),
            "score": self.score, "tab_violation_count": self.tab_violation_count,
            "is_flagged": self.is_flagged, "admin_reset_count": self.admin_reset_count,
            "last_heartbeat": to_iso_z(self.last_heartbeat),
        }


class CandidateAnswer(db.Model):
    __tablename__ = "candidate_answers"
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("candidate_test_sessions.id"), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey("questions.id"), nullable=False)
    selected_option = db.Column(db.String(1))
    is_correct = db.Column(db.Boolean)


class CandidateLevelResult(db.Model):
    __tablename__ = "candidate_level_results"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    test_level_id = db.Column(db.Integer, db.ForeignKey("test_levels.id"), nullable=False)
    score = db.Column(db.Float)
    max_score = db.Column(db.Float)
    passed = db.Column(db.Boolean, default=False)
    selected_for_next = db.Column(db.Boolean, default=False)
    next_level_invite_sent = db.Column(db.Boolean, default=False)
    decided_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "candidate_id": self.candidate_id,
            "candidate_name": self.candidate.name if self.candidate else None,
            "candidate_unique_id": self.candidate.unique_id if self.candidate else None,
            "test_level_id": self.test_level_id, "score": self.score,
            "max_score": self.max_score, "passed": self.passed,
            "selected_for_next": self.selected_for_next,
            "next_level_invite_sent": self.next_level_invite_sent,
        }
