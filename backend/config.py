import os
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    # ---- Core ----
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-in-production")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "change-this-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)

    # ---- MySQL ----
    DB_USER = os.environ.get("DB_USER", "root")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "password")
    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = os.environ.get("DB_PORT", "3306")
    DB_NAME = os.environ.get("DB_NAME", "walkin_drive")

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 280}

    # ---- Single admin login (as requested: single-admin system, no multi-role) ----
    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "ChangeMe@123")

    # ---- Public base URL (used to build QR-embedded links) ----
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:5173")

    # ---- File storage ----
    UPLOAD_FOLDER = os.path.join(basedir, "storage", "uploads")
    QR_FOLDER = os.path.join(basedir, "storage", "qrcodes")
    TEMPLATE_FOLDER = os.path.join(basedir, "app", "templates_files")

    # ---- Twilio (WhatsApp) ----
    TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    # ---- Email (SMTP) ----
    SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USER = os.environ.get("SMTP_USER", "")
    SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
    SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "AnametaIoT Talent Acquisition")

    # If Twilio/SMTP credentials are not set, the system runs in DRY_RUN mode:
    # messages are logged to MessageLog with status 'simulated' instead of actually
    # being sent, so the whole flow can be demoed/tested without live credentials.
    DRY_RUN = os.environ.get("DRY_RUN", "auto")  # "auto" | "true" | "false"

    # ---- Anti-cheat ----
    MAX_TAB_VIOLATIONS_BEFORE_FLAG = int(os.environ.get("MAX_TAB_VIOLATIONS_BEFORE_FLAG", "1"))

    # ---- Branding ----
    BRAND_NAME = "AnametaIoT HRMS — Walk-in Drive Console"
    POWERED_BY = "Powered by +veGroww"
