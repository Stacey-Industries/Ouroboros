/**
 * subagentLinkResolver.ts — Resolves parentSessionId for a child session from
 * the subagentTracker record store.
 *
 * Pure read — no mutation of tracker state. Never throws on unknown IDs.
 *
 * Wave 57 Phase B.
 */

import { getParentSessionIdFor } from './subagentTracker';

/**
 * Look up the parentSessionId recorded for `childSessionId` in the subagent
 * tracker. Returns the parent ID when found, `undefined` otherwise.
 *
 * Callers should treat `undefined` as "parent unknown" — it does not imply the
 * session is definitely a top-level session.
 */
export function resolveParentSessionId(childSessionId: string): string | undefined {
  if (!childSessionId) return undefined;
  return getParentSessionIdFor(childSessionId);
}
