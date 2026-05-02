import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Settings, X, Globe, Save } from 'lucide-react'
import { getApiBaseUrl, setApiBaseUrl, normalizeApiBaseUrl, webUsesRelativeApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const nativeApp = Capacitor.isNativePlatform?.() === true

function urlLooksValidAbsolute(s) {
  const normalized = normalizeApiBaseUrl(s)
  if (!normalized) return false
  try {
    const u = new URL(normalized)
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname)
  } catch {
    return false
  }
}

export default function SettingsModal({ onClose, onSaved }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const browserProxy = !nativeApp && webUsesRelativeApi()

  useEffect(() => {
    async function load() {
      if (!browserProxy) {
        const current = await getApiBaseUrl()
        setUrl(current || '')
      }
      setLoading(false)
    }
    load()
  }, [browserProxy])

  const normalizedPreview = normalizeApiBaseUrl(url)

  const handleSave = async (e) => {
    e.preventDefault()
    const normalized = normalizeApiBaseUrl(url)
    if (nativeApp) {
      if (!urlLooksValidAbsolute(url)) return
    } else if (url.trim() && !urlLooksValidAbsolute(url)) {
      return
    }
    await setApiBaseUrl(normalized)
    if (onSaved) onSaved()
    onClose()
  }

  const urlOk = !url.trim() || urlLooksValidAbsolute(url)

  const canSubmit =
    !loading &&
    (nativeApp ? urlLooksValidAbsolute(url) : !url.trim() || urlLooksValidAbsolute(url))

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-slate-800">
            <Settings className="h-5 w-5" />
            <h2 className="text-xl font-bold">Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {browserProxy ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              This browser uses the <span className="font-bold">same dev server</span> you opened (e.g.{' '}
              <span className="font-mono text-xs">localhost:5174</span> or{' '}
              <span className="font-mono text-xs">192.168.x.x:5174</span>
              ). API calls go to <span className="font-mono">/api…</span>, and Vite proxies them to{' '}
              <span className="font-mono">localhost:3001</span> — no LAN IP needed here, so changing Wi‑Fi IPs won’t break the web app.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              The <span className="font-bold">tablet app</span> is separate: set its API URL in Settings there (e.g.{' '}
              <span className="font-mono text-xs whitespace-nowrap">http://192.168.5.65:3001</span>
              ).
            </p>
            <Button
              type="button"
              className="w-full h-12 rounded-2xl bg-slate-900 font-bold hover:bg-slate-800"
              onClick={() => onClose()}
            >
              Got it
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="api-url" className="text-sm font-bold text-slate-700">
              API Base URL{nativeApp ? ' (required on tablet)' : ''}
            </Label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Globe className="h-4 w-4" />
              </div>
              <Input
                id="api-url"
                type="text"
                inputMode="url"
                autoCorrect="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://127.0.0.1:3001"
                className="pl-10 h-12 rounded-xl border-slate-200 focus:ring-blue-500"
                required={nativeApp}
                disabled={loading}
                aria-invalid={!urlOk}
              />
            </div>
            <p className="text-xs text-slate-500 italic">
              Must include <span className="font-mono whitespace-nowrap">http://</span> (two slashes).
              Bare <span className="font-mono">192.168.x.x:3001</span> is OK — we add <span className="font-mono">http://</span> on save.
            </p>
            {normalizedPreview && normalizedPreview.trim() !== url.trim() ? (
              <p className="text-xs text-slate-700 font-medium">
                Will save as: <span className="font-mono break-all">{normalizedPreview}</span>
              </p>
            ) : null}
            {!urlOk ? (
              <p className="text-xs text-red-600 font-medium">
                Use a reachable host/IP with optional port (e.g. <span className="font-mono">http://127.0.0.1:3001</span>).
              </p>
            ) : null}
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full h-12 rounded-2xl bg-slate-900 font-bold hover:bg-slate-800"
              disabled={!canSubmit}
            >
              <Save className="h-4 w-4 mr-2" />
              Save & Restart
            </Button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
