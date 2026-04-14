/**
 * checkpointStore.ts — SQLite-backed per-turn checkpoint store.
 *
 * Each assistant turn that produces a checkpoint commit is recorded here.
 * GC policy: keep at most MAX_CHECKPOINTS_PER_THREAD (50) per thread.
 */

import type { SessionCheckpoint } from '@shared/types/sessionCheckpoint';
import { randomUUID } from 'crypto';

import type { Database } from '../storage/database';
import { getSchemaVersion, runTransaction, setSchemaVersion } from '../storage/database';

export const MAX_CHECKPOINTS_PER_THREAD = 50;

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS session_checkpoints (
    id TEXT PRIMARY KEY,
    threadId TEXT NOT NULL,
    messageId TEXT NOT NULL,
    commitHash TEXT NOT NULL,
    filesChanged TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    label TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_cp_thread ON session_checkpoints (threadId, createdAt ASC);
`;

export interface CheckpointCreateArgs {
  threadId: string;
  messageId: string;
  commitHash: string;
  filesChanged: string[];
  label?: string;
}

interface RawRow {
  id: string;
  threadId: string;
  messageId: string;
  commitHash: string;
  filesChanged: string;
  createdAt: string;
  label: string | null;
}

function rowToCheckpoint(row: RawRow): SessionCheckpoint {
  return {
    id: row.id,
    threadId: row.threadId,
    messageId: row.messageId,
    commitHash: row.commitHash,
    filesChanged: JSON.parse(row.filesChanged) as string[],
    createdAt: row.createdAt,
    label: row.label ?? undefined,
  };
}

export class CheckpointStore {
  constructor(private readonly db: Database) {
    this.ensureSchema();
  }

  private ensureSchema(): void {
    if (getSchemaVersion(this.db) >= SCHEMA_VERSION) return;
    runTransaction(this.db, () => {
      this.db.exec(SCHEMA_SQL);
      setSchemaVersion(this.db, SCHEMA_VERSION);
    });
  }

  create(args: CheckpointCreateArgs): SessionCheckpoint {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO session_checkpoints (id, threadId, messageId, commitHash, filesChanged, createdAt, label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        args.threadId,
        args.messageId,
        args.commitHash,
        JSON.stringify(args.filesChanged),
        createdAt,
        args.label ?? null,
      );
    return {
      id,
      threadId: args.threadId,
      messageId: args.messageId,
      commitHash: args.commitHash,
      filesChanged: args.filesChanged,
      createdAt,
      label: args.label,
    };
  }

  list(threadId: string): SessionCheckpoint[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM session_checkpoints WHERE threadId = ? ORDER BY createdAt ASC`,
      )
      .all(threadId) as RawRow[];
    return rows.map(rowToCheckpoint);
  }

  get(id: string): SessionCheckpoint | null {
    const row = this.db
      .prepare(`SELECT * FROM session_checkpoints WHERE id = ?`)
      .get(id) as RawRow | undefined;
    return row ? rowToCheckpoint(row) : null;
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM session_checkpoints WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  /**
   * GC: keep the most recent `max` checkpoints for a thread, delete the rest.
   */
  trimToMax(threadId: string, max: number): void {
    this.db
      .prepare(
        `DELETE FROM session_checkpoints
         WHERE threadId = ?
           AND id NOT IN (
             SELECT id FROM session_checkpoints
             WHERE threadId = ?
             ORDER BY createdAt DESC
             LIMIT ?
           )`,
      )
      .run(threadId, threadId, max);
  }
}
