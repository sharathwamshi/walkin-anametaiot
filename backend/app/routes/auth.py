from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, jwt_required

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    data = request.get_json(force=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")

    if username == current_app.config["ADMIN_USERNAME"] and password == current_app.config["ADMIN_PASSWORD"]:
        token = create_access_token(identity=username)
        return jsonify({"access_token": token, "username": username})

    return jsonify({"error": "Invalid credentials"}), 401


@auth_bp.get("/me")
@jwt_required()
def me():
    from flask_jwt_extended import get_jwt_identity
    return jsonify({"username": get_jwt_identity()})
