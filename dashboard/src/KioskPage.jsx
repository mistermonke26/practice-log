import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { QrCode, Wifi, WifiOff, Clock3, Trophy, LoaderCircle, AlertTriangle, XCircle, CheckCircle2, Settings, CalendarDays } from 'lucide-react'
import { apiUrl, needsApiSetup } from '@/lib/api'
import { cameraAvailableInBrowser, insecureCameraHint } from '@/lib/camera'
import SettingsModal from '@/components/SettingsModal'


function pad(n) { return String(n).padStart(2, '0') }
function fmtDuration(mins) {
  const total = Math.max(0, Math.round(Number(mins || 0)))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return `${h}h ${m}m`
}
function formatClock(diffMs) {
  const seconds = Math.max(0, Math.floor(diffMs / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function statusCopy(scanState) {
  if (scanState === 'processing') return 'Recording Practice...'
  if (scanState === 'started') return 'Practice Started'
  if (scanState === 'ended') return 'Practice Ended'
  if (scanState === 'blocked') return 'Finish Current Session First'
  if (scanState === 'offline') return 'Scanner Offline'
  if (scanState === 'error') return 'Unable To Process Scan'
  return 'Ready to Scan'
}

function ScanOverlay({ onClose, onResult, setScanState }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const cooldownRef = useRef({})
  const [cameraError, setCameraError] = useState('')
  const processingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        if (!cameraAvailableInBrowser()) {
          setCameraError(
            insecureCameraHint() ||
              'Camera isn’t available in this tab (unsupported browser).',
          )
          return
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { min: 640, ideal: 1280 },
            height: { min: 480, ideal: 720 }
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        tick()
      } catch (error) {
        setCameraError(error.message || 'Camera unavailable')
      }
    }

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }

    let lastScanTime = 0
    function tick() {
      if (cancelled) return
      if (processingRef.current) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const now = Date.now()
      if (now - lastScanTime > 200) { // Scan 5 times per second
        const video = videoRef.current
        const canvas = canvasRef.current
        if (video?.readyState === video.HAVE_ENOUGH_DATA && canvas) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(video, 0, 0)
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' })
          if (code?.data) {
            submitScan(code.data)
          }
        }
        lastScanTime = now
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    async function submitScan(payload) {
      const now = Date.now()
      if ((now - (cooldownRef.current[payload] || 0)) < 3000) return
      cooldownRef.current[payload] = now

      processingRef.current = true
      setScanState('processing')

      try {
        const res = await fetch(await apiUrl('/api/scan'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload }),
        })
        const data = await res.json()
        if (data.action === 'cooldown_skip') {
          processingRef.current = false
          setScanState('ready')
          return
        }

        const mappedState =
          data.action === 'start' ? 'started' :
          data.action === 'end' ? 'ended' :
          data.action === 'blocked' ? 'blocked' :
          'error'

        setScanState(mappedState)
        onResult({ ...data, mappedState })

        // Success states close automatically after a short delay
        if (mappedState === 'started' || mappedState === 'ended') {
          setTimeout(() => {
            stop()
            onClose()
          }, 1500)
        } else {
          // Blocked or Error states: close immediately to show the Warning Modal
          stop()
          onClose()
        }
      } catch (error) {
        console.error('Scan error:', error)
        setScanState('error')
        onResult({ message: error.message || 'Network error', mappedState: 'error' })
        stop()
        onClose()
      } finally {
        processingRef.current = false
      }
    }

    start()
    return () => {
      cancelled = true
      stop()
    }
  }, [onClose, onResult, setScanState])

  return (
    <div className="fixed inset-0 z-50 bg-black/85 p-4 sm:p-8">
      <div className="mx-auto h-full w-full max-w-4xl rounded-3xl bg-black/50 border border-white/20 p-4 sm:p-6 flex flex-col">
        <div className="mb-3 text-white/90 text-sm flex items-center justify-between">
          <span>Scan QR Code</span>
          <button onClick={onClose} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs">Close</button>
        </div>
        {cameraError ? (
          <div className="flex-1 grid place-items-center text-red-200 text-center text-sm">{cameraError}</div>
        ) : (
          <div className="relative flex-1 overflow-hidden rounded-2xl">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="h-64 w-64 rounded-2xl border-4 border-blue-300/80" />
            </div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

// ── Awards Logic (Synced with Web Version) ───────────────────────────────────

const AWARDS_CONFIG = [
  {
    id: 'daily-spark',
    title: 'Daily Spark',
    emoji: '✨',
    description: 'Practiced at least 15 minutes today',
    check: ({ todayMinutes }) => todayMinutes >= 15,
  },
  {
    id: 'consistency-star',
    title: 'Consistency Star',
    emoji: '🌟',
    description: 'Practiced on 3+ different days this week',
    check: ({ weekDays }) => weekDays >= 3,
  },
  {
    id: 'focus-hero',
    title: 'Focus Hero',
    emoji: '🎯',
    description: 'Completed a 30+ minute session this week',
    check: ({ longestSession }) => longestSession >= 30,
  },
  {
    id: 'practice-pal',
    title: 'Practice Pal',
    emoji: '🤝',
    description: 'Completed 4+ sessions this week',
    check: ({ sessionCount }) => sessionCount >= 4,
  },
  {
    id: 'time-keeper',
    title: 'Time Keeper',
    emoji: '⏱️',
    description: 'Reached 2+ total practice hours this week',
    check: ({ totalMinutes }) => totalMinutes >= 120,
  },
  {
    id: 'instrument-explorer',
    title: 'Instrument Explorer',
    emoji: '🎼',
    description: 'Practiced 2+ instruments this week',
    check: ({ instrumentCount }) => instrumentCount >= 2,
  },
]

const GRADES_CONFIG = [
  { min: 300, label: 'S', desc: 'Champion', color: 'text-rose-500 border-rose-200 bg-rose-50' },
  { min: 150, label: 'A', desc: 'Star',     color: 'text-amber-500 border-amber-200 bg-amber-50' },
  { min: 60,  label: 'B', desc: 'On Track', color: 'text-blue-500 border-blue-200 bg-blue-50' },
  { min: 20,  label: 'C', desc: 'Building', color: 'text-emerald-500 border-emerald-200 bg-emerald-50' },
  { min: 1,   label: 'D', desc: 'Starting', color: 'text-slate-400 border-slate-200 bg-slate-50' },
  { min: 0,   label: '—', desc: 'Empty',    color: 'text-slate-300 border-slate-100 bg-slate-50' },
]

function getGrade(minutes) {
  return GRADES_CONFIG.find(g => minutes >= g.min) ?? GRADES_CONFIG.at(-1)
}

function buildKidAwards(summary) {
  const weeklyDetails = summary?.weeklyDetails || []
  const todayLogs = summary?.todayLogs || []
  const perUser = new Map()

  const fmtDate = (dt) => dt ? dt.slice(0, 10) : '—'

  for (const row of weeklyDetails) {
    const key = row.user_name || 'Unknown'
    if (!perUser.has(key)) {
      perUser.set(key, {
        name: key,
        todayMinutes: 0,
        totalMinutes: 0,
        weekDaysSet: new Set(),
        instrumentsSet: new Set(),
        longestSession: 0,
        sessionCount: 0,
      })
    }

    const user = perUser.get(key)
    const mins = Number(row.duration_minutes || 0)
    const day = fmtDate(row.started_at)

    user.longestSession = Math.max(user.longestSession, mins)
    user.totalMinutes += mins
    user.sessionCount += 1
    if (day !== '—') user.weekDaysSet.add(day)
    if (row.instrument_name) user.instrumentsSet.add(row.instrument_name)
  }

  for (const row of todayLogs) {
    const key = row.user_name || 'Unknown'
    if (!perUser.has(key)) {
      perUser.set(key, {
        name: key,
        todayMinutes: 0,
        totalMinutes: 0,
        weekDaysSet: new Set(),
        instrumentsSet: new Set(),
        longestSession: 0,
        sessionCount: 0,
      })
    }
    const user = perUser.get(key)
    user.todayMinutes += Number(row.duration_minutes || 0)
  }

  return Array.from(perUser.values()).map((u) => {
    const profile = {
      ...u,
      weekDays: u.weekDaysSet.size,
      instrumentCount: u.instrumentsSet.size,
    }
    const earned = AWARDS_CONFIG.filter((a) => a.check(profile))
    return { ...profile, earned }
  })
}

export default function KioskPage() {
  const [summary, setSummary] = useState(null)
  const [online, setOnline] = useState(false)
  const onlineRef = useRef(online)
  const [loading, setLoading] = useState(true)
  const [scanState, setScanState] = useState('ready')
  const [showScanner, setShowScanner] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [alert, setAlert] = useState(null) // { title, message, type: 'error' | 'success' | 'warning' }
  const [showSettings, setShowSettings] = useState(false)
  /** `no_tcp` = cannot load /api/ping; `db` = ping OK but /api/health failed (often Supabase from the Mac). */
  const [reachIssue, setReachIssue] = useState(null)

  useEffect(() => {
    onlineRef.current = online
  }, [online])

  const refresh = useCallback(async () => {
    try {
      setReachIssue(null)
      if (await needsApiSetup()) {
        setOnline(false)
        setScanState('offline')
        setReachIssue(null)
        setLoading(false)
        return
      }

      const pingFull = await apiUrl('/api/ping')
      try {
        const pingRes = await fetch(pingFull)
        const pingBody = await pingRes.json().catch(() => ({}))
        if (!pingRes.ok || pingBody.ok !== true) throw new Error('ping')
      } catch {
        console.warn('Practice server not reachable', pingFull)
        setReachIssue('no_tcp')
        setOnline(false)
        setScanState('offline')
        return
      }

      const healthRes = await fetch(await apiUrl('/api/health'))
      const health = await healthRes.json().catch(() => ({}))

      const healthOk = Boolean(health?.ok)

      setOnline(healthOk)
      if (!healthOk) {
        setReachIssue('db')
        setScanState('offline')
        console.warn('/api/health not ok:', health?.error || health)
        return
      }

      const summaryRes = await fetch(await apiUrl('/api/summary'))
      const data = await summaryRes.json()
      setSummary(data)
      setScanState((prev) => (prev === 'offline' ? 'ready' : prev))
    } catch (err) {
      console.error('Fetch error:', err)
      setReachIssue('no_tcp')
      setOnline(false)
      setScanState('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (await needsApiSetup()) {
        if (!cancelled) setShowSettings(true)
      }
    })()
    refresh()
    const poll = setInterval(refresh, 15000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      cancelled = true
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [refresh])

  const leaderboardTop3 = useMemo(() => {
    const kidAwards = buildKidAwards(summary)
    return kidAwards
      .map((kid) => ({
        name: kid.name,
        total: kid.totalMinutes,
        grade: getGrade(kid.totalMinutes),
        awards: kid.earned
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [summary])

  const maxLeaderMinutes = Math.max(1, ...leaderboardTop3.map((p) => p.total))
  const dateText = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const openScanner = useCallback(() => {
    if (!online || scanState === 'processing') return
    setShowScanner(true)
  }, [online, scanState])

  const closeScanner = useCallback(() => {
    setShowScanner(false)
  }, [])

  const onScanResult = useCallback((data) => {
    setLastResult(data)
    refresh()

    if (data.mappedState === 'blocked' || data.mappedState === 'error') {
      setAlert({
        title: data.mappedState === 'blocked' ? 'Scan Blocked' : 'Scan Error',
        message: data.message || 'An unexpected error occurred.',
        type: data.mappedState === 'blocked' ? 'warning' : 'error'
      })
    } else if (data.mappedState === 'started' || data.mappedState === 'ended') {
      // For success, we show a brief overlay instead of a persistent modal
      // This allows quick scanning for the next person
      setAlert({
        title: data.action === 'start' ? 'Practice Started!' : 'Practice Ended',
        message: data.message,
        type: 'success',
        autoClose: 2000
      })
    }

    setTimeout(() => {
      setScanState(onlineRef.current ? 'ready' : 'offline')
    }, 2500)
  }, [online, refresh])

  useEffect(() => {
    if (alert?.autoClose) {
      const timer = setTimeout(() => setAlert(null), alert.autoClose)
      return () => clearTimeout(timer)
    }
  }, [alert])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <main className="mx-auto max-w-3xl px-4 py-3 sm:px-8">
        <header className="mb-4 rounded-2xl bg-white px-5 py-3 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Practice Tracker</h1>
              <p className="text-xs text-slate-500 mt-0.5">{dateText}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="flex items-center justify-center rounded-full bg-slate-100 p-2 text-slate-500 active:bg-slate-200 transition"
                title="Server URL — set once per tablet"
              >
                <Settings className="h-4 w-4" />
              </button>
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                {online ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>
          {!online && !loading ? (
            <p className="mt-2 text-xs text-amber-700 font-medium">
              {reachIssue === 'db' ? (
                <>
                  The tablet reached your Mac/API, but <span className="font-bold">/api/health</span> failed
                  (often Supabase keys or outbound network from the PC). Fix env on the server and check logs.
                  {' '}
                  If you only typo’d the URL, open <span className="font-bold">Settings</span> — use{' '}
                  <span className="font-mono">http://192.168.x.x:3001</span> including <span className="font-mono">{'//'}</span>
                  after <span className="font-mono">http:</span>.
                </>
              ) : (
                <>
                  Can’t reach the API (nothing answered on <span className="font-mono">…/api/ping</span>).
                  Open <span className="font-bold">Settings ⚙</span> and set the URL —{' '}
                  <span className="font-bold">Vercel (recommended):</span>{' '}
                  <span className="font-mono text-[10px] break-all">https://your-app.vercel.app</span>{' '}
                  works anywhere with internet, no port needed. Or same Wi‑Fi LAN:{' '}
                  <span className="font-mono text-[10px]">http://192.168.x.x:3001</span>.
                  No trailing slash.
                </>
              )}
            </p>
          ) : null}
        </header>

        <section className="mb-6">
          <button
            onClick={openScanner}
            disabled={!online || scanState === 'processing'}
            className="w-full rounded-3xl bg-gradient-to-r from-blue-500 to-violet-600 px-6 py-8 text-white shadow-lg disabled:opacity-60 active:scale-[0.99] transition"
          >
            <div className="flex items-center justify-center gap-4">
              {scanState === 'processing'
                ? <LoaderCircle className="h-10 w-10 animate-spin" />
                : <QrCode className="h-10 w-10" />
              }
              <span className="text-3xl font-black uppercase tracking-tight">Scan QR Code</span>
            </div>
          </button>

          <div className="mt-4 flex items-center justify-center gap-4 text-center">
            <span className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-widest shadow-sm ${scanState === 'started' ? 'bg-green-100 text-green-700' : scanState === 'ended' ? 'bg-blue-100 text-blue-700' : scanState === 'blocked' ? 'bg-amber-100 text-amber-700' : scanState === 'offline' ? 'bg-red-100 text-red-700' : 'bg-white text-slate-500 border border-slate-200'}`}>
              {statusCopy(scanState)}
            </span>
            {lastResult?.message ? (
              <span className="text-sm text-slate-600 font-bold truncate max-w-[200px]">{lastResult.message}</span>
            ) : null}
          </div>
        </section>

        {/* ── Today's Summary ─────────────────────────────────────── */}
        {((summary?.todayLogs?.length || 0) > 0) ? (
          <section className="mb-4 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <CalendarDays className="h-4 w-4" />
              Today's Practice
            </div>
            <div className="space-y-1.5">
              {(() => {
                const byPerson = {}
                for (const log of (summary?.todayLogs || [])) {
                  const name = log.user_name || 'Unknown'
                  if (!byPerson[name]) byPerson[name] = { minutes: 0, sessions: 0, instruments: new Set() }
                  byPerson[name].minutes += Number(log.duration_minutes || 0)
                  byPerson[name].sessions += 1
                  if (log.instrument_name) byPerson[name].instruments.add(log.instrument_name)
                }
                return Object.entries(byPerson)
                  .sort((a, b) => b[1].minutes - a[1].minutes)
                  .map(([name, data]) => (
                    <div key={name} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-slate-800 block truncate">{name}</span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-tight">
                          {Array.from(data.instruments).join(', ')} · {data.sessions} session{data.sessions !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="text-sm font-black text-emerald-600 whitespace-nowrap ml-3">
                        {fmtDuration(data.minutes)}
                      </span>
                    </div>
                  ))
              })()}
            </div>
          </section>
        ) : null}

        {/* ── Currently Practicing ────────────────────────────────── */}
        <section className="mb-4 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Clock3 className="h-4 w-4" />
            Currently Practicing
          </div>
          {(summary?.openSessions?.length || 0) === 0 && !loading ? (
            <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-xs text-slate-500 italic">No active sessions</p>
          ) : (
            <div className="space-y-2">
              {(summary?.openSessions || []).map((session) => {
                const startTs = new Date(session.started_at.replace(' ', 'T')).getTime()
                const elapsed = formatClock(now - startTs)
                const startedAt = new Date(session.started_at.replace(' ', 'T')).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })
                return (
                  <article key={session.id} className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <span className="text-base font-bold truncate block leading-tight">{session.user_name}</span>
                        <span className="text-[10px] text-slate-600 truncate block uppercase tracking-tight">{session.instrument_name} • {startedAt}</span>
                      </div>
                      <p className="text-lg font-bold tabular-nums text-blue-600 whitespace-nowrap">{elapsed}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Trophy className="h-4 w-4" />
            Leaderboard
          </div>
          <div className="space-y-2">
            {leaderboardTop3.map((entry, index) => {
              const pct = Math.round((entry.total / maxLeaderMinutes) * 100)
              const badgeColor =
                index === 0 ? 'bg-amber-400 text-amber-950' :
                index === 1 ? 'bg-slate-300 text-slate-900' :
                index === 2 ? 'bg-orange-400 text-orange-950' :
                'bg-slate-100 text-slate-600'

              return (
                <div key={entry.name} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black shadow-sm ${badgeColor}`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md border text-[10px] font-black mr-0.5 ${entry.grade.color}`}>
                            {entry.grade.label}
                          </span>
                          <span className="text-sm font-bold truncate">{entry.name}</span>
                          <div className="flex items-center gap-1">
                            {entry.awards.map((award, i) => (
                              <span key={i} title={award.description} className="text-[12px] leading-none">
                                {award.emoji}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-black text-slate-700 whitespace-nowrap">{fmtDuration(entry.total)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-600 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {!loading && leaderboardTop3.length === 0 ? (
              <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-xs text-slate-500 italic">No sessions this week</p>
            ) : null}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Award Guide</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                {GRADES_CONFIG.slice(0, 4).map(g => (
                  <div key={g.label} className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md border text-[10px] font-black italic ${g.color}`}>{g.label}</span>
                    <span className="text-[10px] font-bold text-slate-500">{g.desc} ({g.min}m+)</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {AWARDS_CONFIG.slice(0, 4).map(award => (
                  <div key={award.id} className="flex items-center gap-2">
                    <span className="text-xs leading-none">{award.emoji}</span>
                    <span className="text-[10px] font-bold text-slate-500" title={award.description}>{award.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {showSettings ? (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => window.location.reload()}
        />
      ) : null}

      {showScanner ? (
        <ScanOverlay
          onClose={closeScanner}
          onResult={onScanResult}
          setScanState={setScanState}
        />
      ) : null}

      {/* Alert Modal */}
      {alert ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className={`mb-4 rounded-full p-3 ${
                alert.type === 'error' ? 'bg-red-100 text-red-600' :
                alert.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                'bg-emerald-100 text-emerald-600'
              }`}>
                {alert.type === 'error' ? <XCircle className="h-10 w-10" /> :
                 alert.type === 'warning' ? <AlertTriangle className="h-10 w-10" /> :
                 <CheckCircle2 className="h-10 w-10" />}
              </div>
              <h2 className="mb-2 text-xl font-bold">{alert.title}</h2>
              <p className="mb-6 text-slate-600 font-medium">{alert.message}</p>
              {!alert.autoClose && (
                <button
                  onClick={() => setAlert(null)}
                  className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white active:scale-[0.98] transition"
                >
                  Got it
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
