"""
Main scanner entry point.

Runs a continuous camera loop on the Raspberry Pi, detects QR codes,
and delegates each scan to the session toggle logic in session.py.

Usage:
    python scanner.py

Environment variables (all optional — see config.py for defaults):
    STATION_INSTRUMENT     name of the instrument at this station
    SCAN_COOLDOWN_SECONDS  how long to ignore the same QR after scanning
    AUTO_CLOSE_HOURS       how many hours before auto-closing an open session
    MIN_SESSION_MINUTES    sessions shorter than this are flagged
    CAMERA_INDEX           OpenCV device index (default 0)
    CAMERA_FPS             capture rate
"""

import sys
import os
import time
import cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db
import session
from config import CAMERA_INDEX, CAMERA_FPS, STATION_INSTRUMENT


# ── Optional: try to import pyzbar as a more reliable fallback ────────────────
try:
    from pyzbar import pyzbar as _pyzbar
    _HAS_PYZBAR = True
except ImportError:
    _HAS_PYZBAR = False


def decode_qr(frame):
    """
    Try to decode QR codes in the given frame.
    Returns a list of decoded payload strings.
    Tries OpenCV first, falls back to pyzbar if installed.
    """
    payloads = []

    detector = cv2.QRCodeDetector()
    data, _, _ = detector.detectAndDecode(frame)
    if data:
        payloads.append(data)

    if not payloads and _HAS_PYZBAR:
        decoded = _pyzbar.decode(frame)
        for obj in decoded:
            payloads.append(obj.data.decode("utf-8"))

    return payloads


def print_result(result):
    """Pretty-print a scan result to stdout."""
    icons = {
        "started":       "▶ START",
        "ended":         "■ END  ",
        "cooldown_skip": "  ....  (cooldown)",
        "unknown":       "  ???  ",
    }
    icon = icons.get(result.action, "      ")
    flag = " ⚠ flagged" if result.flagged else ""
    print(f"[{icon}] {result.message}{flag}")


def run():
    print(f"[scanner] Starting — station instrument: {STATION_INSTRUMENT}")
    print(f"[scanner] Initialising database...")
    db.init_db()

    print(f"[scanner] Starting auto-close background thread...")
    session.start_auto_close_thread(interval_seconds=600)

    print(f"[scanner] Opening camera (index {CAMERA_INDEX})...")
    cap = cv2.VideoCapture(CAMERA_INDEX)

    if not cap.isOpened():
        print("[scanner] ERROR: Could not open camera. Check CAMERA_INDEX or connection.")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
    print(f"[scanner] Camera ready. Scan a QR card to log practice.\n")

    frame_delay = 1.0 / CAMERA_FPS
    last_frame_time = 0

    try:
        while True:
            now = time.monotonic()
            if now - last_frame_time < frame_delay:
                time.sleep(0.01)
                continue
            last_frame_time = now

            ret, frame = cap.read()
            if not ret:
                print("[scanner] WARNING: Failed to read frame — retrying...")
                time.sleep(0.5)
                continue

            payloads = decode_qr(frame)
            for payload in payloads:
                result = session.handle_scan(payload)
                print_result(result)

    except KeyboardInterrupt:
        print("\n[scanner] Stopped by user.")
    finally:
        cap.release()


if __name__ == "__main__":
    run()
