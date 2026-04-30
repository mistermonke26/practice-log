"""
Database layer — creates tables on first run and provides
helper functions used by both the scanner and the dashboard.
"""

import sqlite3
import os
from datetime import datetime, timezone
from config import DB_PATH


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  # safer for concurrent reads/writes
    return conn


def init_db():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = get_conn()
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL UNIQUE,
            qr_payload  TEXT    NOT NULL UNIQUE,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS instruments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL UNIQUE,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        -- Every raw QR detection is recorded here for debugging.
        CREATE TABLE IF NOT EXISTS scan_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_payload TEXT    NOT NULL,
            user_id     INTEGER REFERENCES users(id),
            instrument_id INTEGER REFERENCES instruments(id),
            scanned_at  TEXT    NOT NULL DEFAULT (datetime('now')),
            action      TEXT    NOT NULL  -- 'start', 'end', 'cooldown_skip', 'unknown'
        );

        -- Currently open (not yet ended) sessions.
        CREATE TABLE IF NOT EXISTS active_sessions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL REFERENCES users(id),
            instrument_id INTEGER NOT NULL REFERENCES instruments(id),
            started_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        -- Completed sessions (moved here from active_sessions on end scan or auto-close).
        CREATE TABLE IF NOT EXISTS practice_logs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL REFERENCES users(id),
            instrument_id   INTEGER NOT NULL REFERENCES instruments(id),
            started_at      TEXT    NOT NULL,
            ended_at        TEXT    NOT NULL,
            duration_minutes REAL   NOT NULL,
            status          TEXT    NOT NULL DEFAULT 'complete',
                            -- 'complete' | 'auto_closed' | 'suspicious' | 'manual_fix'
            source          TEXT    NOT NULL DEFAULT 'scan',
                            -- 'scan' | 'manual_edit'
            notes           TEXT
        );
    """)

    conn.commit()
    conn.close()


# ── User helpers ─────────────────────────────────────────────────────────────

def get_or_create_user(name: str, qr_payload: str) -> int:
    conn = get_conn()
    row = conn.execute(
        "SELECT id FROM users WHERE qr_payload = ?", (qr_payload,)
    ).fetchone()
    if row:
        conn.close()
        return row["id"]
    conn.execute(
        "INSERT INTO users (name, qr_payload) VALUES (?, ?)", (name, qr_payload)
    )
    conn.commit()
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return user_id


def get_user_by_payload(qr_payload: str):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM users WHERE qr_payload = ?", (qr_payload,)
    ).fetchone()
    conn.close()
    return row


def all_users():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM users ORDER BY name").fetchall()
    conn.close()
    return rows


# ── Instrument helpers ────────────────────────────────────────────────────────

def get_or_create_instrument(name: str) -> int:
    conn = get_conn()
    row = conn.execute(
        "SELECT id FROM instruments WHERE name = ?", (name,)
    ).fetchone()
    if row:
        conn.close()
        return row["id"]
    conn.execute("INSERT INTO instruments (name) VALUES (?)", (name,))
    conn.commit()
    instrument_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return instrument_id


# ── Scan event helpers ────────────────────────────────────────────────────────

def log_scan_event(raw_payload, user_id, instrument_id, action):
    conn = get_conn()
    conn.execute(
        """INSERT INTO scan_events (raw_payload, user_id, instrument_id, scanned_at, action)
           VALUES (?, ?, ?, ?, ?)""",
        (raw_payload, user_id, instrument_id, _now(), action),
    )
    conn.commit()
    conn.close()


# ── Active session helpers ────────────────────────────────────────────────────

def get_active_session(user_id: int, instrument_id: int):
    conn = get_conn()
    row = conn.execute(
        """SELECT * FROM active_sessions
           WHERE user_id = ? AND instrument_id = ?""",
        (user_id, instrument_id),
    ).fetchone()
    conn.close()
    return row


def create_active_session(user_id: int, instrument_id: int) -> int:
    conn = get_conn()
    conn.execute(
        "INSERT INTO active_sessions (user_id, instrument_id, started_at) VALUES (?, ?, ?)",
        (user_id, instrument_id, _now()),
    )
    conn.commit()
    session_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return session_id


def close_active_session(session_id: int, ended_at: str, duration_minutes: float, status: str) -> int:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM active_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    if not row:
        conn.close()
        return None

    conn.execute(
        """INSERT INTO practice_logs
               (user_id, instrument_id, started_at, ended_at, duration_minutes, status, source)
           VALUES (?, ?, ?, ?, ?, ?, 'scan')""",
        (row["user_id"], row["instrument_id"], row["started_at"], ended_at, duration_minutes, status),
    )
    conn.execute("DELETE FROM active_sessions WHERE id = ?", (session_id,))
    conn.commit()
    log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return log_id


def all_open_sessions():
    conn = get_conn()
    rows = conn.execute(
        """SELECT a.*, u.name as user_name, i.name as instrument_name
           FROM active_sessions a
           JOIN users u ON a.user_id = u.id
           JOIN instruments i ON a.instrument_id = i.id
           ORDER BY a.started_at"""
    ).fetchall()
    conn.close()
    return rows


# ── Practice log helpers ──────────────────────────────────────────────────────

def logs_for_day(date_str: str):
    conn = get_conn()
    rows = conn.execute(
        """SELECT p.*, u.name as user_name, i.name as instrument_name
           FROM practice_logs p
           JOIN users u ON p.user_id = u.id
           JOIN instruments i ON p.instrument_id = i.id
           WHERE date(p.started_at) = ?
           ORDER BY p.started_at DESC""",
        (date_str,),
    ).fetchall()
    conn.close()
    return rows


def weekly_totals(start_date: str, end_date: str):
    conn = get_conn()
    rows = conn.execute(
        """SELECT u.name as user_name, i.name as instrument_name,
                  ROUND(SUM(p.duration_minutes), 1) as total_minutes,
                  COUNT(*) as session_count
           FROM practice_logs p
           JOIN users u ON p.user_id = u.id
           JOIN instruments i ON p.instrument_id = i.id
           WHERE date(p.started_at) BETWEEN ? AND ?
           GROUP BY p.user_id, p.instrument_id
           ORDER BY total_minutes DESC""",
        (start_date, end_date),
    ).fetchall()
    conn.close()
    return rows


def flagged_logs():
    conn = get_conn()
    rows = conn.execute(
        """SELECT p.*, u.name as user_name, i.name as instrument_name
           FROM practice_logs p
           JOIN users u ON p.user_id = u.id
           JOIN instruments i ON p.instrument_id = i.id
           WHERE p.status IN ('auto_closed', 'suspicious', 'manual_fix')
           ORDER BY p.started_at DESC
           LIMIT 50"""
    ).fetchall()
    conn.close()
    return rows


def get_log(log_id: int):
    conn = get_conn()
    row = conn.execute(
        """SELECT p.*, u.name as user_name, i.name as instrument_name
           FROM practice_logs p
           JOIN users u ON p.user_id = u.id
           JOIN instruments i ON p.instrument_id = i.id
           WHERE p.id = ?""",
        (log_id,),
    ).fetchone()
    conn.close()
    return row


def update_log(log_id: int, started_at: str, ended_at: str, notes: str):
    started_dt = datetime.fromisoformat(started_at)
    ended_dt = datetime.fromisoformat(ended_at)
    duration = (ended_dt - started_dt).total_seconds() / 60
    conn = get_conn()
    conn.execute(
        """UPDATE practice_logs
           SET started_at = ?, ended_at = ?, duration_minutes = ?,
               status = 'manual_fix', source = 'manual_edit', notes = ?
           WHERE id = ?""",
        (started_at, ended_at, round(duration, 2), notes, log_id),
    )
    conn.commit()
    conn.close()


def delete_log(log_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM practice_logs WHERE id = ?", (log_id,))
    conn.commit()
    conn.close()


def add_manual_log(user_id: int, instrument_id: int, started_at: str, ended_at: str, notes: str):
    started_dt = datetime.fromisoformat(started_at)
    ended_dt = datetime.fromisoformat(ended_at)
    duration = (ended_dt - started_dt).total_seconds() / 60
    conn = get_conn()
    conn.execute(
        """INSERT INTO practice_logs
               (user_id, instrument_id, started_at, ended_at, duration_minutes, status, source, notes)
           VALUES (?, ?, ?, ?, ?, 'manual_fix', 'manual_edit', ?)""",
        (user_id, instrument_id, started_at, ended_at, round(duration, 2), notes),
    )
    conn.commit()
    conn.close()


# ── Utility ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
