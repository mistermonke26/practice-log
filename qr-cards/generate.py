"""
Generates printable QR code cards for each user in users.json.

Usage:
    python3 generate.py

Output:
    One PNG per user in the cards/ subdirectory.
    Each image is sized for printing at roughly 5cm x 6cm.

Requirements:
    pip install qrcode[pil] Pillow
"""

import json
import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

USERS_FILE = os.path.join(os.path.dirname(__file__), "users.json")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "cards")

# Card dimensions at 300 DPI → ~5 cm wide, 6.5 cm tall
CARD_W = 590
CARD_H = 770
QR_SIZE = 480     # pixels
MARGIN = 55

# Background colours per position (cycles if more users than colours).
# These make cards visually distinct so people can tell them apart at a glance.
BG_COLORS = [
    "#dbeafe",  # light blue
    "#fce7f3",  # light pink
    "#dcfce7",  # light green
    "#fef9c3",  # light yellow
    "#ede9fe",  # light purple
    "#ffedd5",  # light orange
]


def make_card(name: str, instrument: str, bg_color: str, output_path: str):
    payload = f"user:{name.lower()}|instrument:{instrument.lower()}"

    # Generate QR code
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color=bg_color).convert("RGBA")
    qr_img = qr_img.resize((QR_SIZE, QR_SIZE), Image.LANCZOS)

    # Build card canvas
    card = Image.new("RGBA", (CARD_W, CARD_H), bg_color)
    draw = ImageDraw.Draw(card)

    # Rounded border rectangle
    draw.rounded_rectangle(
        [4, 4, CARD_W - 4, CARD_H - 4],
        radius=32,
        outline="#94a3b8",
        width=3,
    )

    # Paste QR code centred near the top
    qr_x = (CARD_W - QR_SIZE) // 2
    qr_y = MARGIN
    card.paste(qr_img, (qr_x, qr_y), qr_img)

    # Name text
    font_name = _load_font(64)
    font_sub = _load_font(32)

    name_bbox = draw.textbbox((0, 0), name, font=font_name)
    name_w = name_bbox[2] - name_bbox[0]
    name_x = (CARD_W - name_w) // 2
    name_y = qr_y + QR_SIZE + 20
    draw.text((name_x, name_y), name, font=font_name, fill="#1e293b")

    # Instrument label
    label = instrument.capitalize()
    sub_bbox = draw.textbbox((0, 0), label, font=font_sub)
    sub_w = sub_bbox[2] - sub_bbox[0]
    sub_x = (CARD_W - sub_w) // 2
    sub_y = name_y + 74
    draw.text((sub_x, sub_y), label, font=font_sub, fill="#64748b")

    # Save
    card = card.convert("RGB")
    card.save(output_path, dpi=(300, 300))
    print(f"  Saved: {output_path}")


def _load_font(size: int):
    """Try to load a system font; fall back to PIL default."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(USERS_FILE) as f:
        users = json.load(f)

    print(f"Generating {len(users)} card(s)...")
    for i, user in enumerate(users):
        name = user["name"]
        instrument = user.get("instrument", "instrument")
        bg = BG_COLORS[i % len(BG_COLORS)]
        filename = f"{name.lower()}-{instrument.lower()}.png"
        output_path = os.path.join(OUTPUT_DIR, filename)
        make_card(name, instrument, bg, output_path)

    print(f"\nDone. Print the PNGs in cards/ at 300 DPI for best results.")
    print("Recommended print size: 5cm × 6.5cm or larger.")


if __name__ == "__main__":
    main()
