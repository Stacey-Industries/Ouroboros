/**
 * ouroborosMcpPath.ts — DB path resolution for the standalone server.
 *
 * The standalone runs outside Electron, so `app.getPath('userData')` is
 * unavailable. We hardcode the per-OS path that matches what Electron's
 * `userData` resolves to for `name: 'ouroboros'`. Verified by Phase 0
 * smoke 3 against a live IDE install.
 *
 * Override via `--db <abs-path>` CLI arg for non-default installs.
 */

import path from 'node:path';

interface PlatformEnv {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}

const APP_NAME = 'ouroboros';
const DB_FILENAME = 'codebase-graph.db';

export function resolveUserDataDir(p: PlatformEnv = process): string {
  if (p.platform === 'win32') {
    const appData = p.env.APPDATA;
    if (!appData) throw new Error('APPDATA env var not set on Windows');
    return path.join(appData, APP_NAME);
  }
  if (p.platform === 'darwin') {
    const home = p.env.HOME;
    if (!home) throw new Error('HOME env var not set on darwin');
    return path.join(home, 'Library', 'Application Support', APP_NAME);
  }
  const home = p.env.HOME;
  if (!home) throw new Error('HOME env var not set');
  return path.join(home, '.config', APP_NAME);
}

export function defaultDbPath(p: PlatformEnv = process): string {
  return path.join(resolveUserDataDir(p), DB_FILENAME);
}

export interface ParsedArgs {
  dbPath: string;
}

/**
 * Parse the standalone's CLI args. Currently supports:
 *   --db <abs-path>    Override the default DB path.
 *
 * Throws on unknown args or malformed values so the parent (Claude Code's
 * spawn machinery) sees a clear non-zero exit instead of a silent
 * misconfiguration.
 */
export function parseArgs(argv: readonly string[], env?: PlatformEnv): ParsedArgs {
  let dbPath: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--db') {
      const next = argv[i + 1];
      if (!next) throw new Error('--db requires a path argument');
      if (!path.isAbsolute(next)) throw new Error(`--db requires an absolute path; got: ${next}`);
      dbPath = next;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { dbPath: dbPath ?? defaultDbPath(env) };
}
