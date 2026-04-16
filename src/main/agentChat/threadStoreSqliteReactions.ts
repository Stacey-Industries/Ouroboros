/**
 * threadStoreSqliteReactions.ts — Wave 22 Phase A helpers for message reactions
 * and collapsedByDefault, extracted from threadStoreSqlite.ts to stay under the
 * 300-line ESLint limit.
 */

import type { Reaction } from '@shared/types/agentChat';

import type { Database } from '../storage/database';
import { parseJsonField } from './threadStoreSqliteHelpers';

// ── Reactions ─────────────────────────────────────────────────────────────────

export function getMessageReactionsSql(db: Database, messageId: string): Reaction[] {
  const row = db
    .prepare('SELECT reactions FROM messages WHERE id = ?')
    .get(messageId) as { reactions: string | null } | undefined;
  if (!row || !row.reactions) return [];
  return parseJsonField<Reaction[]>(row.reactions) ?? [];
}

export function setMessageReactionsSql(
  db: Database,
  messageId: string,
  reactions: Reaction[],
): void {
  const encoded = reactions.length > 0 ? JSON.stringify(reactions) : null;
  db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(encoded, messageId);
}

// ── Collapsed ─────────────────────────────────────────────────────────────────

export function setMessageCollapsedSql(
  db: Database,
  messageId: string,
  collapsed: boolean,
): void {
  db.prepare('UPDATE messages SET collapsedByDefault = ? WHERE id = ?').run(
    collapsed ? 1 : 0,
    messageId,
  );
}
