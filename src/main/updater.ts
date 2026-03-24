/**
 * updater.ts — Singleton wrapper for electron-updater (optional dependency).
 *
 * electron-updater may not be installed in dev environments. This module
 * centralises the require() so both main.ts and miscRegistrars.ts share one
 * instance and one place to configure autoDownload / autoInstallOnAppQuit.
 */

interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  requestHeaders: Record<string, string> | null;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

import log from './logger';

let _autoUpdater: AutoUpdaterLike | null = null;

try {
  // electron-updater is an optional dependency; gracefully skip if absent
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const updaterModule = require('electron-updater') as { autoUpdater: AutoUpdaterLike };
  _autoUpdater = updaterModule.autoUpdater;
  _autoUpdater.autoDownload = false;
  _autoUpdater.autoInstallOnAppQuit = true;
} catch {
  log.info('electron-updater not installed — auto-update disabled');
}

/**
 * Returns the shared autoUpdater singleton, or null if electron-updater is
 * not installed (e.g. in a plain dev checkout without the optional dep).
 */
export function getAutoUpdater(): AutoUpdaterLike | null {
  return _autoUpdater;
}

/** Set a GitHub token on the auto-updater for private repo release access. */
export function setUpdaterGitHubToken(token: string | null): void {
  if (!_autoUpdater) return;
  _autoUpdater.requestHeaders = token ? { Authorization: `token ${token}` } : null;
  log.info(`[Updater] GitHub token ${token ? 'set' : 'cleared'} for update checks`);
}
