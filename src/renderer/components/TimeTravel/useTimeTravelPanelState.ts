import log from 'electron-log/renderer';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { WorkspaceSnapshot } from '../../types/electron';
import {
  buildRestoreStatusMessage,
  ChangedFile,
  getNextSelectionState,
  truncateHash,
} from './timeTravelUtils';

interface UseTimeTravelPanelStateArgs {
  projectRoot?: string;
  snapshots: WorkspaceSnapshot[];
  onCreateSnapshot: (label?: string) => Promise<WorkspaceSnapshot | null>;
  onRefreshSnapshots: () => Promise<void>;
}

interface ChangedFilesArgs {
  projectRoot?: string;
  sortedSnapshots: WorkspaceSnapshot[];
  selectedId: string | null;
  selectedSnapshot: WorkspaceSnapshot | null;
  compareMode: boolean;
  compareFromId: string | null;
  compareToId: string | null;
}

function findSnapshotById(
  sortedSnapshots: WorkspaceSnapshot[],
  id: string | null,
): WorkspaceSnapshot | null {
  if (!id) return null;
  return sortedSnapshots.find((snapshot) => snapshot.id === id) ?? null;
}

function useCurrentHead(
  projectRoot?: string,
): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [currentHead, setCurrentHead] = useState<string | null>(null);

  useEffect(() => {
    if (!projectRoot) return;
    let cancelled = false;
    void window.electronAPI.git
      .snapshot(projectRoot)
      .then((result) => {
        if (!cancelled && result.success && result.commitHash) setCurrentHead(result.commitHash);
      })
      .catch((error) => {
        log.error('Failed to fetch git snapshot:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [projectRoot]);

  return [currentHead, setCurrentHead];
}

async function getChangedFilesBetween(
  projectRoot: string,
  fromHash: string,
  toHash: string,
): Promise<ChangedFile[]> {
  const result = await window.electronAPI.git.changedFilesBetween(projectRoot, fromHash, toHash);
  return result.success && result.files ? result.files : [];
}

function getPreviousSnapshot(
  sortedSnapshots: WorkspaceSnapshot[],
  selectedId: string | null,
): WorkspaceSnapshot | null {
  if (!selectedId) return null;
  const currentIndex = sortedSnapshots.findIndex((snapshot) => snapshot.id === selectedId);
  return currentIndex < sortedSnapshots.length - 1 ? sortedSnapshots[currentIndex + 1] : null;
}

function isComparisonRequest(args: ChangedFilesArgs): boolean {
  return Boolean(args.compareMode && args.compareFromId && args.compareToId);
}

async function requestComparisonChangedFiles(args: ChangedFilesArgs): Promise<ChangedFile[]> {
  if (!args.projectRoot) return [];
  const from = findSnapshotById(args.sortedSnapshots, args.compareFromId);
  const to = findSnapshotById(args.sortedSnapshots, args.compareToId);
  if (!from || !to) return [];
  return getChangedFilesBetween(args.projectRoot, from.commitHash, to.commitHash);
}

async function requestSelectedChangedFiles(args: ChangedFilesArgs): Promise<ChangedFile[]> {
  if (!args.projectRoot || !args.selectedSnapshot) return [];
  const previousSnapshot = getPreviousSnapshot(args.sortedSnapshots, args.selectedId);
  if (!previousSnapshot) return [];
  return getChangedFilesBetween(
    args.projectRoot,
    previousSnapshot.commitHash,
    args.selectedSnapshot.commitHash,
  );
}

async function requestChangedFiles(args: ChangedFilesArgs): Promise<ChangedFile[]> {
  if (!args.projectRoot) return [];
  return isComparisonRequest(args)
    ? requestComparisonChangedFiles(args)
    : requestSelectedChangedFiles(args);
}

function useChangedFiles(args: ChangedFilesArgs): {
  changedFiles: ChangedFile[];
  loadingFiles: boolean;
} {
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const hasSelection = Boolean(
    args.selectedSnapshot || (args.compareMode && args.compareFromId && args.compareToId),
  );

  useEffect(() => {
    if (!args.projectRoot || !hasSelection) {
      setChangedFiles([]);
      return;
    }

    let cancelled = false;
    setLoadingFiles(true);
    void requestChangedFiles(args)
      .then((files) => {
        if (!cancelled) setChangedFiles(files);
      })
      .catch((error) => {
        log.error('Failed to load changed files:', error);
        if (!cancelled) setChangedFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [args, hasSelection]);

  return { changedFiles, loadingFiles };
}

function useStatusMessage(): {
  statusMessage: string | null;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
} {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  return { statusMessage, setStatusMessage };
}

async function getDirtyCount(projectRoot?: string): Promise<number> {
  if (!projectRoot) return 0;
  try {
    const result = await window.electronAPI.git.dirtyCount(projectRoot);
    return result.success ? result.count : 0;
  } catch {
    return 0;
  }
}

async function restoreSnapshot(projectRoot: string, snapshot: WorkspaceSnapshot): Promise<string> {
  const result = await window.electronAPI.git.restoreSnapshot(projectRoot, snapshot.commitHash);
  if (!result.success) throw new Error(result.error ?? 'Unknown restore error');
  return buildRestoreStatusMessage(result, snapshot.commitHash);
}

async function createSnapshotAndRefresh(
  onCreateSnapshot: (label?: string) => Promise<WorkspaceSnapshot | null>,
  onRefreshSnapshots: () => Promise<void>,
  snapshotLabel: string,
): Promise<{ message: string; snapshot: WorkspaceSnapshot | null }> {
  const snapshot = await onCreateSnapshot(snapshotLabel || undefined);
  if (!snapshot) return { message: 'Failed to create snapshot.', snapshot: null };
  await onRefreshSnapshots();
  return { message: `Snapshot created: ${truncateHash(snapshot.commitHash)}`, snapshot };
}

function createChangedFilesArgs(
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

function useSnapshotSelection(sortedSnapshots: WorkspaceSnapshot[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareFromId, setCompareFromId] = useState<string | null>(null);
  const [compareToId, setCompareToId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);

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
  const comparisonReady = compareMode && Boolean(compareFromSnapshot && compareToSnapshot);

  const handleSnapshotClick = useCallback(
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
    [compareFromId, compareMode, compareToId, selectedId],
  );

  const toggleCompareMode = useCallback(() => {
    setCompareMode((current) => !current);
    setCompareFromId(null);
    setCompareToId(null);
  }, []);

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

function getRestoreErrorMessage(error: unknown): string {
  return `Restore failed: ${error instanceof Error ? error.message : String(error)}`;
}

function useRestoreState(
  projectRoot: string | undefined,
  setCurrentHead: Dispatch<SetStateAction<string | null>>,
  setStatusMessage: Dispatch<SetStateAction<string | null>>,
) {
  const [confirmRestore, setConfirmRestore] = useState<WorkspaceSnapshot | null>(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [restoring, setRestoring] = useState(false);

  const handleRestoreClick = useCallback(
    async (snapshot: WorkspaceSnapshot) => {
      setDirtyCount(await getDirtyCount(projectRoot));
      setConfirmRestore(snapshot);
    },
    [projectRoot],
  );

  const handleConfirmRestore = useCallback(async () => {
    if (!projectRoot || !confirmRestore) return;
    setRestoring(true);
    try {
      setStatusMessage(await restoreSnapshot(projectRoot, confirmRestore));
      setCurrentHead(confirmRestore.commitHash);
    } catch (error) {
      setStatusMessage(getRestoreErrorMessage(error));
    } finally {
      setRestoring(false);
      setConfirmRestore(null);
    }
  }, [confirmRestore, projectRoot, setCurrentHead, setStatusMessage]);

  return {
    confirmRestore,
    dirtyCount,
    restoring,
    setConfirmRestore,
    handleRestoreClick,
    handleConfirmRestore,
  };
}

function useCreateSnapshotState(
  onCreateSnapshot: (label?: string) => Promise<WorkspaceSnapshot | null>,
  onRefreshSnapshots: () => Promise<void>,
  setCurrentHead: Dispatch<SetStateAction<string | null>>,
  setStatusMessage: Dispatch<SetStateAction<string | null>>,
) {
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);

  const handleCreateSnapshot = useCallback(async () => {
    setCreatingSnapshot(true);
    try {
      const result = await createSnapshotAndRefresh(
        onCreateSnapshot,
        onRefreshSnapshots,
        snapshotLabel,
      );
      setStatusMessage(result.message);
      if (result.snapshot) {
        setSnapshotLabel('');
        setCurrentHead(result.snapshot.commitHash);
      }
    } finally {
      setCreatingSnapshot(false);
    }
  }, [onCreateSnapshot, onRefreshSnapshots, snapshotLabel, setCurrentHead, setStatusMessage]);

  return {
    snapshotLabel,
    creatingSnapshot,
    setSnapshotLabel,
    handleCreateSnapshot,
  };
}

export function useTimeTravelPanelState(args: UseTimeTravelPanelStateArgs) {
  const sortedSnapshots = useMemo(
    () => [...args.snapshots].sort((left, right) => right.timestamp - left.timestamp),
    [args.snapshots],
  );
  const { statusMessage, setStatusMessage } = useStatusMessage();
  const [currentHead, setCurrentHead] = useCurrentHead(args.projectRoot);
  const selectionState = useSnapshotSelection(sortedSnapshots);
  const changedFilesArgs = useMemo(
    () => createChangedFilesArgs(args.projectRoot, sortedSnapshots, selectionState),
    [args.projectRoot, selectionState, sortedSnapshots],
  );
  const { changedFiles, loadingFiles } = useChangedFiles(changedFilesArgs);
  const restoreState = useRestoreState(args.projectRoot, setCurrentHead, setStatusMessage);
  const createSnapshotState = useCreateSnapshotState(
    args.onCreateSnapshot,
    args.onRefreshSnapshots,
    setCurrentHead,
    setStatusMessage,
  );

  return {
    sortedSnapshots,
    changedFiles,
    loadingFiles,
    currentHead,
    statusMessage,
    ...selectionState,
    ...restoreState,
    ...createSnapshotState,
  };
}
