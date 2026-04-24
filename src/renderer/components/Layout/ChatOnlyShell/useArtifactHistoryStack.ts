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
  return [entry, ...history.filter((candidate) => candidate.key !== entry.key)];
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
