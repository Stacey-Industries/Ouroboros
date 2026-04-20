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
  return dirty;
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
