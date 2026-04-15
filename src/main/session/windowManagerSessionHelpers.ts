/**
 * windowManagerSessionHelpers.ts — Session-aware window helpers for Phase D.
 *
 * Provides session lookup and worktree-aware cwd resolution without importing
 * from windowManager.ts (avoids circular deps: windowManager → sessionStore →
 * windowManager).  windowManager.ts imports these helpers; callers that need
 * both import from each module independently.
 */

import type { Session } from './session';
import { getSessionStore } from './sessionStore';

// ─── Session lookup ───────────────────────────────────────────────────────────

/**
 * Map from window ID → active session ID.
 * Populated by windowManager.registerManagedWindow when a session is assigned.
 * This module owns the map so windowManager can delegate without creating a
 * circular dependency through sessionStore.
 */
const windowSessionMap = new Map<number, string>();

/** Called by windowManager when a session is assigned to a window. */
export function setWindowActiveSession(winId: number, sessionId: string): void {
  windowSessionMap.set(winId, sessionId);
}

/** Called by windowManager on window close. */
export function clearWindowActiveSession(winId: number): void {
  windowSessionMap.delete(winId);
}

/**
 * Returns the active Session for a window, or null if none exists.
 * Returns null when sessionStore is not yet initialised or the session
 * record has been deleted.
 */
export function getSessionForWindow(winId: number): Session | null {
  const sessionId = windowSessionMap.get(winId);
  if (!sessionId) return null;
  return getSessionStore()?.getById(sessionId) ?? null;
}

// ─── Project root helpers ─────────────────────────────────────────────────────

/**
 * Returns the session's projectRoot, or null if no session is active for the
 * window.
 */
export function getProjectRootForWindow(winId: number): string | null {
  return getSessionForWindow(winId)?.projectRoot ?? null;
}

/**
 * Returns `[session.projectRoot]` for the window's active session, or an
 * empty array if no session exists.  Multi-root sessions are a future concern
 * (Wave 17+).
 */
export function getProjectRootsForWindow(winId: number): string[] {
  const session = getSessionForWindow(winId);
  if (!session) return [];
  return [session.projectRoot];
}

// ─── Worktree cwd helpers ─────────────────────────────────────────────────────

/**
 * Returns worktreePath when the session has an active worktree with a resolved
 * path, otherwise falls back to projectRoot.
 */
export function buildWorktreeCwd(session: Session): string {
  if (session.worktree && session.worktreePath) {
    return session.worktreePath;
  }
  return session.projectRoot;
}

/**
 * Composed helper: look up the active session for a window and return its
 * effective cwd (worktreePath if active, projectRoot otherwise).
 *
 * Returns null when no session is registered for the window or when
 * sessionStore is not yet initialised.
 */
export function resolveActiveSessionCwd(winId: number): string | null {
  const session = getSessionForWindow(winId);
  if (!session) return null;
  return buildWorktreeCwd(session);
}
