import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const PREF_KEY = 'api_base_url'

/** Fix common kiosk typos (`http:` without `//`, bare ip:port). Returns `origin` only (no trailing slash). */
export function normalizeApiBaseUrl(raw) {
  let t = String(raw ?? '').trim().replace(/\/+$/, '')
  if (!t) return ''

  // `http:something…` → `http://something…`
  const bustedScheme = t.match(/^(https?):(?!\/\/)(.+)$/i)
  if (bustedScheme) {
    const scheme = /^https$/i.test(bustedScheme[1]) ? 'https' : 'http'
    t = `${scheme}://${bustedScheme[2].replace(/^\/+/, '')}`
  }

  let hasScheme = /^https?:\/\//i.test(t)
  let hostSlice = hasScheme ? t.slice(t.indexOf('//') + 2) : t
  hostSlice = hostSlice.split(/[/?\s]/)[0] ?? ''

  if (!hasScheme) {
    const looksLikeIpv4Host = /^\d{1,3}(?:\.\d{1,3}){3}(:\d+)?$/i.test(hostSlice)
    const looksLikeHostname =
      (/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:\d+)?$/i.test(hostSlice))
    const looksLikeLocal = /^localhost(:\d+)?$/i.test(hostSlice)

    if (looksLikeIpv4Host || looksLikeHostname || looksLikeLocal) {
      t = `http://${hostSlice}`
      hasScheme = true
    }
  }

  try {
    const u = new URL(t)
    if (!u.hostname || !/^https?:$/i.test(u.protocol)) return ''
    return u.origin
  } catch {
    return ''
  }
}

const ENV_BASE =
  typeof import.meta.env.VITE_API_BASE_URL === 'string' ? import.meta.env.VITE_API_BASE_URL : ''
const DEFAULT_NORMALIZED = normalizeApiBaseUrl(ENV_BASE) || ''

let cacheLoaded = false
let cachedBase = ''

function isNative() {
  return Capacitor.isNativePlatform?.() === true
}

/** Private LAN / loopback — use same-origin `/api…` (Vite proxy in dev) so a stale saved IP never breaks the web app. */
function hostnameIsLocalOrLan(hostname) {
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  return false
}

/**
 * Browser on localhost / LAN + no VITE_API_BASE_URL → always relative `/api` (never use a saved LAN IP that drifts).
 * Tablet (native) is unchanged.
 */
export function webUsesRelativeApi() {
  if (typeof window === 'undefined') return false
  if (isNative()) return false
  if (DEFAULT_NORMALIZED) return false
  return hostnameIsLocalOrLan(window.location.hostname)
}

async function loadBaseFromStorage() {
  if (webUsesRelativeApi()) {
    cachedBase = ''
    cacheLoaded = true
    return cachedBase
  }

  const { value } = await Preferences.get({ key: PREF_KEY })
  const fromPref = normalizeApiBaseUrl(value || '')
  cachedBase = fromPref || DEFAULT_NORMALIZED
  cacheLoaded = true
  return cachedBase
}

/** True after first read; persists empty string correctly (no repeat Preferences reads every call). */
export async function getApiBaseUrl() {
  if (!cacheLoaded) return loadBaseFromStorage()
  return cachedBase
}

export async function needsApiSetup() {
  const base = await getApiBaseUrl()
  return isNative() && !base
}

export async function setApiBaseUrl(url) {
  if (webUsesRelativeApi()) {
    await Preferences.remove({ key: PREF_KEY }).catch(() => {})
    cachedBase = ''
    cacheLoaded = true
    return
  }

  const cleanUrl = normalizeApiBaseUrl(url)
  await Preferences.set({
    key: PREF_KEY,
    value: cleanUrl,
  })
  cachedBase = cleanUrl
  cacheLoaded = true
}

/**
 * Resolved request URL for `fetch`:
 * - Web: on localhost/LAN hosts with no env URL, always same-origin `/api…`; otherwise prefs or VITE_API_BASE_URL.
 * - Native: requires an absolute base (saved pref or env); relative `/api…` cannot reach your server from the APK.
 */
export async function apiUrl(path) {
  const base = await getApiBaseUrl()
  const p = path.startsWith('/') ? path : `/${path}`

  if (isNative() && !base) {
    throw new Error(
      'API URL is not set. Open Settings and enter your server (e.g. https://your-api.example.com).',
    )
  }

  return base ? `${base.replace(/\/$/, '')}${p}` : p
}
