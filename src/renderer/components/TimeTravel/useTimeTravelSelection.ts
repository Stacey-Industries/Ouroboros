import { useCallback, useMemo, useState } from 'react';

import type { WorkspaceSnapshot } from '../../types/electron';
import { getNextSelectionState } from './timeTravelUtils';

export interface ChangedFilesArgs {
  projectRoot?: string;
  sortedSnapshots: WorkspaceSnapshot[];
  selectedId: string | null;
  selectedSnapshot: WorkspaceSnapshot | null;
  compareMode: boolean;
  compareFromId: string | null;
  compareToId: string | null;
}

export function findSnapshotById(
  sortedSnapshots: WorkspaceSnapshot[],
  id: string | null,
): WorkspaceSnapshot | null {
  if (!id) return null;
  return sortedSnapshots.find((snapshot) => snapshot.id === id) ?? null;
}

function useSnapshotSelectionIds() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareFromId, setCompareFromId] = useState<string | null>(null);
  const [compareToId, setCompareToId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  return {
    selectedId,
    setSelectedId,
    compareFromId,
    setCompareFromId,
    compareToId,
    setCompareToId,
    compareMode,
    setCompareMode,
  };
}

function useSnapshotClickHandler(ids: ReturnType<typeof useSnapshotSelectionIds>) {
  const {
    selectedId,
    compareFromId,
    compareToId,
    compareMode,
    setSelectedId,
    setCompareFromId,
    setCompareToId,
  } = ids;
  return useCallback(
    (snapshot: WorkspaceSnapshot) => {
      const next = getNextSelectionState(snapshot.id, {
        selectedId,
        compareFromId,
        compareToId,
        compareMode,
      });
      setSelectedId(next.selectedId);
      setCompareFromId(next.compareFromId);
      setCompareToId(next.compareToId);
    },
    [
      compareFromId,
      compareMode,
      compareToId,
      selectedId,
      setSelectedId,
      setCompareFromId,
      setCompareToId,
    ],
  );
}

function useResolvedSnapshots(
  sortedSnapshots: WorkspaceSnapshot[],
  selectedId: string | null,
  compareFromId: string | null,
  compareToId: string | null,
) {
  const selectedSnapshot = useMemo(
    () => findSnapshotById(sortedSnapshots, selectedId),
    [selectedId, sortedSnapshots],
  );
  const compareFromSnapshot = useMemo(
    () => findSnapshotById(sortedSnapshots, compareFromId),
    [compareFromId, sortedSnapshots],
  );
  const compareToSnapshot = useMemo(
    () => findSnapshotById(sortedSnapshots, compareToId),
    [compareToId, sortedSnapshots],
  );
  return { selectedSnapshot, compareFromSnapshot, compareToSnapshot };
}

export function useSnapshotSelection(sortedSnapshots: WorkspaceSnapshot[]) {
  const ids = useSnapshotSelectionIds();
  const {
    selectedId,
    compareFromId,
    compareToId,
    compareMode,
    setCompareMode,
    setCompareFromId,
    setCompareToId,
  } = ids;
  const { selectedSnapshot, compareFromSnapshot, compareToSnapshot } = useResolvedSnapshots(
    sortedSnapshots,
    selectedId,
    compareFromId,
    compareToId,
  );
  const comparisonReady = compareMode && Boolean(compareFromSnapshot && compareToSnapshot);
  const handleSnapshotClick = useSnapshotClickHandler(ids);
  const toggleCompareMode = useCallback(() => {
    setCompareMode((current) => !current);
    setCompareFromId(null);
    setCompareToId(null);
  }, [setCompareMode, setCompareFromId, setCompareToId]);
  return {
    selectedId,
    compareFromId,
    compareToId,
    compareMode,
    selectedSnapshot,
    compareFromSnapshot,
    compareToSnapshot,
    comparisonReady,
    handleSnapshotClick,
    toggleCompareMode,
  };
}

export function createChangedFilesArgs(
  projectRoot: string | undefined,
  sortedSnapshots: WorkspaceSnapshot[],
  selectionState: ReturnType<typeof useSnapshotSelection>,
): ChangedFilesArgs {
  return {
    projectRoot,
    sortedSnapshots,
    selectedId: selectionState.selectedId,
    selectedSnapshot: selectionState.selectedSnapshot,
    compareMode: selectionState.compareMode,
    compareFromId: selectionState.compareFromId,
    compareToId: selectionState.compareToId,
  };
}
