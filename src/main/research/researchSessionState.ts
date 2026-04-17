/**
 * researchSessionState.ts — Per-session research mode store.
 *
 * Wave 30 Phase C. Module-level Map keyed by sessionId (chat thread ID).
 * Consumed by the trigger evaluator (Phase D) via sessionFlags injection.
 *
 * Default when session is absent: mode 'conservative', enhancedLibraries empty.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResearchMode = 'off' | 'conservative' | 'aggressive';

export interface ResearchSessionSnapshot {
  mode: ResearchMode;
  enhancedLibraries: ReadonlySet<string>;
}

// ─── Internal store ───────────────────────────────────────────────────────────

interface SessionEntry {
  mode: ResearchMode;
  enhancedLibraries: Set<string>;
}

const sessions = new Map<string, SessionEntry>();

function getOrCreate(sessionId: string): SessionEntry {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const entry: SessionEntry = { mode: 'conservative', enhancedLibraries: new Set() };
  sessions.set(sessionId, entry);
  return entry;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getResearchMode(sessionId: string): ResearchMode {
  return sessions.get(sessionId)?.mode ?? 'conservative';
}

export function setResearchMode(sessionId: string, mode: ResearchMode): void {
  getOrCreate(sessionId).mode = mode;
}

export function getEnhancedLibraries(sessionId: string): ReadonlySet<string> {
  return sessions.get(sessionId)?.enhancedLibraries ?? new Set<string>();
}

export function addEnhancedLibrary(sessionId: string, library: string): void {
  getOrCreate(sessionId).enhancedLibraries.add(library);
}

export function getSnapshot(sessionId: string): ResearchSessionSnapshot {
  const entry = sessions.get(sessionId);
  return {
    mode: entry?.mode ?? 'conservative',
    enhancedLibraries: entry?.enhancedLibraries ?? new Set<string>(),
  };
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** @internal Test-only — resets all session state. */
export function resetAllForTests(): void {
  sessions.clear();
}
