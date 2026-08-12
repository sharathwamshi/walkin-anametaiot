"""
Creates all database tables directly via SQLAlchemy — no `flask` CLI required.

Usage:
    cd backend
    python init_db.py

Reads the same DATABASE_URL / DB_* settings as the app (config.py / .env).
Safe to re-run: db.create_all() only creates tables that don't already exist,
it never drops or overwrites existing ones.
"""
from app import create_app
from app.extensions import db

app = create_app()

with app.app_context():
    db.create_all()
    print(f"Database tables created/verified at: {app.config['SQLALCHEMY_DATABASE_URI']}")
