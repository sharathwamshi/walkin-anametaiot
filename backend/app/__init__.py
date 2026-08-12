import os
from flask import Flask, jsonify
from config import Config
from app.extensions import db, jwt, cors


def create_app(config_class=Config):
    app = Flask(
        __name__,
        static_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage"),
        static_url_path="/static",
    )
    app.config.from_object(config_class)

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["QR_FOLDER"], exist_ok=True)

    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    from app.routes.auth import auth_bp
    from app.routes.events import events_bp
    from app.routes.candidates import candidates_bp
    from app.routes.qr_messaging import qr_bp
    from app.routes.frontdesk import frontdesk_bp
    from app.routes.tests import tests_bp
    from app.routes.settings import settings_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(events_bp, url_prefix="/api/events")
    app.register_blueprint(candidates_bp, url_prefix="/api/candidates")
    app.register_blueprint(qr_bp, url_prefix="/api/qr")
    app.register_blueprint(frontdesk_bp, url_prefix="/api/frontdesk")
    app.register_blueprint(tests_bp, url_prefix="/api/tests")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "brand": app.config["BRAND_NAME"]})

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500

    return app
