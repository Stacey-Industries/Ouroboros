/**
 * identityRegistry.ts — In-memory identity registry for the new chat state path.
 *
 * Five canonical ID types in flight; this is the ONLY translation surface.
 * See spec §4.3 and wave-86-decisions.md Decision 2.
 *
 * Phase 1: in-memory only. SQLite persistence (identity_aliases table) comes in Phase 2.
 *
 * Every reverse-lookup method:
 *   1. Throws ChatStateError on unknown ID (Decision 3 — hard-fail).
 *   2. Emits [trace:identity] log on both success and throw paths.
 */

import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';

import log from '../logger';
import { ChatStateError } from './chatStateError';

// ─── Internal record shape ────────────────────────────────────────────────────

interface TurnRecord {
  threadId: ThreadId;
  providerSessionId: ProviderSessionId | undefined;
  retired: boolean;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export class IdentityRegistry {
  /** turnId → TurnRecord */
  private readonly turns = new Map<TurnId, TurnRecord>();

  /** threadId → active (non-retired) turnId */
  private readonly activeByThread = new Map<ThreadId, TurnId>();

  /** providerSessionId → threadId (populated when PSID is assigned) */
  private readonly threadByProvider = new Map<ProviderSessionId, ThreadId>();

  // ─── Registrations ──────────────────────────────────────────────────────────

  /**
   * Register a new turn for a thread.
   * Called at turn-submit time before spawning the subprocess.
   */
  registerTurn(threadId: ThreadId, turnId: TurnId): void {
    this.turns.set(turnId, { threadId, providerSessionId: undefined, retired: false });
    this.activeByThread.set(threadId, turnId);
    log.info('[trace:identity]', {
      op: 'registerTurn',
      threadId,
      turnId,
      result: 'ok',
    });
  }

  /**
   * Assign a ProviderSessionId (from the CLI's session_id field) to an existing turn.
   * One-way: a second call with a DIFFERENT value throws (Wave 84 Phase A bug class made
   * structurally impossible). A second call with the SAME value is a no-op.
   */
  assignProviderSession(turnId: TurnId, psid: ProviderSessionId): void {
    const record = this.turns.get(turnId);
    if (!record) {
      // Decision 3: throw on unknown turn ID.
      throw new ChatStateError('unknown-turn', `assignProviderSession: unknown turnId ${turnId}`, {
        turnId,
        psid,
      });
    }

    if (record.providerSessionId !== undefined && record.providerSessionId !== psid) {
      // Decision 3: throw on duplicate assignment with different value.
      throw new ChatStateError(
        'duplicate-provider-session-assignment',
        `assignProviderSession: turnId ${turnId} already has a different ProviderSessionId`,
        { turnId, existing: record.providerSessionId, attempted: psid },
      );
    }

    if (record.providerSessionId === psid) {
      // Same value — idempotent, no-op.
      log.info('[trace:identity]', { op: 'assignProviderSession', turnId, psid, result: 'noop' });
      return;
    }

    record.providerSessionId = psid;
    this.threadByProvider.set(psid, record.threadId);
    log.info('[trace:identity]', {
      op: 'assignProviderSession',
      turnId,
      psid,
      threadId: record.threadId,
      result: 'ok',
    });
  }

  /**
   * Retire a turn after it has completed.
   * Does NOT remove from the turns map — reverse lookups must still work for
   * event normalization that arrives slightly after completion.
   */
  retireTurn(turnId: TurnId): void {
    const record = this.turns.get(turnId);
    if (!record) {
      log.info('[trace:identity]', {
        op: 'retireTurn',
        turnId,
        result: 'noop-unknown',
      });
      return;
    }
    record.retired = true;
    // Remove from active-by-thread only if this turn is still the active one.
    const active = this.activeByThread.get(record.threadId);
    if (active === turnId) {
      this.activeByThread.delete(record.threadId);
    }
    log.info('[trace:identity]', {
      op: 'retireTurn',
      turnId,
      threadId: record.threadId,
      result: 'ok',
    });
  }

  // ─── Forward lookups ────────────────────────────────────────────────────────

  /** Returns the active (non-retired) turn for a thread, or undefined if idle. */
  getActiveTurn(threadId: ThreadId): TurnId | undefined {
    return this.activeByThread.get(threadId);
  }

  /** Returns the ProviderSessionId for the active turn of a thread, or undefined. */
  getProviderSession(threadId: ThreadId): ProviderSessionId | undefined {
    const turnId = this.activeByThread.get(threadId);
    if (!turnId) return undefined;
    return this.turns.get(turnId)?.providerSessionId;
  }

  // ─── SQLite rebuild ─────────────────────────────────────────────────────────

  /**
   * Rebuild the in-memory registry from persisted identity_aliases rows.
   * Called once on app start, after the SQLite DB is open, so the registry
   * survives process restart.
   *
   * Design choice: reset before replay. The alternative (guard-against-duplicate)
   * would require exposing "has this turn already been registered?" logic that
   * callers don't otherwise need. A clean reset is simpler and idempotent —
   * calling rebuildFromSQLite twice produces the same final state as calling it
   * once, because the maps are cleared first.
   *
   * Only non-retired aliases are replayed into the active-by-thread map;
   * all aliases (retired or not) are replayed into the turns map so that
   * reverse lookups for late-arriving events still resolve.
   *
   * See spec §4.3 and wave-86-decisions.md Decision 9.
   */
  rebuildFromSQLite(persistence: import('./chatPersistenceLayer').ChatPersistenceLayer): void {
    // Reset all maps — makes this call idempotent.
    this.turns.clear();
    this.activeByThread.clear();
    this.threadByProvider.clear();

    const aliases = persistence.loadAliases();
    for (const alias of aliases) {
      // Register turn record (covers retired turns too — reverse lookups must still work).
      this.turns.set(alias.turnId, {
        threadId: alias.threadId,
        providerSessionId: alias.providerSessionId,
        retired: alias.retiredAt !== null,
      });

      // Rebuild PSID → threadId reverse map.
      if (alias.providerSessionId !== undefined) {
        this.threadByProvider.set(alias.providerSessionId, alias.threadId);
      }

      // Only non-retired turns become the active turn for their thread.
      // If multiple non-retired rows exist for the same threadId (shouldn't
      // happen in practice), the last one by created_at wins because
      // loadAliases returns rows ordered ASC.
      if (alias.retiredAt === null) {
        this.activeByThread.set(alias.threadId, alias.turnId);
      }
    }

    log.info('[trace:identity]', {
      op: 'rebuildFromSQLite',
      aliasCount: aliases.length,
      activeCount: this.activeByThread.size,
      result: 'ok',
    });
  }

  // ─── Reverse lookups (throw on miss) ────────────────────────────────────────

  /**
   * Reverse lookup: given a TurnId, return the ThreadId.
   * Throws ChatStateError({kind: 'unknown-turn'}) if the turn was never registered.
   * Emits [trace:identity] on both paths.
   */
  threadIdForTurn(turnId: TurnId): ThreadId {
    const start = Date.now();
    const record = this.turns.get(turnId);
    if (!record) {
      log.info('[trace:identity]', {
        op: 'threadIdForTurn',
        externalId: turnId,
        result: 'throw',
        elapsed_ms: Date.now() - start,
      });
      // Decision 3: throw, do not catch.
      throw new ChatStateError('unknown-turn', `threadIdForTurn: unknown turnId ${turnId}`, {
        turnId,
      });
    }
    log.info('[trace:identity]', {
      op: 'threadIdForTurn',
      externalId: turnId,
      threadId: record.threadId,
      result: 'ok',
      elapsed_ms: Date.now() - start,
    });
    return record.threadId;
  }

  /**
   * Reverse lookup: given a ProviderSessionId, return the ThreadId.
   * Throws ChatStateError({kind: 'unknown-provider-session'}) on miss.
   * Emits [trace:identity] on both paths.
   */
  threadIdForProviderSession(psid: ProviderSessionId): ThreadId {
    const start = Date.now();
    const threadId = this.threadByProvider.get(psid);
    if (!threadId) {
      log.info('[trace:identity]', {
        op: 'threadIdForProviderSession',
        externalId: psid,
        result: 'throw',
        elapsed_ms: Date.now() - start,
      });
      // Decision 3: throw, do not catch.
      throw new ChatStateError(
        'unknown-provider-session',
        `threadIdForProviderSession: unknown ProviderSessionId ${psid}`,
        { psid },
      );
    }
    log.info('[trace:identity]', {
      op: 'threadIdForProviderSession',
      externalId: psid,
      threadId,
      result: 'ok',
      elapsed_ms: Date.now() - start,
    });
    return threadId;
  }
}
