import os
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont
from flask import current_app

BADGE_COLOR = "#E86A17"  # brand orange
BADGE_FONT_CANDIDATES = ["DejaVuSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf"]


def _make_qr_image(payload, box_size=10, border=4):
    """High error-correction QR (tolerates ~30% of the image being obscured
    or damaged) so a center badge can safely be drawn on top without ever
    risking the code becoming unscannable."""
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=box_size, border=border)
    qr.add_data(payload)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")


def _add_center_badge(img, letter):
    """Draws a small circled letter in the center of a QR — e.g. 'R' for a
    registration QR vs 'T' for a test-entry QR — so two otherwise visually
    identical QR codes can be told apart at a glance on a printed standee.
    The badge covers roughly 20% of the image, comfortably inside the ~30%
    occlusion tolerance of the high-error-correction QR it's drawn onto."""
    img = img.copy()
    w, h = img.size
    draw = ImageDraw.Draw(img)

    badge_diameter = int(w * 0.22)
    cx, cy = w // 2, h // 2
    r = badge_diameter // 2

    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill="white", outline=BADGE_COLOR, width=max(3, badge_diameter // 12),
    )

    font = None
    font_size = int(badge_diameter * 0.62)
    for name in BADGE_FONT_CANDIDATES:
        try:
            font = ImageFont.truetype(name, font_size)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), letter, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), letter, fill=BADGE_COLOR, font=font)

    return img


def generate_candidate_qr(candidate):
    """
    Generates a QR image encoding the candidate's unique_id (the value front-desk
    and test-entry scanners read). Saved under storage/qrcodes/<unique_id>.png
    Returns the relative path stored on the Candidate row.
    """
    img = _make_qr_image(candidate.unique_id)

    folder = current_app.config["QR_FOLDER"]
    os.makedirs(folder, exist_ok=True)
    filename = f"{candidate.unique_id}.png"
    filepath = os.path.join(folder, filename)
    img.save(filepath)

    return os.path.join("qrcodes", filename)


def generate_link_qr(url, filename, label=None):
    """Generic QR generator for standee / entry / results links. Pass
    label='R' for a registration QR or label='T' for a test-entry QR to
    overlay a small circled letter — makes the two easy to tell apart on a
    printed standee where they'd otherwise look identical. Leave label=None
    (e.g. for a results QR) to generate a plain QR with no badge."""
    folder = current_app.config["QR_FOLDER"]
    os.makedirs(folder, exist_ok=True)
    filepath = os.path.join(folder, filename)

    img = _make_qr_image(url)
    if label:
        img = _add_center_badge(img, label)
    img.save(filepath)

    return os.path.join("qrcodes", filename)
