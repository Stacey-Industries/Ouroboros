/**
 * updater.ts — Singleton wrapper for electron-updater (optional dependency).
 *
 * electron-updater may not be installed in dev environments. This module
 * centralises the require() so both main.ts and miscRegistrars.ts share one
 * instance and one place to configure autoDownload / autoInstallOnAppQuit.
 *
 * Wave 38 Phase F:
 * - Reads platform.updateChannel ('stable' | 'beta') to set updater channel.
 * - Downgrade guard: rejects updates where server version < current app version.
 */

interface UpdateInfo {
  version: string;
  [key: string]: unknown;
}

interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  requestHeaders: Record<string, string> | null;
  channel: string;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
  on(event: string, listener: (...args: unknown[]) => void): this;
  removeListener(event: string, listener: (...args: unknown[]) => void): this;
}

import { app } from 'electron';

import { getConfigValue } from './config';
import log from './logger';

let _autoUpdater: AutoUpdaterLike | null = null;

const rejectedVersions = new Set<string>();
let lastOfferedVersion: string | null = null;

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

/**
 * Inject a fake auto-updater for tests — bypasses the require() path.
 * Only call from test files.
 */
export function _setAutoUpdaterForTest(updater: AutoUpdaterLike | null): void {
  _autoUpdater = updater;
}

/**
 * Reset module-level downgrade tracking state for tests.
 * Only call from test files.
 */
export function _resetUpdaterStateForTest(): void {
  rejectedVersions.clear();
  lastOfferedVersion = null;
}

/** Returns true if the given version was rejected by the downgrade guard. */
export function isVersionRejected(version: string): boolean {
  return rejectedVersions.has(version);
}

/** Returns the last version offered via update-available, or null if none. */
export function getLastOfferedVersion(): string | null {
  return lastOfferedVersion;
}

/** Set a GitHub token on the auto-updater for private repo release access. */
export function setUpdaterGitHubToken(token: string | null): void {
  if (!_autoUpdater) return;
  _autoUpdater.requestHeaders = token ? { Authorization: `token ${token}` } : null;
  log.info(`[Updater] GitHub token ${token ? 'set' : 'cleared'} for update checks`);
}

/**
 * Compare two semver strings (major.minor.patch[-prerelease]).
 * Returns true if candidate is strictly less than current.
 * Best-effort: treats non-semver as equal (returns false).
 */
export function isDowngrade(currentVersion: string, candidateVersion: string): boolean {
  const parse = (v: string): number[] | null => {
    const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return null;
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  };

  const current = parse(currentVersion);
  const candidate = parse(candidateVersion);
  if (!current || !candidate) return false;

  for (let i = 0; i < 3; i++) {
    // eslint-disable-next-line security/detect-object-injection -- index is a literal 0/1/2
    if (candidate[i] < current[i]) return true;
    // eslint-disable-next-line security/detect-object-injection -- index is a literal 0/1/2
    if (candidate[i] > current[i]) return false;
  }
  return false;
}

function applyChannelFromConfig(): void {
  if (!_autoUpdater) return;
  const platform = getConfigValue('platform') ?? {};
  const channel = platform.updateChannel ?? 'stable';
  _autoUpdater.channel = channel;
  log.info(`[Updater] channel set to '${channel}'`);
}

function guardDowngrade(info: UpdateInfo): boolean {
  const current = app.getVersion();
  if (isDowngrade(current, info.version)) {
    log.warn(
      `[Updater] downgrade rejected — offered ${info.version}, current ${current}`,
    );
    rejectedVersions.add(info.version);
    return true;
  }
  return false;
}

let _downgradeListener: ((info: unknown) => void) | null = null;

/** Configure channel from config and install the downgrade guard. */
export function configureUpdaterChannel(): void {
  if (!_autoUpdater) return;
  applyChannelFromConfig();

  if (_downgradeListener) {
    _autoUpdater.removeListener('update-available', _downgradeListener);
  }

  _downgradeListener = (info: unknown) => {
    const updateInfo = info as UpdateInfo;
    lastOfferedVersion = updateInfo.version;
    guardDowngrade(updateInfo);
  };

  _autoUpdater.on('update-available', _downgradeListener);
}
