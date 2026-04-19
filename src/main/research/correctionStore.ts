/**
 * correctionStore.ts — In-memory per-session correction library tracker.
 *
 * Tracks which libraries have been flagged in self-correction messages
 * during a session. A later wave's research pipeline reads `getLibraries`
 * to decide whether to fire enhanced research for a library.
 *
 * Mirrors researchCorrelation.ts singleton pattern.
 * Wave 29.5 Phase H (H4).
 */

// ─── Store interface ──────────────────────────────────────────────────────────

export interface CorrectionStore {
  /** Record that a correction was made for `library` in `sessionId`. */
  noteCorrection(sessionId: string, library: string): void;

  /**
   * Return the set of libraries flagged for a session.
   * Returns an empty Set if the session has no corrections.
   * Consumers should treat the Set as read-only.
   */
  getLibraries(sessionId: string): Set<string>;

  /** Clear all correction data for a session (call on session end). */
  clearSession(sessionId: string): void;

  /** @internal Test-only reset — clears all sessions. */
  _resetForTests(): void;
}

// ─── Internal state ───────────────────────────────────────────────────────────

interface StoreState {
  sessions: Map<string, Set<string>>;
}

// ─── Operation helpers ────────────────────────────────────────────────────────

function doNoteCorrection(state: StoreState, sessionId: string, library: string): void {
  let libs = state.sessions.get(sessionId);
  if (!libs) {
    libs = new Set<string>();
    state.sessions.set(sessionId, libs);
  }
  libs.add(library);
}

function doGetLibraries(state: StoreState, sessionId: string): Set<string> {
  return state.sessions.get(sessionId) ?? new Set<string>();
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function buildCorrectionStore(): CorrectionStore {
  const state: StoreState = { sessions: new Map() };

  return {
    noteCorrection: (sid, lib) => doNoteCorrection(state, sid, lib),
    getLibraries: (sid) => doGetLibraries(state, sid),
    clearSession: (sid) => { state.sessions.delete(sid); },
    _resetForTests: () => { state.sessions.clear(); },
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let singleton: CorrectionStore | null = null;

export function getCorrectionStore(): CorrectionStore {
  if (!singleton) singleton = buildCorrectionStore();
  return singleton;
}

