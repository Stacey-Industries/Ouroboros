import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Sanitize the persisted config.json before electron-store reads it.
 *
 * electron-store throws synchronously at construction if the persisted JSON
 * fails JSON-Schema validation. That blocks app startup with no recovery path.
 * This preflight reshapes known-bad fields into schema-valid defaults.
 *
 * Currently handles:
 * - `profiles` written as a non-array (observed: object keyed by OS username
 *   containing a stale config snapshot from a buggy code path). Reset to [].
 * - Deprecated keys removed by upstream waves whose schemas use
 *   `additionalProperties: false` (an upgraded user's stored config still has
 *   them, so electron-store rejects the file). Each strip is idempotent.
 */
export function runConfigPreflight(): void {
  try {
    const userDataDir = resolveUserDataDir();
    if (!userDataDir) return;
    // Path is derived from Electron's userData dir, not user input.
    const file = path.join(userDataDir, 'config.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!fs.existsSync(file)) return;
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const raw = fs.readFileSync(file, 'utf8');
    const data = parseJsonSafe(raw);
    if (!data || typeof data !== 'object') return;
    if (sanitize(data)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.writeFileSync(file, JSON.stringify(data, null, '\t'), 'utf8');
    }
  } catch {
    // Never block startup on the preflight. If sanitization fails, electron-store
    // will surface its own validation error, which is the existing behavior.
  }
}

function parseJsonSafe(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sanitize(data: Record<string, unknown>): boolean {
  let dirty = false;
  if ('profiles' in data && !Array.isArray(data.profiles)) {
    data.profiles = [];
    dirty = true;
  }
  if (stripDeprecatedKeys(data)) {
    dirty = true;
  }
  return dirty;
}

/**
 * Remove keys that were dropped from the schema in prior waves but may still
 * exist in upgraded users' stored configs. Schemas use
 * `additionalProperties: false`, so a stale key blocks startup.
 */
function stripDeprecatedKeys(data: Record<string, unknown>): boolean {
  let dirty = false;
  // Wave 79 — top-level windowSessions removed (migration to sessionsData expired).
  if ('windowSessions' in data) {
    delete data.windowSessions;
    dirty = true;
  }
  // 2026-05-01 inline cleanup — routerSettings.llmJudgeSampleRate removed.
  if (deleteNestedKey(data, 'routerSettings', 'llmJudgeSampleRate')) dirty = true;
  // Wave 79 — codemode.routeInternalMcp removed.
  if (deleteNestedKey(data, 'codemode', 'routeInternalMcp')) dirty = true;
  // Wave 79 — internalMcp.transport removed.
  if (deleteNestedKey(data, 'internalMcp', 'transport')) dirty = true;
  return dirty;
}

function deleteNestedKey(
  data: Record<string, unknown>,
  parent: string,
  child: string,
): boolean {
  const value = Reflect.get(data, parent);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!Reflect.has(value, child)) return false;
  return Reflect.deleteProperty(value, child);
}

/**
 * Resolve electron-store's userData dir. In the main process, prefer
 * `app.getPath('userData')`. In worker_threads / utility processes the
 * `electron` import is empty, so derive the path the same way Electron does
 * from platform conventions + the package "name" field.
 */
export function resolveUserDataDir(): string | null {
  if (app && typeof app.getPath === 'function') {
    return app.getPath('userData');
  }
  const appName = 'ouroboros';
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, appName);
  }
  if (process.platform === 'darwin' && process.env.HOME) {
    return path.join(process.env.HOME, 'Library', 'Application Support', appName);
  }
  if (process.env.HOME) {
    return path.join(process.env.HOME, '.config', appName);
  }
  return null;
}
