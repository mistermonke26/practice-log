"""
Session toggle logic.

When a QR is scanned:
  - if the user has no active session → start one
  - if the user has an active session → end it and save the practice log

Safeguards handled here:
  - per-payload cooldown (prevents the same card from toggling twice in quick succession)
  - suspiciously short session detection
  - auto-close of abandoned sessions (called on a background schedule)
"""

import sys
import os
import time
import threading
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))
import db
from config import (
    SCAN_COOLDOWN_SECONDS,
    AUTO_CLOSE_HOURS,
    MIN_SESSION_MINUTES,
    STATION_INSTRUMENT,
)


# ── Cooldown state ─────────────────────────────────────────────────────────────
# Maps qr_payload → unix timestamp of last accepted scan.
_last_scan_time: dict[str, float] = {}
_cooldown_lock = threading.Lock()


def _is_in_cooldown(payload: str) -> bool:
    with _cooldown_lock:
        last = _last_scan_time.get(payload)
        if last is None:
            return False
        return (time.monotonic() - last) < SCAN_COOLDOWN_SECONDS


def _record_scan_time(payload: str):
    with _cooldown_lock:
        _last_scan_time[payload] = time.monotonic()


# ── QR payload parsing ────────────────────────────────────────────────────────

def parse_payload(raw: str) -> tuple[str | None, str | None]:
    """
    Parse a QR payload into (user_name, instrument_name).

    Supported formats:
        user:jasmin|instrument:piano   →  ('jasmin', 'piano')
        user:jasmin                    →  ('jasmin', None)   ← uses station default
        jasmin                         →  ('jasmin', None)   ← fallback for plain name
    """
    user_name = None
    instrument_name = None

    parts = raw.strip().split("|")
    for part in parts:
        if ":" in part:
            key, _, val = part.partition(":")
            key = key.strip().lower()
            val = val.strip()
            if key == "user":
                user_name = val
            elif key == "instrument":
                instrument_name = val
        else:
            # plain string → treat as user name
            if user_name is None:
                user_name = part.strip()

    return user_name, instrument_name


# ── Main toggle handler ───────────────────────────────────────────────────────

class ScanResult:
    """Returned by handle_scan so the caller knows what happened."""

    def __init__(self, action: str, user_name: str = None,
                 instrument_name: str = None, duration_minutes: float = None,
                 flagged: bool = False, message: str = ""):
        self.action = action              # 'started' | 'ended' | 'cooldown_skip' | 'unknown'
        self.user_name = user_name
        self.instrument_name = instrument_name
        self.duration_minutes = duration_minutes
        self.flagged = flagged
        self.message = message

    def __repr__(self):
        return f"<ScanResult action={self.action!r} user={self.user_name!r} {self.message!r}>"


def handle_scan(raw_payload: str) -> ScanResult:
    """
    Main entry point for each detected QR code.
    Returns a ScanResult describing what happened.
    """
    user_name, instrument_name = parse_payload(raw_payload)

    if not user_name:
        db.log_scan_event(raw_payload, None, None, "unknown")
        return ScanResult("unknown", message=f"Could not parse payload: {raw_payload!r}")

    if instrument_name is None:
        instrument_name = STATION_INSTRUMENT

    # Resolve or create IDs
    user_id = db.get_or_create_user(user_name, raw_payload)
    instrument_id = db.get_or_create_instrument(instrument_name)

    # Cooldown check
    if _is_in_cooldown(raw_payload):
        db.log_scan_event(raw_payload, user_id, instrument_id, "cooldown_skip")
        return ScanResult("cooldown_skip", user_name=user_name,
                          instrument_name=instrument_name,
                          message="Ignored — cooldown active")

    _record_scan_time(raw_payload)

    # Toggle logic
    active = db.get_active_session(user_id, instrument_id)

    if active is None:
        # ── Start session ──
        db.create_active_session(user_id, instrument_id)
        db.log_scan_event(raw_payload, user_id, instrument_id, "start")
        return ScanResult(
            "started",
            user_name=user_name,
            instrument_name=instrument_name,
            message=f"{user_name} started {instrument_name}",
        )
    else:
        # ── End session ──
        ended_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        started_dt = datetime.fromisoformat(active["started_at"])
        ended_dt = datetime.fromisoformat(ended_at)
        duration = (ended_dt - started_dt).total_seconds() / 60

        flagged = duration < MIN_SESSION_MINUTES
        status = "suspicious" if flagged else "complete"

        db.close_active_session(active["id"], ended_at, round(duration, 2), status)
        db.log_scan_event(raw_payload, user_id, instrument_id, "end")

        return ScanResult(
            "ended",
            user_name=user_name,
            instrument_name=instrument_name,
            duration_minutes=round(duration, 1),
            flagged=flagged,
            message=(
                f"{user_name} ended {instrument_name} — "
                f"{round(duration, 1)} min"
                + (" [flagged: very short]" if flagged else "")
            ),
        )


# ── Auto-close abandoned sessions ─────────────────────────────────────────────

def auto_close_abandoned():
    """
    Closes any active session that has been open longer than AUTO_CLOSE_HOURS.
    Call this periodically (e.g. every 10 minutes via the background thread).
    """
    cutoff = datetime.now() - timedelta(hours=AUTO_CLOSE_HOURS)
    cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")

    conn = db.get_conn()
    stale = conn.execute(
        "SELECT * FROM active_sessions WHERE started_at < ?", (cutoff_str,)
    ).fetchall()
    conn.close()

    closed = []
    for session in stale:
        ended_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        started_dt = datetime.fromisoformat(session["started_at"])
        duration = (datetime.now() - started_dt).total_seconds() / 60
        db.close_active_session(session["id"], ended_at, round(duration, 2), "auto_closed")
        closed.append(session["id"])

    if closed:
        print(f"[auto-close] Closed {len(closed)} abandoned session(s): {closed}")

    return closed


def start_auto_close_thread(interval_seconds: int = 600):
    """Runs auto_close_abandoned in the background every interval_seconds."""

    def _loop():
        while True:
            time.sleep(interval_seconds)
            try:
                auto_close_abandoned()
            except Exception as exc:
                print(f"[auto-close] Error: {exc}")

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    return t
