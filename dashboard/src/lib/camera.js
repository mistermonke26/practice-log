/**
 * Camera API is only exposed in secure contexts (https:, localhost 127.x, file quirks).
 * Plain http:// with a LAN IP → navigator.mediaDevices is undefined.
 */
export function cameraAvailableInBrowser() {
  if (typeof window === 'undefined') return false
  if (!window.isSecureContext) return false
  return typeof navigator?.mediaDevices?.getUserMedia === 'function'
}

export function insecureCameraHint() {
  if (typeof window === 'undefined') return ''
  if (window.isSecureContext) return ''
  const host = typeof location !== 'undefined' ? location.host : ''
  return `This URL (${host}) is not a “secure context,” so browsers hide the camera API. Run the dashboard with HTTPS and open the https:// link from the terminal, or open the app via http://localhost on this Mac.`
}
