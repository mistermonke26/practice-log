import { useEffect, useState } from 'react'
import { ArrowLeft, History, RefreshCw, ChevronLeft, LoaderCircle, Settings } from 'lucide-react'
import { apiUrl } from '@/lib/api'
import SettingsModal from '@/components/SettingsModal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'


function fmtTime(dt) { return dt ? dt.slice(11, 16) : '—' }
function fmtDate(dt) { return dt ? dt.slice(0, 10) : '—' }
function fmtDuration(min) {
  if (!min && min !== 0) return '—'
  if (min < 60) return `${Math.round(min)} min`
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`
}

const STATUS_BADGE = {
  complete: 'success',
  auto_closed: 'warning',
  suspicious: 'destructive',
  manual_fix: 'info',
}

function StatusBadge({ status }) {
  return (
    <Badge variant={STATUS_BADGE[status] || 'outline'}>
      {status?.replace(/_/g, ' ') || 'unknown'}
    </Badge>
  )
}

export default function HistoryPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingLogId, setDeletingLogId] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const isKiosk = !window.location.pathname.includes('/admin')

  async function loadHistory() {
    setLoading(true)
    try {
      const res = await fetch(await apiUrl('/api/logs?limit=2000'))
      setLogs(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  async function deleteLog(log) {
    if (!log?.id) return
    const confirmed = window.confirm(
      `Delete this session for ${log.user_name || 'Unknown'} on ${fmtDate(log.started_at)}? This cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingLogId(log.id)
    try {
      const res = await fetch(await apiUrl(`/api/logs/${log.id}`), { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed to delete session')
      setLogs((prev) => prev.filter((row) => row.id !== log.id))
    } catch (error) {
      window.alert(error.message || 'Failed to delete session')
    } finally {
      setDeletingLogId(null)
    }
  }

  if (isKiosk) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 pb-10">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3">
          <div className="mx-auto max-w-3xl flex items-center justify-between">
            <button
              onClick={() => window.location.assign('/')}
              className="flex items-center gap-1 text-blue-600 font-bold text-sm"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <h1 className="font-bold text-lg text-slate-800">History</h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSettings(true)}
                className="text-slate-400 p-2"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button onClick={loadHistory} disabled={loading} className="text-slate-400 p-2">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <LoaderCircle className="h-8 w-8 animate-spin" />
              <p className="font-medium font-bold">Loading history...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-slate-200">
              <p className="text-slate-400 font-medium italic">No sessions logged yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.slice(0, 100).map((log) => {
                const date = new Date(log.started_at.replace(' ', 'T')).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })
                const timeRange = `${fmtTime(log.started_at)} – ${fmtTime(log.ended_at)}`

                return (
                  <div key={log.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-bold text-base truncate text-slate-800">{log.user_name}</p>
                      <p className="text-xs text-slate-500 uppercase font-semibold tracking-tight">
                        {log.instrument_name} • {date}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-bold tracking-widest">{timeRange}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-slate-700 tabular-nums">{fmtDuration(log.duration_minutes)}</p>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${
                        log.status === 'complete' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        log.status === 'suspicious' ? 'bg-red-50 text-red-600 border-red-100' :
                        'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {log.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>
    )
  }

  // Admin View
  return (
    <div className="min-h-screen bg-background/70">
      <header className="sticky top-0 z-10 border-b bg-card/70 backdrop-blur-xl shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-md">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-none">Practice History</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                All logged sessions (newest first)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.assign('/admin')}>
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={loadHistory} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        <Card>
          <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-2">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8 italic font-medium">
                    No practice history yet.
                  </TableCell>
                </TableRow>
              )}

              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{fmtDate(log.started_at)}</TableCell>
                  <TableCell className="font-medium">{log.user_name}</TableCell>
                  <TableCell>{log.instrument_name}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{fmtTime(log.started_at)}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{fmtTime(log.ended_at)}</TableCell>
                  <TableCell className="font-medium tabular-nums">{fmtDuration(log.duration_minutes)}</TableCell>
                  <TableCell><StatusBadge status={log.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteLog(log)}
                      disabled={deletingLogId === log.id}
                    >
                      {deletingLogId === log.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => window.location.reload()}
        />
      )}
    </div>
  )
}
