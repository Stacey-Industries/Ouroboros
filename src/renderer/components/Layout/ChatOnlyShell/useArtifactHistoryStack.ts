import React from 'react';

export type ArtifactHistoryKind = 'file' | 'diff';

interface ArtifactHistoryBase {
  key: string;
  kind: ArtifactHistoryKind;
  title: string;
  subtitle: string | null;
}

export interface FileArtifactHistoryEntry extends ArtifactHistoryBase {
  kind: 'file';
  filePath: string;
}

export interface DiffArtifactHistoryEntry extends ArtifactHistoryBase {
  kind: 'diff';
  review: {
    sessionId: string;
    snapshotHash: string;
    projectRoot: string;
    filePaths?: string[];
  };
}

export type ArtifactHistoryEntry = FileArtifactHistoryEntry | DiffArtifactHistoryEntry;

interface ArtifactSessionState {
  history: ArtifactHistoryEntry[];
  selectedKey: string | null;
}

const DEFAULT_SESSION_STATE: ArtifactSessionState = {
  history: [],
  selectedKey: null,
};

/** Wave 82 — Phase 0 decision 9 cap (5 chips per row × 2 rows). */
const MAX_RECENT = 10;

const sessionState = new Map<string, ArtifactSessionState>();
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function getSessionState(sessionKey: string): ArtifactSessionState {
  return sessionState.get(sessionKey) ?? DEFAULT_SESSION_STATE;
}

function setSessionState(sessionKey: string, next: ArtifactSessionState): void {
  sessionState.set(sessionKey, next);
  emitChange();
}

function upsertHistoryEntry(
  history: ArtifactHistoryEntry[],
  entry: ArtifactHistoryEntry,
): ArtifactHistoryEntry[] {
  const filtered = history.filter((candidate) => candidate.key !== entry.key);
  return [entry, ...filtered].slice(0, MAX_RECENT);
}

export function resetArtifactHistoryStackForTests(): void {
  sessionState.clear();
  emitChange();
}

export interface UseArtifactHistoryStackOptions {
  sessionKey: string;
  observedArtifact: ArtifactHistoryEntry | ArtifactHistoryEntry[] | null;
}

export interface UseArtifactHistoryStackResult {
  history: ArtifactHistoryEntry[];
  selectedKey: string | null;
  selectedArtifact: ArtifactHistoryEntry | null;
  selectArtifact: (key: string | null) => void;
}

/**
 * Wave 82 — observer with hard cap (MAX_RECENT). Observed artifacts upsert
 * to the front of history, oldest evicted past the cap. Full LRU
 * displacement (where the active artifact is excluded from Recent and only
 * displaced files appear) requires a FileViewerManager close-event
 * subscription that we don't currently expose — deferred to a follow-up wave.
 * The cap satisfies the user's stated "Recent shouldn't fill uncontrollably"
 * requirement; horizontal layout (5 chips × 2 rows) caps visible chips at 10.
 */
function useArtifactObserver(
  sessionKey: string,
  observedArtifact: ArtifactHistoryEntry | ArtifactHistoryEntry[] | null,
): void {
  React.useEffect(() => {
    if (!observedArtifact) return;
    const observedArtifacts = Array.isArray(observedArtifact)
      ? observedArtifact.filter(Boolean)
      : [observedArtifact];
    if (observedArtifacts.length === 0) return;
    const current = getSessionState(sessionKey);
    const nextHistory = [...observedArtifacts]
      .reverse()
      .reduce((history, entry) => upsertHistoryEntry(history, entry), current.history);
    const unchanged =
      nextHistory.length === current.history.length &&
      nextHistory.every((entry, index) => entry.key === current.history[index]?.key);
    if (unchanged) return;
    setSessionState(sessionKey, { ...current, history: nextHistory });
  }, [observedArtifact, sessionKey]);
}

function useSessionSnapshot(sessionKey: string): ArtifactSessionState {
  const subscribe = React.useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return React.useSyncExternalStore(
    subscribe,
    () => getSessionState(sessionKey),
    () => DEFAULT_SESSION_STATE,
  );
}

export function useArtifactHistoryStack({
  sessionKey,
  observedArtifact,
}: UseArtifactHistoryStackOptions): UseArtifactHistoryStackResult {
  const snapshot = useSessionSnapshot(sessionKey);
  useArtifactObserver(sessionKey, observedArtifact);

  const selectArtifact = React.useCallback(
    (key: string | null) => {
      const current = getSessionState(sessionKey);
      if (current.selectedKey === key) return;
      setSessionState(sessionKey, { ...current, selectedKey: key });
    },
    [sessionKey],
  );

  const selectedArtifact = React.useMemo(
    () => snapshot.history.find((entry) => entry.key === snapshot.selectedKey) ?? null,
    [snapshot.history, snapshot.selectedKey],
  );

  return {
    history: snapshot.history,
    selectedKey: snapshot.selectedKey,
    selectedArtifact,
    selectArtifact,
  };
}
