/**
 * osNotification.ts — Thin wrapper around Electron's native Notification API.
 *
 * Checks Notification.isSupported() before attempting to show. On unsupported
 * platforms (e.g. Linux without libnotify), logs and no-ops silently.
 */

import { Notification } from 'electron';

import log from './logger';

export interface NotifyOptions {
  title: string;
  body: string;
  onClick?: () => void;
}

export function notify(opts: NotifyOptions): void {
  if (!Notification.isSupported()) {
    log.info('[osNotification] Notifications not supported on this platform — skipping');
    return;
  }

  const n = new Notification({ title: opts.title, body: opts.body });

  if (opts.onClick) {
    n.on('click', opts.onClick);
  }

  n.show();
}
