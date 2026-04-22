import { useMemo } from 'react';

import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { useFileViewerManager } from '../../FileViewer/FileViewerManager';

export type WorkbenchArtifactKind = 'empty' | 'file' | 'diff';

export interface WorkbenchArtifactsState {
  kind: WorkbenchArtifactKind;
  activeKey: string | null;
  title: string;
  subtitle: string | null;
  hasArtifact: boolean;
}

function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() ?? filePath;
}

export function useWorkbenchArtifacts(): WorkbenchArtifactsState {
  const { activeFile, openFiles } = useFileViewerManager();
  const { state } = useDiffReview();

  return useMemo<WorkbenchArtifactsState>(() => {
    if (state) {
      return {
        kind: 'diff',
        activeKey: `diff:${state.sessionId}:${state.snapshotHash}`,
        title: 'Diff Review',
        subtitle: `${state.files.length} file${state.files.length === 1 ? '' : 's'}`,
        hasArtifact: true,
      };
    }
    if (activeFile) {
      return {
        kind: 'file',
        activeKey: `file:${activeFile.path}`,
        title: getFileName(activeFile.path),
        subtitle: openFiles.length > 1
          ? `${openFiles.length} open files`
          : 'Editor',
        hasArtifact: true,
      };
    }
    return {
      kind: 'empty',
      activeKey: null,
      title: 'Artifacts',
      subtitle: null,
      hasArtifact: false,
    };
  }, [activeFile, openFiles.length, state]);
}
