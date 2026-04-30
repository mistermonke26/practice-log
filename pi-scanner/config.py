import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Path to the SQLite database (shared with the dashboard)
DB_PATH = os.path.join(BASE_DIR, "..", "tracker.db")

# Name of the instrument physically at this station.
# Used when the QR code does not include an instrument field.
STATION_INSTRUMENT = os.environ.get("STATION_INSTRUMENT", "piano")

# How long (seconds) to ignore the same QR payload after a scan.
# Prevents a held card from toggling start→end instantly.
SCAN_COOLDOWN_SECONDS = int(os.environ.get("SCAN_COOLDOWN_SECONDS", "5"))

# How many hours before an open session is auto-closed.
AUTO_CLOSE_HOURS = float(os.environ.get("AUTO_CLOSE_HOURS", "4"))

# Sessions shorter than this (minutes) are flagged as suspicious.
MIN_SESSION_MINUTES = float(os.environ.get("MIN_SESSION_MINUTES", "1"))

# Camera device index for OpenCV (0 = first camera).
CAMERA_INDEX = int(os.environ.get("CAMERA_INDEX", "0"))

# Frames per second to attempt for the capture loop.
CAMERA_FPS = int(os.environ.get("CAMERA_FPS", "10"))
