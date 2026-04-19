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
