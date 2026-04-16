/**
 * ptyThreadLink.ts — Wave 21 Phase G
 *
 * Helpers for linking PTY sessions to chat threads.
 * Extracted from pty.ts to keep that file under the 300-line ESLint limit.
 */

import { sessions } from './pty';

/**
 * Link a running PTY session to a chat thread.
 * Idempotent — calling again with the same threadId is a no-op.
 * Terminal close does not remove this link; it becomes part of history.
 */
export function linkSessionToThread(
  sessionId: string,
  threadId: string,
): { success: boolean; error?: string } {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, error: `Session ${sessionId} not found` };
  session.threadId = threadId;
  return { success: true };
}

/** Return the threadId linked to a session, or null if not linked. */
export function getLinkedThread(
  sessionId: string,
): { success: boolean; threadId: string | null; error?: string } {
  const session = sessions.get(sessionId);
  if (!session) {
    return { success: false, threadId: null, error: `Session ${sessionId} not found` };
  }
  return { success: true, threadId: session.threadId ?? null };
}

/** Return all active session IDs that are linked to the given threadId. */
export function getLinkedSessionIds(threadId: string): string[] {
  return Array.from(sessions.values())
    .filter((s) => s.threadId === threadId)
    .map((s) => s.id);
}
