import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://juprshkatrbehijqjucr.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_fWe58zxSaV-DbxLJAxDgDw_L7yV2B0F'

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const app = express()
app.use(cors())
app.use(express.json())

function pad(n) { return String(n).padStart(2, '0') }
const EASTERN_TZ = 'America/New_York'

function easternParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date)

  const get = (type) => parts.find((p) => p.type === type)?.value
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
    weekday: weekdayMap[get('weekday')],
  }
}

function nowStr() {
  const d = easternParts()
  return `${d.year}-${d.month}-${d.day} ${d.hour}:${d.minute}:${d.second}`
}
function todayStr() {
  const d = easternParts()
  return `${d.year}-${d.month}-${d.day}`
}
function weekStartStr() {
  const d = easternParts()
  const shifted = new Date(Date.UTC(Number(d.year), Number(d.month) - 1, Number(d.day)))
  const diff = shifted.getUTCDate() - d.weekday + (d.weekday === 0 ? -6 : 1)
  shifted.setUTCDate(diff)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}
function calcDuration(started_at, ended_at) {
  const ms = new Date(ended_at.replace(' ', 'T')) - new Date(started_at.replace(' ', 'T'))
  return Math.round((ms / 60000) * 100) / 100
}
function normalizeLogRow(row) {
  return {
    ...row,
    user_name: row.users?.name || null,
    instrument_name: row.instruments?.name || null,
  }
}
function rangeForDate(dateStr) {
  return { start: `${dateStr} 00:00:00`, end: `${dateStr} 23:59:59` }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/summary', async (_req, res) => {
  try {
    const today = todayStr()
    const weekStart = weekStartStr()
    const todayRange = rangeForDate(today)
    const weekRange = { start: `${weekStart} 00:00:00`, end: `${today} 23:59:59` }

    const [todayLogsRes, weeklyDetailsRes, openSessionsRes, flaggedRes] = await Promise.all([
      supabase
        .from('practice_logs')
        .select('*, users(name), instruments(name)')
        .gte('started_at', todayRange.start)
        .lte('started_at', todayRange.end)
        .order('started_at', { ascending: false }),
      supabase
        .from('practice_logs')
        .select('id, user_id, instrument_id, started_at, ended_at, duration_minutes, status, users(name), instruments(name)')
        .gte('started_at', weekRange.start)
        .lte('started_at', weekRange.end)
        .order('started_at', { ascending: false }),
      supabase
        .from('active_sessions')
        .select('*, users(name), instruments(name)')
        .order('started_at', { ascending: true }),
      supabase
        .from('practice_logs')
        .select('*, users(name), instruments(name)')
        .in('status', ['auto_closed', 'suspicious', 'manual_fix'])
        .order('started_at', { ascending: false })
        .limit(50),
    ])

    for (const r of [todayLogsRes, weeklyDetailsRes, openSessionsRes, flaggedRes]) {
      if (r.error) throw r.error
    }

    const todayLogs = (todayLogsRes.data || []).map(normalizeLogRow)
    const weeklyDetails = (weeklyDetailsRes.data || []).map(normalizeLogRow)
    const openSessions = (openSessionsRes.data || []).map((row) => ({
      ...row,
      user_name: row.users?.name || null,
      instrument_name: row.instruments?.name || null,
    }))
    const flagged = (flaggedRes.data || []).map(normalizeLogRow)

    const weeklyMap = new Map()
    for (const row of weeklyDetails) {
      const key = `${row.user_id}::${row.instrument_id}`
      if (!weeklyMap.has(key)) {
        weeklyMap.set(key, {
          user_name: row.user_name,
          instrument_name: row.instrument_name,
          total_minutes: 0,
          session_count: 0,
        })
      }
      const agg = weeklyMap.get(key)
      agg.total_minutes += Number(row.duration_minutes || 0)
      agg.session_count += 1
    }
    const weekly = Array.from(weeklyMap.values())
      .map((r) => ({ ...r, total_minutes: Math.round(r.total_minutes * 10) / 10 }))
      .sort((a, b) => b.total_minutes - a.total_minutes)

    res.json({ today, weekStart, todayLogs, weekly, weeklyDetails, openSessions, flagged })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load summary' })
  }
})

app.get('/api/logs/day/:date', async (req, res) => {
  try {
    const { start, end } = rangeForDate(req.params.date)
    const { data, error } = await supabase
      .from('practice_logs')
      .select('*, users(name), instruments(name)')
      .gte('started_at', start)
      .lte('started_at', end)
      .order('started_at', { ascending: false })
    if (error) throw error
    res.json((data || []).map(normalizeLogRow))
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load logs' })
  }
})

app.get('/api/logs', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '1000', 10), 1), 5000)
    const { data, error } = await supabase
      .from('practice_logs')
      .select('*, users(name), instruments(name)')
      .order('started_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    res.json((data || []).map(normalizeLogRow))
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load logs' })
  }
})

app.get('/api/users', async (_req, res) => {
  const { data, error } = await supabase.from('users').select('*').order('name', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

app.post('/api/users', async (req, res) => {
  const { name, qr_payload } = req.body
  if (!name || !qr_payload) return res.status(400).json({ error: 'name and qr_payload required' })
  const { data, error } = await supabase
    .from('users')
    .insert({ name: name.trim(), qr_payload: qr_payload.trim() })
    .select('id')
    .single()
  if (error) return res.status(409).json({ error: error.message })
  res.json({ ok: true, id: data.id })
})

app.get('/api/instruments', async (_req, res) => {
  let { data, error } = await supabase.from('instruments').select('*').order('name', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  if (!data || data.length === 0) {
    await supabase.from('instruments').insert({ name: 'piano' })
    const refetch = await supabase.from('instruments').select('*').order('name', { ascending: true })
    if (refetch.error) return res.status(500).json({ error: refetch.error.message })
    data = refetch.data
  }
  res.json(data || [])
})

app.post('/api/instruments', async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const { data, error } = await supabase
    .from('instruments')
    .insert({ name: name.trim() })
    .select('id')
    .single()
  if (error) return res.status(409).json({ error: error.message })
  res.json({ ok: true, id: data.id })
})

app.get('/api/logs/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('practice_logs')
    .select('*, users(name), instruments(name)')
    .eq('id', req.params.id)
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Not found' })
  res.json(normalizeLogRow(data))
})

app.put('/api/logs/:id', async (req, res) => {
  const { started_at, ended_at, notes } = req.body
  const duration = calcDuration(started_at, ended_at)
  const { error } = await supabase
    .from('practice_logs')
    .update({
      started_at,
      ended_at,
      duration_minutes: duration,
      status: 'manual_fix',
      source: 'manual_edit',
      notes: notes || null,
    })
    .eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

app.post('/api/logs/:id/approve', async (req, res) => {
  const { error } = await supabase.from('practice_logs').update({ status: 'complete' }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

app.delete('/api/logs/:id', async (req, res) => {
  const { error } = await supabase.from('practice_logs').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

const cooldowns = new Map()
const COOLDOWN_MS = 5000

app.post('/api/scan', async (req, res) => {
  try {
    const { payload } = req.body
    if (!payload) return res.status(400).json({ error: 'payload required' })

    const last = cooldowns.get(payload) || 0
    const nowMs = Date.now()
    if (nowMs - last < COOLDOWN_MS) {
      return res.json({ action: 'cooldown_skip', message: 'Hold on a moment...' })
    }
    cooldowns.set(payload, nowMs)

    const parts = Object.fromEntries(payload.split('|').map((p) => {
      const [k, ...v] = p.split(':')
      return [k, v.join(':')]
    }))
    const userName = parts.user
    const instrumentName = parts.instrument || 'piano'
    if (!userName) return res.status(400).json({ error: 'Invalid QR payload - expected user:name' })

    const now = nowStr()

    let user = null
    const byPayload = await supabase.from('users').select('*').eq('qr_payload', payload).maybeSingle()
    if (byPayload.error) throw byPayload.error
    user = byPayload.data

    if (!user) {
      const byName = await supabase.from('users').select('*').ilike('name', userName).maybeSingle()
      if (byName.error) throw byName.error
      user = byName.data
      if (!user) {
        const inserted = await supabase.from('users').insert({ name: userName, qr_payload: payload }).select('*').single()
        if (inserted.error) throw inserted.error
        user = inserted.data
      }
    }

    let instrument = null
    const byInstrumentName = await supabase.from('instruments').select('*').ilike('name', instrumentName).maybeSingle()
    if (byInstrumentName.error) throw byInstrumentName.error
    instrument = byInstrumentName.data
    if (!instrument) {
      const insertedInstrument = await supabase.from('instruments').insert({ name: instrumentName }).select('*').single()
      if (insertedInstrument.error) throw insertedInstrument.error
      instrument = insertedInstrument.data
    }

    const activeRes = await supabase
      .from('active_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('instrument_id', instrument.id)
      .maybeSingle()
    if (activeRes.error) throw activeRes.error
    const active = activeRes.data

    if (!active) {
      const startInsert = await supabase.from('active_sessions').insert({
        user_id: user.id,
        instrument_id: instrument.id,
        started_at: now,
      })
      if (startInsert.error) throw startInsert.error

      const scanInsert = await supabase.from('scan_events').insert({
        raw_payload: payload,
        user_id: user.id,
        instrument_id: instrument.id,
        scanned_at: now,
        action: 'start',
      })
      if (scanInsert.error) throw scanInsert.error

      return res.json({ action: 'start', message: `${user.name} started ${instrument.name}`, user: user.name, instrument: instrument.name })
    }

    const durationMin = (new Date(now.replace(' ', 'T')) - new Date(active.started_at.replace(' ', 'T'))) / 60000
    const status = durationMin < 1 ? 'suspicious' : 'complete'
    const rounded = Math.round(durationMin * 100) / 100

    const logInsert = await supabase.from('practice_logs').insert({
      user_id: user.id,
      instrument_id: instrument.id,
      started_at: active.started_at,
      ended_at: now,
      duration_minutes: rounded,
      status,
      source: 'scan',
    })
    if (logInsert.error) throw logInsert.error

    const activeDelete = await supabase.from('active_sessions').delete().eq('id', active.id)
    if (activeDelete.error) throw activeDelete.error

    const endScanInsert = await supabase.from('scan_events').insert({
      raw_payload: payload,
      user_id: user.id,
      instrument_id: instrument.id,
      scanned_at: now,
      action: 'end',
    })
    if (endScanInsert.error) throw endScanInsert.error

    const mins = Math.round(durationMin)
    return res.json({ action: 'end', message: `${user.name} ended ${instrument.name} - ${mins} min`, user: user.name, instrument: instrument.name, duration: mins, status })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Scan failed' })
  }
})

app.post('/api/logs', async (req, res) => {
  const { user_id, instrument_id, started_at, ended_at, notes } = req.body
  const duration = calcDuration(started_at, ended_at)
  const { error } = await supabase.from('practice_logs').insert({
    user_id,
    instrument_id,
    started_at,
    ended_at,
    duration_minutes: duration,
    status: 'manual_fix',
    source: 'manual_edit',
    notes: notes || null,
  })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default app
