/**
 * AgentChatStreamingReducers.dedup.ts — Per-message seen-chunk-ID guard.
 *
 * Extracted from AgentChatStreamingReducers.ts to keep that file under the
 * 300-line ESLint limit.
 *
 * Usage:
 *   const seenIds = new Map<string, Set<string>>();  // keyed by messageId
 *   if (isDuplicateChunk(seenIds, chunk.messageId, chunkId)) return prev;
 */

/** Returns true when chunkId has already been processed for this messageId. */
export function isDuplicateChunk(
  seenIds: Map<string, Set<string>>,
  messageId: string,
  chunkId: string,
): boolean {
  let seen = seenIds.get(messageId);
  if (!seen) {
    seen = new Set<string>();
    seenIds.set(messageId, seen);
  }
  if (seen.has(chunkId)) return true;
  seen.add(chunkId);
  return false;
}

/** Drop the seen-ID set for a messageId (call when a stream completes or errors). */
export function clearSeenChunkIds(
  seenIds: Map<string, Set<string>>,
  messageId: string,
): void {
  seenIds.delete(messageId);
}
