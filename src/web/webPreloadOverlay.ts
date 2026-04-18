/**
 * webPreloadOverlay.ts — Connection overlay banner for web mode.
 *
 * Renders a fixed top-bar indicating WebSocket disconnect / reconnect status.
 * Extracted from webPreloadTransport.ts to keep that file under the 300-line limit.
 */

const OVERLAY_ID = 'ws-connection-overlay'

const OVERLAY_CSS = [
  'position:fixed', 'top:0', 'left:0', 'right:0',
  'background:#f59e0b', 'color:#000', 'text-align:center',
  'padding:4px', 'font-size:12px', 'z-index:99999',
  'font-family:system-ui,-apple-system,sans-serif',
].join(';')

export function showConnectionOverlay(message: string): void {
  let overlay = document.getElementById(OVERLAY_ID)
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
    overlay.style.cssText = OVERLAY_CSS
    document.body?.prepend(overlay)
  }
  overlay.textContent = message
}

export function hideConnectionOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove()
}
