/**
 * threadStoreSqliteReactions.ts — Wave 22 Phase A helpers for message reactions
 * and collapsedByDefault, extracted from threadStoreSqlite.ts to stay under the
 * 300-line ESLint limit.
 *
 * Wave 41 E.2 — all SQL ops now scope by threadId (composite PK: id + threadId)
 * to prevent cross-fork reaction leakage when forked threads share message IDs.
 */

import type { Reaction } from '@shared/types/agentChat';

import type { Database } from '../storage/database';
import { parseJsonField } from './threadStoreSqliteHelpers';

// ── Cap ───────────────────────────────────────────────────────────────────────

/**
 * Maximum number of reactions stored per message.
 * When the cap is reached, the oldest reaction (lowest `at` timestamp) is
 * evicted before the new one is appended (FIFO eviction).
 *
 * Wave 41 Phase N — prevents unbounded reaction growth on high-traffic messages.
 */
export const MAX_REACTIONS_PER_MESSAGE = 64;

/**
 * Enforce the per-message reaction cap with FIFO eviction.
 * Returns a new array with at most MAX_REACTIONS_PER_MESSAGE entries.
 * The incoming `next` reaction has already been appended by the caller;
 * if the result exceeds the cap, the oldest entry (smallest `at`) is dropped.
 */
export function enforceReactionCap(reactions: Reaction[]): Reaction[] {
  if (reactions.length <= MAX_REACTIONS_PER_MESSAGE) return reactions;
  // Sort ascending by `at`, drop the first (oldest), return the rest.
  const sorted = [...reactions].sort((a, b) => a.at - b.at);
  return sorted.slice(sorted.length - MAX_REACTIONS_PER_MESSAGE);
}

// ── Reactions ─────────────────────────────────────────────────────────────────

export function getMessageReactionsSql(
  db: Database,
  messageId: string,
  threadId: string,
): Reaction[] {
  const row = db
    .prepare('SELECT reactions FROM messages WHERE id = ? AND threadId = ?')
    .get(messageId, threadId) as { reactions: string | null } | undefined;
  if (!row || !row.reactions) return [];
  return parseJsonField<Reaction[]>(row.reactions) ?? [];
}

export function setMessageReactionsSql(
  db: Database,
  messageId: string,
  threadId: string,
  reactions: Reaction[],
): void {
  const encoded = reactions.length > 0 ? JSON.stringify(reactions) : null;
  db.prepare('UPDATE messages SET reactions = ? WHERE id = ? AND threadId = ?')
    .run(encoded, messageId, threadId);
}

// ── Collapsed ─────────────────────────────────────────────────────────────────

export function setMessageCollapsedSql(
  db: Database,
  messageId: string,
  threadId: string,
  collapsed: boolean,
): void {
  db.prepare('UPDATE messages SET collapsedByDefault = ? WHERE id = ? AND threadId = ?').run(
    collapsed ? 1 : 0,
    messageId,
    threadId,
  );
}
