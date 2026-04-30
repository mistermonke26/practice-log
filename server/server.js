import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'tracker.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    qr_payload TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS instruments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS scan_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_payload   TEXT NOT NULL,
    user_id       INTEGER REFERENCES users(id),
    instrument_id INTEGER REFERENCES instruments(id),
    scanned_at    TEXT NOT NULL DEFAULT (datetime('now')),
    action        TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS active_sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    instrument_id INTEGER NOT NULL REFERENCES instruments(id),
    started_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS practice_logs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id),
    instrument_id    INTEGER NOT NULL REFERENCES instruments(id),
    started_at       TEXT NOT NULL,
    ended_at         TEXT NOT NULL,
    duration_minutes REAL NOT NULL,
    status           TEXT NOT NULL DEFAULT 'complete',
    source           TEXT NOT NULL DEFAULT 'scan',
    notes            TEXT
  );
`)

const app = express()
app.use(cors())
app.use(express.json())

function pad(n) { return String(n).padStart(2, '0') }

// Always use local wall-clock time so logs match what the user sees on their clock
function nowStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

function weekStartStr() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

// Both timestamps are local time strings — parse without 'Z' so JS treats them as local
function calcDuration(started_at, ended_at) {
  const ms = new Date(ended_at.replace(' ', 'T')) - new Date(started_at.replace(' ', 'T'))
  return Math.round((ms / 60000) * 100) / 100
}

// ── GET /api/summary — main dashboard payload ────────────────────────────────
app.get('/api/summary', (_req, res) => {
  const today = todayStr()
  const weekStart = weekStartStr()

  const todayLogs = db.prepare(`
    SELECT p.*, u.name AS user_name, i.name AS instrument_name
    FROM practice_logs p
    JOIN users u ON p.user_id = u.id
    JOIN instruments i ON p.instrument_id = i.id
    WHERE date(p.started_at) = ?
    ORDER BY p.started_at DESC
  `).all(today)

  const weekly = db.prepare(`
    SELECT u.name AS user_name, i.name AS instrument_name,
           ROUND(SUM(p.duration_minutes), 1) AS total_minutes,
           COUNT(*) AS session_count
    FROM practice_logs p
    JOIN users u ON p.user_id = u.id
    JOIN instruments i ON p.instrument_id = i.id
    WHERE date(p.started_at) BETWEEN ? AND ?
    GROUP BY p.user_id, p.instrument_id
    ORDER BY total_minutes DESC
  `).all(weekStart, today)

  const openSessions = db.prepare(`
    SELECT a.*, u.name AS user_name, i.name AS instrument_name
    FROM active_sessions a
    JOIN users u ON a.user_id = u.id
    JOIN instruments i ON a.instrument_id = i.id
    ORDER BY a.started_at
  `).all()

  const flagged = db.prepare(`
    SELECT p.*, u.name AS user_name, i.name AS instrument_name
    FROM practice_logs p
    JOIN users u ON p.user_id = u.id
    JOIN instruments i ON p.instrument_id = i.id
    WHERE p.status IN ('auto_closed', 'suspicious', 'manual_fix')
    ORDER BY p.started_at DESC
    LIMIT 50
  `).all()

  // Individual sessions for the week (used by the expandable weekly rows)
  const weeklyDetails = db.prepare(`
    SELECT p.id, p.user_id, p.instrument_id, p.started_at, p.ended_at,
           p.duration_minutes, p.status,
           u.name AS user_name, i.name AS instrument_name
    FROM practice_logs p
    JOIN users u ON p.user_id = u.id
    JOIN instruments i ON p.instrument_id = i.id
    WHERE date(p.started_at) BETWEEN ? AND ?
    ORDER BY p.started_at DESC
  `).all(weekStart, today)

  res.json({ today, weekStart, todayLogs, weekly, weeklyDetails, openSessions, flagged })
})

// ── GET /api/logs/day/:date ──────────────────────────────────────────────────
app.get('/api/logs/day/:date', (req, res) => {
  const logs = db.prepare(`
    SELECT p.*, u.name AS user_name, i.name AS instrument_name
    FROM practice_logs p
    JOIN users u ON p.user_id = u.id
    JOIN instruments i ON p.instrument_id = i.id
    WHERE date(p.started_at) = ?
    ORDER BY p.started_at DESC
  `).all(req.params.date)
  res.json(logs)
})

// ── GET /api/users ───────────────────────────────────────────────────────────
app.get('/api/users', (_req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY name').all())
})

// ── POST /api/users ──────────────────────────────────────────────────────────
app.post('/api/users', (req, res) => {
  const { name, qr_payload } = req.body
  if (!name || !qr_payload) return res.status(400).json({ error: 'name and qr_payload required' })
  try {
    const info = db.prepare(
      'INSERT INTO users (name, qr_payload) VALUES (?, ?)'
    ).run(name.trim(), qr_payload.trim())
    res.json({ ok: true, id: info.lastInsertRowid })
  } catch (e) {
    res.status(409).json({ error: e.message })
  }
})

// ── GET /api/instruments ─────────────────────────────────────────────────────
app.get('/api/instruments', (_req, res) => {
  let rows = db.prepare('SELECT * FROM instruments ORDER BY name').all()
  if (rows.length === 0) {
    db.prepare("INSERT OR IGNORE INTO instruments (name) VALUES ('piano')").run()
    rows = db.prepare('SELECT * FROM instruments ORDER BY name').all()
  }
  res.json(rows)
})

// ── POST /api/instruments ────────────────────────────────────────────────────
app.post('/api/instruments', (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const info = db.prepare(
      'INSERT INTO instruments (name) VALUES (?)'
    ).run(name.trim())
    res.json({ ok: true, id: info.lastInsertRowid })
  } catch (e) {
    res.status(409).json({ error: e.message })
  }
})

// ── GET /api/logs/:id ────────────────────────────────────────────────────────
app.get('/api/logs/:id', (req, res) => {
  const log = db.prepare(`
    SELECT p.*, u.name AS user_name, i.name AS instrument_name
    FROM practice_logs p
    JOIN users u ON p.user_id = u.id
    JOIN instruments i ON p.instrument_id = i.id
    WHERE p.id = ?
  `).get(req.params.id)
  if (!log) return res.status(404).json({ error: 'Not found' })
  res.json(log)
})

// ── PUT /api/logs/:id ────────────────────────────────────────────────────────
app.put('/api/logs/:id', (req, res) => {
  const { started_at, ended_at, notes } = req.body
  const duration = calcDuration(started_at, ended_at)
  db.prepare(`
    UPDATE practice_logs
    SET started_at = ?, ended_at = ?, duration_minutes = ?,
        status = 'manual_fix', source = 'manual_edit', notes = ?
    WHERE id = ?
  `).run(started_at, ended_at, duration, notes || null, req.params.id)
  res.json({ ok: true })
})

// ── POST /api/logs/:id/approve ───────────────────────────────────────────────
app.post('/api/logs/:id/approve', (req, res) => {
  db.prepare("UPDATE practice_logs SET status = 'complete' WHERE id = ?").run(req.params.id)
  res.json({ ok: true })
})

// ── DELETE /api/logs/:id ─────────────────────────────────────────────────────
app.delete('/api/logs/:id', (req, res) => {
  db.prepare('DELETE FROM practice_logs WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── POST /api/scan — camera QR toggle ────────────────────────────────────────
const cooldowns = new Map() // payload → last scan timestamp (ms)
const COOLDOWN_MS = 5000

app.post('/api/scan', (req, res) => {
  const { payload } = req.body
  if (!payload) return res.status(400).json({ error: 'payload required' })

  // Cooldown guard
  const last  = cooldowns.get(payload) || 0
  const nowMs = Date.now()
  if (nowMs - last < COOLDOWN_MS) {
    return res.json({ action: 'cooldown_skip', message: 'Hold on a moment…' })
  }
  cooldowns.set(payload, nowMs)

  // Parse "user:jasmin|instrument:piano"
  const parts = Object.fromEntries(
    payload.split('|').map(p => { const [k, ...v] = p.split(':'); return [k, v.join(':')] })
  )
  const userName      = parts.user
  const instrumentName = parts.instrument || 'piano'
  if (!userName) return res.status(400).json({ error: 'Invalid QR payload — expected user:name' })

  const now = nowStr()

  // Get or create user
  let user = db.prepare('SELECT * FROM users WHERE qr_payload = ?').get(payload)
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE lower(name) = lower(?)').get(userName)
    if (!user) {
      const info = db.prepare('INSERT INTO users (name, qr_payload) VALUES (?, ?)').run(userName, payload)
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
    }
  }

  // Get or create instrument
  let instrument = db.prepare('SELECT * FROM instruments WHERE lower(name) = lower(?)').get(instrumentName)
  if (!instrument) {
    const info = db.prepare('INSERT INTO instruments (name) VALUES (?)').run(instrumentName)
    instrument = db.prepare('SELECT * FROM instruments WHERE id = ?').get(info.lastInsertRowid)
  }

  // Log scan event
  const active = db.prepare(
    'SELECT * FROM active_sessions WHERE user_id = ? AND instrument_id = ?'
  ).get(user.id, instrument.id)

  if (!active) {
    db.prepare(
      'INSERT INTO active_sessions (user_id, instrument_id, started_at) VALUES (?, ?, ?)'
    ).run(user.id, instrument.id, now)
    db.prepare(
      "INSERT INTO scan_events (raw_payload, user_id, instrument_id, scanned_at, action) VALUES (?, ?, ?, ?, 'start')"
    ).run(payload, user.id, instrument.id, now)
    return res.json({ action: 'start', message: `${user.name} started ${instrument.name}`, user: user.name, instrument: instrument.name })
  }

  // End session — both timestamps are local time, parse without 'Z'
  const durationMin = (new Date(now.replace(' ', 'T')) - new Date(active.started_at.replace(' ', 'T'))) / 60000
  const status = durationMin < 1 ? 'suspicious' : 'complete'
  const rounded = Math.round(durationMin * 100) / 100

  db.prepare(`
    INSERT INTO practice_logs (user_id, instrument_id, started_at, ended_at, duration_minutes, status, source)
    VALUES (?, ?, ?, ?, ?, ?, 'scan')
  `).run(user.id, instrument.id, active.started_at, now, rounded, status)
  db.prepare('DELETE FROM active_sessions WHERE id = ?').run(active.id)
  db.prepare(
    "INSERT INTO scan_events (raw_payload, user_id, instrument_id, scanned_at, action) VALUES (?, ?, ?, ?, 'end')"
  ).run(payload, user.id, instrument.id, now)

  const mins = Math.round(durationMin)
  return res.json({ action: 'end', message: `${user.name} ended ${instrument.name} — ${mins} min`, user: user.name, instrument: instrument.name, duration: mins, status })
})

// ── POST /api/logs ───────────────────────────────────────────────────────────
app.post('/api/logs', (req, res) => {
  const { user_id, instrument_id, started_at, ended_at, notes } = req.body
  const duration = calcDuration(started_at, ended_at)
  db.prepare(`
    INSERT INTO practice_logs
      (user_id, instrument_id, started_at, ended_at, duration_minutes, status, source, notes)
    VALUES (?, ?, ?, ?, ?, 'manual_fix', 'manual_edit', ?)
  `).run(user_id, instrument_id, started_at, ended_at, duration, notes || null)
  res.json({ ok: true })
})

// ── Serve built frontend in production ───────────────────────────────────────
const DIST = path.join(__dirname, '..', 'dashboard', 'dist')
app.use(express.static(DIST))
app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`API server → http://localhost:${PORT}`)
})
