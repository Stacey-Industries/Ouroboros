/**
 * messageReactions.ts — Pure helpers for managing message reactions.
 *
 * Functions operate on a Reaction[] array; persistence is the caller's
 * responsibility (typically via threadStore.setMessageReactions).
 */

import type { Reaction } from '@shared/types/agentChat';

// ── MessageStore adaptor ──────────────────────────────────────────────────────

/**
 * Minimal adaptor required by the reaction helpers.
 * The real  satisfies this interface — pass it directly
 * in production. Tests can provide a lightweight stub.
 */
export interface ReactionStore {
  getMessageReactions: (messageId: string, threadId: string) => Promise<Reaction[]>;
  setMessageReactions: (messageId: string, threadId: string, reactions: Reaction[]) => Promise<void>;
}

/**
 * Wave 41 E.2 — composite target for reaction ops.
 * Avoids max-params (4) lint error on addReaction / removeReaction.
 */
export interface ReactionTarget {
  messageId: string;
  threadId: string;
  kind: string;
  by?: string;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Return a new array with  appended, unless an identical (kind, by)
 * pair already exists (idempotent add).
 */
export function addReactionToList(reactions: Reaction[], reaction: Reaction): Reaction[] {
  const exists = reactions.some(
    (r) => r.kind === reaction.kind && r.by === reaction.by,
  );
  if (exists) return reactions;
  return [...reactions, reaction];
}

/**
 * Return a new array with all reactions matching  and  removed.
 * When  is undefined, removes any reaction of that kind regardless of owner.
 */
export function removeReactionFromList(
  reactions: Reaction[],
  kind: string,
  by: string | undefined,
): Reaction[] {
  return reactions.filter((r) => {
    if (r.kind !== kind) return true;
    if (by === undefined) return false;
    return r.by !== by;
  });
}

// ── Service functions ────────────────────────────────────────────────────────

/**
 * Get current reactions for a message.
 * Returns [] if the message has no reactions or does not exist.
 */
export async function getReactions(
  store: ReactionStore,
  messageId: string,
  threadId: string,
): Promise<Reaction[]> {
  return store.getMessageReactions(messageId, threadId);
}

/**
 * Add a reaction of  to the message (scoped by threadId).
 * No-ops if the same (kind, by) pair already exists.
 * Returns the updated reaction list.
 */
export async function addReaction(
  store: ReactionStore,
  target: ReactionTarget,
): Promise<Reaction[]> {
  const { messageId, threadId, kind, by } = target;
  const current = await store.getMessageReactions(messageId, threadId);
  const reaction: Reaction = { kind, at: Date.now(), ...(by !== undefined ? { by } : {}) };
  const updated = addReactionToList(current, reaction);
  await store.setMessageReactions(messageId, threadId, updated);
  return updated;
}

/**
 * Remove all reactions of  from the message (or only those by ),
 * scoped by threadId.
 * Returns the updated reaction list.
 */
export async function removeReaction(
  store: ReactionStore,
  target: ReactionTarget,
): Promise<Reaction[]> {
  const { messageId, threadId, kind, by } = target;
  const current = await store.getMessageReactions(messageId, threadId);
  const updated = removeReactionFromList(current, kind, by);
  await store.setMessageReactions(messageId, threadId, updated);
  return updated;
}
