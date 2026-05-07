import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import jsQR from 'jsqr'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Music2, RefreshCw, Plus, Clock, TriangleAlert, CheckCircle2,
  CalendarDays, X, Trash2, ScanLine, ChevronDown, CheckCheck, Trophy, History, Settings,
} from 'lucide-react'
import { apiUrl } from '@/lib/api'
import { cameraAvailableInBrowser, insecureCameraHint } from '@/lib/camera'
import SettingsModal from '@/components/SettingsModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(dt) { return dt ? dt.slice(11, 16) : '—' }
function fmtDate(dt) { return dt ? dt.slice(0, 10) : '—' }
function fmtDuration(min) {
  if (!min && min !== 0) return '—'
  if (min < 60) return `${Math.round(min)} min`
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`
}

function toInputDt(dt) { return dt ? dt.slice(0, 16).replace(' ', 'T') : '' }
function toDbDt(dt)    { return dt ? dt.replace('T', ' ') + ':00' : '' }
function dateOnly(dt) {
  if (!dt) return null
  return String(dt).slice(0, 10)
}
function getMaxStreak(dateSet) {
  const dates = Array.from(dateSet || []).sort()
  if (dates.length === 0) return 0
  let best = 1
  let run = 1
  for (let i = 1; i < dates.length; i += 1) {
    const prev = new Date(`${dates[i - 1]}T00:00:00`)
    const curr = new Date(`${dates[i]}T00:00:00`)
    const diffDays = Math.round((curr - prev) / 86400000)
    if (diffDays === 1) run += 1
    else run = 1
    if (run > best) best = run
  }
  return best
}

const STATUS_BADGE = {
  complete:   'success',
  auto_closed:'warning',
  suspicious: 'destructive',
  manual_fix: 'info',
  open:       'purple',
}

function StatusBadge({ status }) {
  return (
    <Badge variant={STATUS_BADGE[status] || 'outline'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

function SectionHeader({ icon, title, className = '' }) {
  return (
    <div className={`flex items-center gap-2 mb-3 ${className}`}>
      {icon && <span className="w-4 h-4 text-primary drop-shadow-sm">{icon}</span>}
      <h2 className="text-xs font-semibold uppercase tracking-widest text-foreground/80">
        {title}
      </h2>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <p className="text-sm text-muted-foreground text-center py-8 border rounded-xl border-dashed">
      {text}
    </p>
  )
}

// ── Dialog shell ─────────────────────────────────────────────────────────────

function ModalShell({ open, onClose, title, subtitle, children }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl border bg-card p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Title className="font-semibold text-base">{title}</Dialog.Title>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5 mb-4">{subtitle}</p>
          )}
          {children}
          <Dialog.Close asChild>
            <button className="absolute right-4 top-4 rounded-sm opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring transition-opacity">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({ log, onClose, onSave, onDelete }) {
  const [startedAt, setStartedAt] = useState(toInputDt(log.started_at))
  const [endedAt,   setEndedAt]   = useState(toInputDt(log.ended_at))
  const [notes,     setNotes]     = useState(log.notes || '')

  function handleSave() {
    onSave(log.id, {
      started_at: toDbDt(startedAt),
      ended_at:   toDbDt(endedAt),
      notes,
    })
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Edit Session"
      subtitle={`${log.user_name} · ${log.instrument_name}`}
    >
      <div className="space-y-4 mt-2">
        <div>
          <Label htmlFor="edit-start">Started At</Label>
          <Input id="edit-start" type="datetime-local" value={startedAt}
            onChange={e => setStartedAt(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="edit-end">Ended At</Label>
          <Input id="edit-end" type="datetime-local" value={endedAt}
            onChange={e => setEndedAt(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="edit-notes">Notes</Label>
          <Textarea id="edit-notes" value={notes} rows={3}
            placeholder="Optional notes…"
            onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t">
        <Button variant="destructive" size="sm" onClick={() => onDelete(log.id)}>
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save changes</Button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Add dialog ────────────────────────────────────────────────────────────────

function AddDialog({ users, instruments, onClose, onAdd }) {
  const now = new Date()
  const nowLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16)

  const [userId,       setUserId]       = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [startedAt,    setStartedAt]    = useState(nowLocal)
  const [endedAt,      setEndedAt]      = useState(nowLocal)
  const [notes,        setNotes]        = useState('')

  const valid = userId && instrumentId && startedAt && endedAt

  function handleAdd() {
    if (!valid) return
    onAdd({
      user_id:       parseInt(userId),
      instrument_id: parseInt(instrumentId),
      started_at:    toDbDt(startedAt),
      ended_at:      toDbDt(endedAt),
      notes,
    })
  }

  const selectCls =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <ModalShell open onClose={onClose} title="Add Missed Session">
      <div className="space-y-4 mt-2">
        <div>
          <Label>Person</Label>
          <select value={userId} onChange={e => setUserId(e.target.value)} className={selectCls}>
            <option value="">Select person…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Instrument</Label>
          <select value={instrumentId} onChange={e => setInstrumentId(e.target.value)} className={selectCls}>
            <option value="">Select instrument…</option>
            {instruments.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Started At</Label>
            <Input type="datetime-local" value={startedAt}
              onChange={e => setStartedAt(e.target.value)} />
          </div>
          <div>
            <Label>Ended At</Label>
            <Input type="datetime-local" value={endedAt}
              onChange={e => setEndedAt(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea value={notes} rows={2} placeholder="Optional notes…"
            onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} disabled={!valid}>Add Session</Button>
      </div>
    </ModalShell>
  )
}

// ── Scanner modal ─────────────────────────────────────────────────────────────

function ScannerModal({ onClose, onScanned }) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const rafRef      = useRef(null)
  const clientCooldown = useRef({}) // payload → timestamp, prevents hammering while card is held still

  const [status,     setStatus]     = useState('Starting camera…')
  const [lastResult, setLastResult] = useState(null)
  const [camError,   setCamError]   = useState(null)

  const stop = useCallback(() => {
    if (rafRef.current)    cancelAnimationFrame(rafRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        if (!cameraAvailableInBrowser()) {
          setCamError(
            insecureCameraHint() ||
              'Camera isn’t available in this tab (wrong URL or unsupported browser).',
          )
          return
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStatus('Point camera at a QR card')
        tick()
      } catch (e) {
        setCamError(e.message)
      }
    }

    function tick() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || cancelled) return

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, 0, 0)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' })
        if (code) handleCode(code.data)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    start()
    return () => { cancelled = true; stop() }
  }, [stop])

  async function handleCode(payload) {
    const now = Date.now()
    if ((now - (clientCooldown.current[payload] || 0)) < 3000) return
    clientCooldown.current[payload] = now

    try {
      const res = await fetch(await apiUrl('/api/scan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      })
      const data = await res.json()
      if (data.action === 'cooldown_skip') return

      setLastResult(data)
      setStatus(data.message)
      onScanned?.()

      // Auto-close after showing the result briefly
      setTimeout(() => { stop(); onClose() }, 1800)
    } catch {
      setStatus('Network error — try again')
    }
  }

  const resultColor =
    lastResult?.action === 'start' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
    lastResult?.action === 'end'   ? 'bg-blue-50  text-blue-700  dark:bg-blue-900/30  dark:text-blue-300'  :
    'bg-muted text-muted-foreground'

  return (
    <ModalShell open onClose={() => { stop(); onClose() }} title="Scan QR Card">
      <div className="mt-2 space-y-3">

        {camError ? (
          <div className="rounded-lg bg-destructive/10 text-destructive px-4 py-6 text-sm text-center space-y-1">
            <p className="font-medium">Camera unavailable</p>
            <p className="text-xs opacity-90 leading-relaxed">{camError}</p>
            {!insecureCameraHint() ? (
              <p className="text-xs opacity-60 mt-2">Allow camera access in your browser settings.</p>
            ) : (
              <p className="text-xs opacity-60 mt-2">After switching to HTTPS, accept the certificate warning once for localhost dev.</p>
            )}
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />

            {/* Corner-bracket scan zone */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-52 h-52">
                <span className="absolute top-0 left-0 block w-7 h-7 border-t-[3px] border-l-[3px] border-green-400 rounded-tl-md" />
                <span className="absolute top-0 right-0 block w-7 h-7 border-t-[3px] border-r-[3px] border-green-400 rounded-tr-md" />
                <span className="absolute bottom-0 left-0 block w-7 h-7 border-b-[3px] border-l-[3px] border-green-400 rounded-bl-md" />
                <span className="absolute bottom-0 right-0 block w-7 h-7 border-b-[3px] border-r-[3px] border-green-400 rounded-br-md" />
                {/* Scanning line animation */}
                <span className="absolute inset-x-1 top-1/2 h-0.5 bg-green-400/70 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        {/* Status bar */}
        <div className={`rounded-lg px-4 py-3 text-sm font-medium text-center transition-colors ${resultColor}`}>
          {status}
        </div>

        {lastResult && lastResult.action !== 'cooldown_skip' && (
          <div className="text-xs text-center text-muted-foreground">
            {lastResult.action === 'start'
              ? 'Scan the same card again to end the session.'
              : `Session saved · ${lastResult.duration ?? 0} min`}
          </div>
        )}
      </div>

      <div className="flex justify-center mt-4">
        <Button variant="outline" onClick={() => { stop(); onClose() }}>
          Stop Scanning
        </Button>
      </div>
    </ModalShell>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

const GRADES = [
  { min: 300, label: 'S',  desc: 'Champion',  bar: 'bg-yellow-400',  card: 'border-yellow-300/60 bg-yellow-50/40 dark:bg-yellow-900/10',  badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  { min: 150, label: 'A',  desc: 'Star',      bar: 'bg-green-400',   card: 'border-green-200/60  bg-green-50/40  dark:bg-green-900/10',   badge: 'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-300'  },
  { min: 60,  label: 'B',  desc: 'On Track',  bar: 'bg-blue-400',    card: 'border-blue-200/60   bg-blue-50/40   dark:bg-blue-900/10',    badge: 'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300'   },
  { min: 20,  label: 'C',  desc: 'Building',  bar: 'bg-orange-400',  card: 'border-orange-200/60 bg-orange-50/40 dark:bg-orange-900/10',  badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  { min: 1,   label: 'D',  desc: 'Starting',  bar: 'bg-red-400',     card: 'border-red-200/60    bg-red-50/40    dark:bg-red-900/10',     badge: 'bg-red-100    text-red-700    dark:bg-red-900/40    dark:text-red-300'    },
  { min: 0,   label: '—',  desc: 'No sessions', bar: 'bg-muted',     card: 'border-border',                                               badge: 'bg-muted text-muted-foreground' },
]

const MEDALS = ['🥇', '🥈', '🥉']
const LEADERBOARD_MODES = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
]
const AWARD_GUIDE = [
  {
    id: 'daily-spark',
    title: 'Daily Spark',
    emoji: '✨',
    description: 'Practiced at least a 15-minute session today',
    check: ({ todayLongestSession }) => todayLongestSession >= 15,
  },
  {
    id: 'balanced-player',
    title: 'Balanced Player',
    emoji: '🎼',
    description: 'Practiced multiple instruments',
    check: ({ instrumentCount }) => instrumentCount >= 2,
  },
  {
    id: 'consistency-star',
    title: 'Consistency Star',
    emoji: '🌟',
    description: 'Practiced 3 days in a row',
    check: ({ maxStreak }) => maxStreak >= 3,
  },
  {
    id: 'focus-hero',
    title: 'Focus Hero',
    emoji: '🎯',
    description: 'Had a practice session that lasted 30+ minutes',
    check: ({ longestSession }) => longestSession >= 30,
  },
  {
    id: 'practice-pals',
    title: 'Practice Pals',
    emoji: '🤝',
    description: 'All 3 people practiced on the same day',
    check: ({ allThreePracticedSameDay }) => allThreePracticedSameDay,
  },
  {
    id: 'marathon-master',
    title: 'Marathon Master',
    emoji: '🏃',
    description: 'Practiced on 5+ days this week',
    check: ({ daysCount }) => daysCount >= 5,
  },
]

function getGrade(minutes) {
  return GRADES.find(g => minutes >= g.min) ?? GRADES.at(-1)
}

function Leaderboard({ ranked, awardsByName }) {
  const max    = ranked[0]?.total || 1

  return (
    <div className="space-y-2.5">
      {ranked.map((person, i) => {
        const grade = getGrade(person.total)
        const pct   = Math.round((person.total / max) * 100)
        const medal = MEDALS[i]
        return (
          <div key={person.name} className={`rounded-2xl border p-4 shadow-sm backdrop-blur-sm ${grade.card}`}>
            <div className="flex items-center gap-3">
              {/* Rank */}
              <div className="w-8 shrink-0 text-center">
                {medal
                  ? <span className="text-xl">{medal}</span>
                  : <span className="text-sm font-bold text-muted-foreground">#{i + 1}</span>
                }
              </div>

              {/* Info + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{person.name}</span>
                      {(awardsByName.get(person.name) || []).map((award) => (
                        <Badge
                          key={award.id}
                          variant="outline"
                          className="text-[10px] h-5 px-1.5 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700/40"
                          title={award.description}
                        >
                          {award.emoji} {award.title}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">
                      {person.instruments.join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold tabular-nums text-primary">{fmtDuration(person.total)}</span>
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-bold ${grade.badge}`}
                        title={grade.desc}
                      >
                        {grade.label}
                      </span>
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${grade.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">{person.sessions} session{person.sessions !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      <div className="mt-4 border-t pt-3">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Award Guide</h3>
        <div className="flex flex-wrap gap-2">
          {GRADES.slice(0, 4).map((g) => (
            <span
              key={g.label}
              className={`text-xs px-2 py-0.5 rounded font-medium ${g.badge}`}
              title={g.desc}
            >
              {g.label}
            </span>
          ))}
          {AWARD_GUIDE.map((award) => (
            <details
              key={award.id}
              className="group rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium dark:border-green-700/40 dark:bg-green-900/20"
            >
              <summary className="cursor-pointer list-none">
                {award.emoji} {award.title} <span className="text-[10px] opacity-60">i</span>
              </summary>
              <p className="mt-1 text-[10px] text-muted-foreground">{award.description}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Awards ────────────────────────────────────────────────────────────────────

function buildKidAwards(rows, todayLogs) {
  const details = rows || []
  const today = todayLogs || []
  const perUser = new Map()
  const peopleByDay = new Map()

  for (const row of details) {
    const key = row.user_name || 'Unknown'
    if (!perUser.has(key)) {
      perUser.set(key, {
        name: key,
        todayMinutes: 0,
        totalMinutes: 0,
        daysSet: new Set(),
        instrumentsSet: new Set(),
        longestSession: 0,
        sessionCount: 0,
      })
    }

    const user = perUser.get(key)
    const mins = Number(row.duration_minutes || 0)
    const day = dateOnly(row.started_at)

    user.longestSession = Math.max(user.longestSession, mins)
    user.totalMinutes += mins
    user.sessionCount += 1
    if (day) {
      user.daysSet.add(day)
      if (!peopleByDay.has(day)) peopleByDay.set(day, new Set())
      peopleByDay.get(day).add(key)
    }
    if (row.instrument_name) user.instrumentsSet.add(row.instrument_name)
  }

  for (const row of today) {
    const key = row.user_name || 'Unknown'
    if (!perUser.has(key)) {
      perUser.set(key, {
        name: key,
        todayMinutes: 0,
        totalMinutes: 0,
        daysSet: new Set(),
        instrumentsSet: new Set(),
        longestSession: 0,
        sessionCount: 0,
      })
    }
    const user = perUser.get(key)
    const mins = Number(row.duration_minutes || 0)
    const day = dateOnly(row.started_at) || dateOnly(new Date().toISOString())
    user.todayMinutes += mins
    user.todayLongestSession = Math.max(user.todayLongestSession || 0, mins)
    if (day) {
      user.daysSet.add(day)
      if (!peopleByDay.has(day)) peopleByDay.set(day, new Set())
      peopleByDay.get(day).add(key)
    }
  }
  const allThreePracticedSameDay = Array.from(peopleByDay.values()).some((set) => set.size >= 3)

  return Array.from(perUser.values())
    .map((u) => {
      const profile = {
        ...u,
        maxStreak: getMaxStreak(u.daysSet),
        daysCount: u.daysSet.size,
        instrumentCount: u.instrumentsSet.size,
        allThreePracticedSameDay,
      }
      const earned = AWARD_GUIDE.filter((a) => a.check(profile))
      return { ...profile, earned }
    })
    .sort((a, b) => b.earned.length - a.earned.length || b.sessionCount - a.sessionCount)
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [summary,       setSummary]       = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [editLog,       setEditLog]       = useState(null)
  const [showAdd,       setShowAdd]       = useState(false)
  const [showScanner,   setShowScanner]   = useState(false)
  const [users,         setUsers]         = useState([])
  const [instruments,   setInstruments]   = useState([])
  const [expandedWeekly, setExpandedWeekly] = useState(new Set())
  const [showSettings, setShowSettings] = useState(false)
  const [leaderMode, setLeaderMode] = useState('week')

  useEffect(() => { refresh() }, [])

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch(await apiUrl('/api/summary'))
      setSummary(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function loadRoster() {
    const [uRes, iRes] = await Promise.all([
      fetch(await apiUrl('/api/users')),
      fetch(await apiUrl('/api/instruments')),
    ])
    setUsers(await uRes.json())
    setInstruments(await iRes.json())
  }

  async function openAdd() {
    await loadRoster()
    setShowAdd(true)
  }

  async function saveEdit(id, data) {
    await fetch(await apiUrl(`/api/logs/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setEditLog(null)
    refresh()
  }

  async function deleteLog(id) {
    if (!confirm('Delete this session?')) return
    await fetch(await apiUrl(`/api/logs/${id}`), { method: 'DELETE' })
    setEditLog(null)
    refresh()
  }

  async function approveLog(id) {
    await fetch(await apiUrl(`/api/logs/${id}/approve`), { method: 'POST' })
    refresh()
  }

  async function addLog(data) {
    await fetch(await apiUrl('/api/logs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setShowAdd(false)
    refresh()
  }

  const leaderboardRanked = useMemo(() => {
    const sourceRows =
      leaderMode === 'day' ? (summary?.todayLogs || []).map((row) => ({
        user_name: row.user_name,
        instrument_name: row.instrument_name,
        total_minutes: Number(row.duration_minutes || 0),
        session_count: 1,
      })) :
      leaderMode === 'month' ? (summary?.monthly || []) :
      (summary?.weekly || [])

    const map = {}
    for (const row of sourceRows) {
      if (!map[row.user_name]) map[row.user_name] = { name: row.user_name, total: 0, instruments: [], sessions: 0 }
      map[row.user_name].total += Number(row.total_minutes || 0)
      map[row.user_name].sessions += Number(row.session_count || 0)
      if (row.instrument_name) map[row.user_name].instruments.push(row.instrument_name)
    }

    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [summary, leaderMode])

  const leaderboardAwardsByName = useMemo(() => {
    const detailsRows =
      leaderMode === 'day' ? (summary?.todayLogs || []) :
      leaderMode === 'month' ? (summary?.monthlyDetails || []) :
      (summary?.weeklyDetails || [])
    return new Map(buildKidAwards(detailsRows, summary?.todayLogs || []).map((u) => [u.name, u.earned]))
  }, [summary, leaderMode])

  return (
    <div className="min-h-screen bg-background/70">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b bg-card/70 backdrop-blur-xl shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-md">
              <Music2 className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-none">Practice Tracker</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {summary?.today || '…'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setShowScanner(true)}
              className="bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-md hover:brightness-110"
            >
              <ScanLine className="w-3.5 h-3.5 animate-pulse" />
              Scan
            </Button>
            <Button variant="outline" size="sm" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5" />
              Add Session
            </Button>
          </div>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-5 space-y-6">

        {/* Currently Practicing */}
        {summary?.openSessions?.length > 0 && (
          <section>
            <SectionHeader icon={<Clock />} title="Currently Practicing" />
            <Card>
              <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.openSessions.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.user_name}</TableCell>
                      <TableCell>{s.instrument_name}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {fmtTime(s.started_at)}
                      </TableCell>
                      <TableCell><StatusBadge status="open" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {/* Today's Sessions */}
          <section>
            <SectionHeader icon={<CheckCircle2 />} title="Today's Sessions" />
            {summary?.todayLogs?.length > 0 ? (
              <Card>
                <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Instrument</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.todayLogs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.user_name}</TableCell>
                        <TableCell>{log.instrument_name}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {fmtTime(log.started_at)}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {fmtTime(log.ended_at)}
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {fmtDuration(log.duration_minutes)}
                        </TableCell>
                        <TableCell><StatusBadge status={log.status} /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setEditLog(log)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              !loading && <EmptyState text="No sessions logged today." />
            )}
          </section>

          {/* Leaderboard */}
          <section>
            <SectionHeader
              icon={<Trophy />}
              title={`Leaderboard — ${
                leaderMode === 'day' ? 'Today' : leaderMode === 'week' ? `This Week${summary?.weekStart ? ` (${summary.weekStart} →)` : ''}` : `This Month${summary?.monthStart ? ` (${summary.monthStart} →)` : ''}`
              }`}
            />
            <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-xl bg-muted/60 p-1">
              {LEADERBOARD_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setLeaderMode(mode.id)}
                  className={`rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
                    leaderMode === mode.id
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {leaderboardRanked.length > 0
              ? <Leaderboard ranked={leaderboardRanked} awardsByName={leaderboardAwardsByName} />
              : !loading && <EmptyState text={leaderMode === 'day' ? 'No sessions today yet.' : leaderMode === 'week' ? 'No sessions this week yet.' : 'No sessions this month yet.'} />
            }
          </section>
        </div>

        <section>
          <SectionHeader
            icon={<CalendarDays />}
            title={`This Week${summary?.weekStart ? ` (${summary.weekStart} →)` : ''}`}
          />
          {summary?.weekly?.length > 0 ? (
            <Card>
              <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Total Time</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.weekly.map((row, i) => {
                    const key = `${row.user_name}||${row.instrument_name}`
                    const expanded = expandedWeekly.has(key)
                    const sessions = (summary.weeklyDetails || []).filter(
                      s => s.user_name === row.user_name && s.instrument_name === row.instrument_name
                    )
                    return (
                      <>
                        <TableRow
                          key={key}
                          className="cursor-pointer select-none"
                          onClick={() => setExpandedWeekly(prev => {
                            const next = new Set(prev)
                            expanded ? next.delete(key) : next.add(key)
                            return next
                          })}
                        >
                          <TableCell className="font-medium">{row.user_name}</TableCell>
                          <TableCell>{row.instrument_name}</TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {row.session_count}
                          </TableCell>
                          <TableCell className="font-semibold tabular-nums">
                            {fmtDuration(row.total_minutes)}
                          </TableCell>
                          <TableCell className="text-right pr-2">
                            <ChevronDown
                              className={`w-4 h-4 text-muted-foreground inline transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                            />
                          </TableCell>
                        </TableRow>

                        {expanded && sessions.map(s => (
                          <TableRow key={s.id} className="bg-muted/30 hover:bg-muted/40">
                            <TableCell />
                            <TableCell colSpan={2} className="text-xs text-muted-foreground pl-3 tabular-nums">
                              {fmtDate(s.started_at)} &nbsp;·&nbsp; {fmtTime(s.started_at)} – {fmtTime(s.ended_at)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {fmtDuration(s.duration_minutes)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={s.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          ) : (
            !loading && <EmptyState text="No sessions this week yet." />
          )}
        </section>

        {/* Flagged */}
        {summary?.flagged?.length > 0 && (
          <section>
            <SectionHeader
              icon={<TriangleAlert />}
              title="Flagged — Needs Review"
              className="text-amber-600 dark:text-amber-400 [&>span]:text-amber-500"
            />
            <Card>
              <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.flagged.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.user_name}</TableCell>
                      <TableCell>{log.instrument_name}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {fmtDate(log.started_at)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtDuration(log.duration_minutes)}
                      </TableCell>
                      <TableCell><StatusBadge status={log.status} /></TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[8rem] truncate">
                        {log.notes || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="sm"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                            onClick={() => approveLog(log.id)}
                            title="Mark as complete"
                          >
                            <CheckCheck className="w-3.5 h-3.5" /> Approve
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditLog(log)}>
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        )}

        <section className="pt-2 flex justify-center">
          <Button
            onClick={() => window.location.assign('/admin/history')}
            className="bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:brightness-110"
          >
            <History className="w-4 h-4" />
            View Full History
          </Button>
        </section>

      </main>

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      {editLog && (
        <EditDialog
          log={editLog}
          onClose={() => setEditLog(null)}
          onSave={saveEdit}
          onDelete={deleteLog}
        />
      )}

      {showScanner && (
        <ScannerModal
          onClose={() => setShowScanner(false)}
          onScanned={refresh}
        />
      )}

      {showAdd && (
        <AddDialog
          users={users}
          instruments={instruments}
          onClose={() => setShowAdd(false)}
          onAdd={addLog}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => window.location.reload()}
        />
      )}

    </div>
  )
}
