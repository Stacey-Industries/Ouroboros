/**
 * windowManagerChatWindow.ts — Chat-window helper functions.
 *
 * Extracted from windowManager.ts to keep that file under the 300-line limit.
 * Provides URL-building, bounds defaults, kind-guard, and content-loading for
 * dedicated chat BrowserWindows.
 */

import type { BrowserWindow } from 'electron';

import type { ManagedWindow } from './windowManager';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CHAT_WINDOW_WIDTH = 800;
export const CHAT_WINDOW_HEIGHT = 900;

// ─── Bounds ───────────────────────────────────────────────────────────────────

export interface ChatWindowBounds {
  width: number;
  height: number;
}

/**
 * Returns the default bounds for a dedicated chat window.
 * Smaller than a main IDE window — optimised for a sidebar-style presence.
 */
export function buildChatWindowBounds(): ChatWindowBounds {
  return { width: CHAT_WINDOW_WIDTH, height: CHAT_WINDOW_HEIGHT };
}

// ─── URL ──────────────────────────────────────────────────────────────────────

/**
 * Builds the URL to load in a chat BrowserWindow.
 *
 * In development: appends `?mode=chat&sessionId=<id>` to the dev-server URL.
 * In production: uses the file path and passes params in the hash fragment
 * because `loadFile` with a query string is unreliable on some platforms.
 *
 * The renderer reads these params in `useChatWindowMode()`.
 */
export function buildChatWindowUrl(
  sessionId: string,
  rendererUrl: string | undefined,
  indexHtmlPath: string,
): string {
  const params = `mode=chat&sessionId=${encodeURIComponent(sessionId)}`;
  if (rendererUrl) {
    const separator = rendererUrl.includes('?') ? '&' : '?';
    return `${rendererUrl}${separator}${params}`;
  }
  return `file://${indexHtmlPath}?${params}`;
}

// ─── Content loading ─────────────────────────────────────────────────────────

/**
 * Loads the renderer into a chat BrowserWindow.
 * Dev mode uses loadURL (dev-server); production uses loadFile with query params.
 */
export function loadChatWindowContent(
  win: BrowserWindow,
  sessionId: string,
  rendererUrl: string | undefined,
  indexHtmlPath: string,
): void {
  const url = buildChatWindowUrl(sessionId, rendererUrl, indexHtmlPath);
  if (rendererUrl) {
    void win.loadURL(url);
    return;
  }
  const [filePath, query] = url.replace(/^file:\/\//, '').split('?');
  void win.loadFile(filePath, { query: Object.fromEntries(new URLSearchParams(query)) });
}

// ─── Kind guard ───────────────────────────────────────────────────────────────

/**
 * Returns true when the ManagedWindow was opened as a dedicated chat window.
 * Relies on the `kind` field added to ManagedWindow in windowManager.ts.
 */
export function isChatWindow(mw: ManagedWindow): boolean {
  return mw.kind === 'chat';
}
