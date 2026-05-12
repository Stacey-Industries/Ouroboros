/**
 * chatPersistenceLayer.ts — Single-writer SQLite façade for Wave 86 chat state.
 *
 * All SQLite writes from the new chat state path MUST go through this class.
 * Accepts the same better-sqlite3 Database instance used by ThreadStoreSqliteRuntime
 * — do NOT open a new connection.
 *
 * Phase 2 scope: alias CRUD, thread Phase-2 columns, per-message canonical_event_log.
 * Existing threadStoreSqlite.ts callers are NOT yet migrated here — Phase 6 handles
 * the full consolidation.
 *
 * Decision 5 (wave-86): SQLite is the only authoritative persistence store.
 * Decision 3 (wave-86): persistence failures must NOT kill in-flight runtime state —
 * every public method wraps its writes in a try/catch that logs at error level.
 *
 * See spec §4.6 and wave-86-decisions.md Decisions 5 and 9.
 */

import type {
  CanonicalChatEvent,
  ProviderSessionId,
  ThreadId,
  TurnId,
} from '@shared/types/canonicalChatEvent';

import log from '../logger';
import type { Database } from '../storage/database';

// ─── Row shape returned by loadAliases ───────────────────────────────────────

export interface AliasRow {
  threadId: ThreadId;
  turnId: TurnId;
  providerSessionId: ProviderSessionId | undefined;
  createdAt: number;
  retiredAt: number | null;
}

// ─── Raw DB row (better-sqlite3 returns snake_case) ───────────────────────────

interface RawAliasRow {
  thread_id: string;
  turn_id: string;
  provider_session_id: string | null;
  created_at: number;
  retired_at: number | null;
}

// ─── ChatPersistenceLayer ─────────────────────────────────────────────────────

export class ChatPersistenceLayer {
  constructor(private readonly db: Database) {}

  // ─── identity_aliases CRUD ─────────────────────────────────────────────────

  /**
   * Insert a new alias row when a turn is registered.
   * provider_session_id is NULL until assignProviderSessionToAlias is called.
   */
  insertAlias(record: { threadId: ThreadId; turnId: TurnId; createdAt: number }): void {
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO identity_aliases
             (thread_id, turn_id, provider_session_id, created_at, retired_at)
           VALUES (?, ?, NULL, ?, NULL)`,
        )
        .run(record.threadId, record.turnId, record.createdAt);
    } catch (err) {
      log.error('[chatPersistenceLayer] insertAlias failed', { err, record });
    }
  }

  /**
   * Assign a ProviderSessionId to an existing alias row.
   * One-way: mirrors IdentityRegistry.assignProviderSession semantics.
   */
  assignProviderSessionToAlias(turnId: TurnId, psid: ProviderSessionId): void {
    try {
      this.db
        .prepare(
          `UPDATE identity_aliases SET provider_session_id = ?
           WHERE turn_id = ? AND provider_session_id IS NULL`,
        )
        .run(psid, turnId);
    } catch (err) {
      log.error('[chatPersistenceLayer] assignProviderSessionToAlias failed', { err, turnId });
    }
  }

  /** Mark the turn's alias row as retired. */
  retireAlias(turnId: TurnId, retiredAt: number): void {
    try {
      this.db
        .prepare(`UPDATE identity_aliases SET retired_at = ? WHERE turn_id = ?`)
        .run(retiredAt, turnId);
    } catch (err) {
      log.error('[chatPersistenceLayer] retireAlias failed', { err, turnId });
    }
  }

  /**
   * Load all alias rows, ordered by created_at ASC (deterministic for rebuild).
   * Used by IdentityRegistry.rebuildFromSQLite on app start.
   */
  loadAliases(): AliasRow[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT thread_id, turn_id, provider_session_id, created_at, retired_at
           FROM identity_aliases
           ORDER BY created_at ASC`,
        )
        .all() as RawAliasRow[];
      return rows.map(
        (r): AliasRow => ({
          threadId: r.thread_id as ThreadId,
          turnId: r.turn_id as TurnId,
          providerSessionId:
            r.provider_session_id != null
              ? (r.provider_session_id as ProviderSessionId)
              : undefined,
          createdAt: r.created_at,
          retiredAt: r.retired_at,
        }),
      );
    } catch (err) {
      log.error('[chatPersistenceLayer] loadAliases failed', { err });
      return [];
    }
  }

  // ─── Thread-level Phase 2 columns ─────────────────────────────────────────

  /** Record the last known ProviderSessionId for a thread (used by --resume). */
  setLastProviderSession(threadId: ThreadId, psid: ProviderSessionId | null): void {
    try {
      this.db
        .prepare(`UPDATE threads SET lastProviderSessionId = ? WHERE id = ?`)
        .run(psid ?? null, threadId);
    } catch (err) {
      log.error('[chatPersistenceLayer] setLastProviderSession failed', { err, threadId });
    }
  }

  /** Set or clear the interrupted-at marker for crash recovery. */
  setLastInterruptedAt(threadId: ThreadId, timestamp: number | null): void {
    try {
      this.db
        .prepare(`UPDATE threads SET lastInterruptedAt = ? WHERE id = ?`)
        .run(timestamp, threadId);
    } catch (err) {
      log.error('[chatPersistenceLayer] setLastInterruptedAt failed', { err, threadId });
    }
  }

  // ─── Message-level Phase 2 column ─────────────────────────────────────────

  /**
   * Persist the canonical event log for a message.
   * Called on turn commit (message_committed transition).
   * Overwrites any existing value — the log is complete at commit time.
   */
  appendCanonicalEventLog(messageId: string, eventLog: CanonicalChatEvent[]): void {
    try {
      this.db
        .prepare(`UPDATE messages SET canonical_event_log = ? WHERE id = ?`)
        .run(JSON.stringify(eventLog), messageId);
    } catch (err) {
      log.error('[chatPersistenceLayer] appendCanonicalEventLog failed', { err, messageId });
    }
  }
}
