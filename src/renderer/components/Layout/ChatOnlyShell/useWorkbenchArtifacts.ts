import { useMemo } from 'react';

import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import type { DiffReviewState } from '../../DiffReview/types';
import { type OpenFile, useFileViewerManager } from '../../FileViewer/FileViewerManager';
import { useSessions } from '../../SessionSidebar/useSessions';
import { type ArtifactHistoryEntry, useArtifactHistoryStack } from './useArtifactHistoryStack';

export type WorkbenchArtifactKind = 'empty' | 'file' | 'diff';

export interface WorkbenchArtifactsState {
  kind: WorkbenchArtifactKind;
  activeKey: string | null;
  title: string;
  subtitle: string | null;
  hasArtifact: boolean;
  history: ArtifactHistoryEntry[];
  selectArtifact: (key: string | null) => void;
  selectedKey: string | null;
  selectedArtifact: ArtifactHistoryEntry | null;
}

function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() ?? filePath;
}

function toFileArtifact(
  activeFile: OpenFile | null,
  openFileCount: number,
): ArtifactHistoryEntry | null {
  if (!activeFile) return null;
  return {
    key: `file:${activeFile.path}`,
    kind: 'file',
    title: getFileName(activeFile.path),
    subtitle: openFileCount > 1 ? `${openFileCount} open files` : 'Editor',
    filePath: activeFile.path,
  };
}

function toDiffArtifact(state: DiffReviewState | null): ArtifactHistoryEntry | null {
  if (!state) return null;
  return {
    key: `diff:${state.sessionId}:${state.snapshotHash}`,
    kind: 'diff',
    title: 'Diff Review',
    subtitle: `${state.files.length} file${state.files.length === 1 ? '' : 's'}`,
    review: {
      sessionId: state.sessionId,
      snapshotHash: state.snapshotHash,
      projectRoot: state.projectRoot,
      filePaths: state.filePaths,
    },
  };
}

function toEmptyState(
  args: Pick<
    WorkbenchArtifactsState,
    'history' | 'selectArtifact' | 'selectedArtifact' | 'selectedKey'
  >,
): WorkbenchArtifactsState {
  return {
    kind: 'empty',
    activeKey: null,
    title: 'Artifacts',
    subtitle: null,
    hasArtifact: false,
    ...args,
  };
}

export function useWorkbenchArtifacts(): WorkbenchArtifactsState {
  const { activeFile, openFiles } = useFileViewerManager();
  const { state } = useDiffReview();
  const { activeSessionId } = useSessions();
  const sessionKey = activeSessionId ?? 'global';
  const currentDiffArtifact = useMemo(() => toDiffArtifact(state), [state]);
  const currentFileArtifact = useMemo(
    () => toFileArtifact(activeFile, openFiles.length),
    [activeFile, openFiles.length],
  );
  const historyState = useArtifactHistoryStack({
    sessionKey,
    observedArtifact: [currentDiffArtifact, currentFileArtifact].filter(
      Boolean,
    ) as ArtifactHistoryEntry[],
  });

  return useMemo<WorkbenchArtifactsState>(() => {
    const resolvedArtifact =
      historyState.selectedArtifact ??
      currentDiffArtifact ??
      currentFileArtifact ??
      historyState.history[0] ??
      null;

    if (!resolvedArtifact) {
      return toEmptyState(historyState);
    }

    return {
      kind: resolvedArtifact.kind,
      activeKey: resolvedArtifact.key,
      title: resolvedArtifact.title,
      subtitle: resolvedArtifact.subtitle,
      hasArtifact: true,
      history: historyState.history,
      selectArtifact: historyState.selectArtifact,
      selectedKey: historyState.selectedKey,
      selectedArtifact: historyState.selectedArtifact,
    };
  }, [currentDiffArtifact, currentFileArtifact, historyState]);
}
