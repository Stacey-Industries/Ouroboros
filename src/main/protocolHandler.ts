/**
 * protocolHandler.ts — registers the `thread://` URL scheme and forwards
 * parsed permalinks to the focused renderer.
 *
 * On macOS, URLs arrive via `app.on('open-url')`.
 * On Windows/Linux, the URL is passed as a command-line argument and arrives
 * via the `second-instance` event.
 *
 * The renderer listens for the IPC push `app:navigateToPermalink` and
 * dispatches an `agent-ide:open-thread` DOM event.
 */

import { app, BrowserWindow } from 'electron';

import { type ParsedPermalink, parsePermalink } from './agentChat/permalinks';
import log from './logger';

const PROTOCOL = 'thread';

export function registerThreadProtocol(): void {
  if (process.env.NODE_ENV !== 'development') {
    try { app.setAsDefaultProtocolClient(PROTOCOL); }
    catch (err) { log.warn('[protocolHandler] setAsDefaultProtocolClient failed', err); }
  }
  app.on('open-url', (event, url) => { event.preventDefault(); dispatchPermalink(url); });
}

/** Registers the protocol + handles the initial argv permalink in one call. */
export function setupThreadProtocol(): void {
  registerThreadProtocol();
  scheduleInitialPermalinkFromArgv();
}

export function extractPermalinkFromArgv(argv: readonly string[]): ParsedPermalink | null {
  for (const arg of argv) {
    if (typeof arg !== 'string') continue;
    if (!arg.startsWith(`${PROTOCOL}://`)) continue;
    const parsed = parsePermalink(arg);
    if (parsed) return parsed;
  }
  return null;
}

export function dispatchPermalink(url: string): void {
  const parsed = parsePermalink(url);
  if (!parsed) {
    log.warn('[protocolHandler] ignoring malformed permalink', url);
    return;
  }
  sendToFocusedWindow(parsed);
}

export function dispatchPermalinkFromArgv(argv: readonly string[]): void {
  const parsed = extractPermalinkFromArgv(argv);
  if (parsed) sendToFocusedWindow(parsed);
}

export function scheduleInitialPermalinkFromArgv(): void {
  const parsed = extractPermalinkFromArgv(process.argv);
  if (!parsed) return;
  app.whenReady()
    .then(() => { setTimeout(() => sendToFocusedWindow(parsed), 500); })
    .catch(() => { /* ignored */ });
}

function sendToFocusedWindow(parsed: ParsedPermalink): void {
  const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  if (windows.length === 0) return;
  const target = BrowserWindow.getFocusedWindow() ?? windows[windows.length - 1];
  target.webContents.send('app:navigateToPermalink', parsed);
}
