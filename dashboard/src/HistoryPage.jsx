import { useEffect, useState } from 'react'
import { ArrowLeft, History, RefreshCw } from 'lucide-react'
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

  async function loadHistory() {
    setLoading(true)
    try {
      const res = await fetch('/api/logs?limit=2000')
      setLogs(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

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
            <Button variant="outline" size="sm" onClick={() => window.location.assign('/')}>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </main>
    </div>
  )
}
