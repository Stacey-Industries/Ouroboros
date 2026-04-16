/**
 * notifications.ts — Stream-completion desktop notification helper.
 *
 * Wraps Electron's Notification API with:
 *  - Focus gate (skips if any BrowserWindow is focused)
 *  - Click-to-navigate (focuses main window + sends app:navigateToPermalink)
 *  - Platform guard via Notification.isSupported()
 */

import { BrowserWindow, Notification } from 'electron';

import log from './logger';

export interface StreamCompletionNotifyOptions {
  title: string;
  body: string;
  threadId?: string;
}

function focusMainWindow(): void {
  const windows = BrowserWindow.getAllWindows();
  const target = windows[0];
  if (!target || target.isDestroyed()) return;
  if (target.isMinimized()) target.restore();
  target.focus();
}

function sendNavigateEvent(win: BrowserWindow, threadId: string): void {
  if (win.isDestroyed()) return;
  win.webContents.send('app:navigateToPermalink', { threadId });
}

function buildClickHandler(threadId: string | undefined): (() => void) | undefined {
  return () => {
    focusMainWindow();
    if (!threadId) return;
    const wins = BrowserWindow.getAllWindows();
    const target = wins[0];
    if (target && !target.isDestroyed()) {
      sendNavigateEvent(target, threadId);
    }
  };
}

/**
 * Show a desktop notification for a completed chat stream.
 * No-ops silently if any window is currently focused or notifications
 * are not supported on this platform.
 */
export function showStreamCompletionNotification(
  opts: StreamCompletionNotifyOptions,
): void {
  const focused = BrowserWindow.getAllWindows().some(
    (win) => !win.isDestroyed() && win.isFocused(),
  );
  if (focused) return;

  if (!Notification.isSupported()) {
    log.info('[notifications] Notifications not supported on this platform — skipping');
    return;
  }

  const n = new Notification({ title: opts.title, body: opts.body });
  const onClick = buildClickHandler(opts.threadId);
  if (onClick) n.on('click', onClick);
  n.show();
}
