/**
 * ptyPersistence.ts — SQLite-backed PTY session store.
 *
 * Persists session descriptors on create/resize/kill so the renderer can
 * offer to restore prior sessions after an app restart.
 *
 * Respawned PTYs get NEW PIDs — child process state cannot be recovered.
 * The restore UI (RestoreSessionsDialog) is follow-up work; this module
 * only provides the storage and IPC surface.
 *
 * Flag: persistTerminalSessions (config). When false, all calls are no-ops.
 */

import { app } from 'electron';
import path from 'path';

import { getConfigValue } from './config';
import log from './logger';
import {
  closeDatabase,
  type Database,
  getSchemaVersion,
  openDatabase,
  runTransaction,
  setSchemaVersion,
} from './storage/database';

export interface PersistedPtySession {
  id: string;
  cwd: string;
  shellPath: string | null;
  shellArgs: string[];
  cols: number;
  rows: number;
  windowId: number | null;
  envHash: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface PtyPersistence {
  isEnabled(): boolean;
  saveSession(s: PersistedPtySession): void;
  updateSession(id: string, patch: Partial<PersistedPtySession>): void;
  removeSession(id: string): void;
  listSessions(): PersistedPtySession[];
  clearAll(): void;
  close(): void;
}

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS pty_sessions (
    id TEXT PRIMARY KEY,
    cwd TEXT NOT NULL,
    shell_path TEXT,
    shell_args TEXT NOT NULL,
    cols INTEGER NOT NULL,
    rows INTEGER NOT NULL,
    window_id INTEGER,
    env_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pty_sessions_window ON pty_sessions(window_id);
`;

function ensureSchema(db: Database): void {
  if (getSchemaVersion(db) >= SCHEMA_VERSION) return;
  runTransaction(db, () => {
    db.exec(SCHEMA_SQL);
    setSchemaVersion(db, SCHEMA_VERSION);
  });
}

function rowToSession(row: Record<string, unknown>): PersistedPtySession {
  return {
    id: row['id'] as string,
    cwd: row['cwd'] as string,
    shellPath: (row['shell_path'] as string | null) ?? null,
    shellArgs: JSON.parse(row['shell_args'] as string) as string[],
    cols: row['cols'] as number,
    rows: row['rows'] as number,
    windowId: (row['window_id'] as number | null) ?? null,
    envHash: row['env_hash'] as string,
    createdAt: row['created_at'] as number,
    lastSeenAt: row['last_seen_at'] as number,
  };
}

function openPtyDb(): Database {
  const dbPath = path.join(app.getPath('userData'), 'pty-sessions.db');
  const db = openDatabase(dbPath);
  ensureSchema(db);
  return db;
}

/** No-op implementation returned when the feature flag is off. */
const NOOP_PERSISTENCE: PtyPersistence = {
  isEnabled: () => false,
  saveSession: () => {},
  updateSession: () => {},
  removeSession: () => {},
  listSessions: () => [],
  clearAll: () => {},
  close: () => {},
};

class PtyPersistenceImpl implements PtyPersistence {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  isEnabled(): boolean {
    return true;
  }

  saveSession(s: PersistedPtySession): void {
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO pty_sessions
           (id, cwd, shell_path, shell_args, cols, rows, window_id, env_hash, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          s.id,
          s.cwd,
          s.shellPath,
          JSON.stringify(s.shellArgs),
          s.cols,
          s.rows,
          s.windowId,
          s.envHash,
          s.createdAt,
          s.lastSeenAt,
        );
    } catch (err) {
      log.warn('[ptyPersistence] saveSession failed', err);
    }
  }

  updateSession(id: string, patch: Partial<PersistedPtySession>): void {
    if (Object.keys(patch).length === 0) return;
    try {
      this.applyPatch(id, patch);
    } catch (err) {
      log.warn('[ptyPersistence] updateSession failed', err);
    }
  }

  private applyPatch(id: string, patch: Partial<PersistedPtySession>): void {
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (patch.cwd !== undefined) { sets.push('cwd = ?'); vals.push(patch.cwd); }
    if (patch.cols !== undefined) { sets.push('cols = ?'); vals.push(patch.cols); }
    if (patch.rows !== undefined) { sets.push('rows = ?'); vals.push(patch.rows); }
    if (patch.lastSeenAt !== undefined) { sets.push('last_seen_at = ?'); vals.push(patch.lastSeenAt); }
    if (patch.windowId !== undefined) { sets.push('window_id = ?'); vals.push(patch.windowId); }
    if (patch.envHash !== undefined) { sets.push('env_hash = ?'); vals.push(patch.envHash); }

    if (sets.length === 0) return;
    vals.push(id);
    this.db.prepare(`UPDATE pty_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  removeSession(id: string): void {
    try {
      this.db.prepare('DELETE FROM pty_sessions WHERE id = ?').run(id);
    } catch (err) {
      log.warn('[ptyPersistence] removeSession failed', err);
    }
  }

  listSessions(): PersistedPtySession[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM pty_sessions ORDER BY last_seen_at DESC')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .all() as any[];
      return rows.map(rowToSession);
    } catch (err) {
      log.warn('[ptyPersistence] listSessions failed', err);
      return [];
    }
  }

  clearAll(): void {
    try {
      this.db.prepare('DELETE FROM pty_sessions').run();
    } catch (err) {
      log.warn('[ptyPersistence] clearAll failed', err);
    }
  }

  close(): void {
    closeDatabase(this.db);
  }
}

/**
 * Factory. Reads the feature flag once at construction time.
 * When the flag is off, returns a no-op implementation — zero overhead.
 */
export function createPtyPersistence(): PtyPersistence {
  const enabled = getConfigValue('persistTerminalSessions') === true;
  if (!enabled) return NOOP_PERSISTENCE;
  try {
    const db = openPtyDb();
    return new PtyPersistenceImpl(db);
  } catch (err) {
    log.error('[ptyPersistence] Failed to open database, falling back to no-op', err);
    return NOOP_PERSISTENCE;
  }
}
