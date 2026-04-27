import React from 'react';

import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { DiffReviewPanel } from '../../DiffReview/DiffReviewPanel';
import { useFileViewerManager } from '../../FileViewer/FileViewerManager';
import { FileViewerTabs } from '../../FileViewer/FileViewerTabs';
import { EditorContent } from '../EditorContent';
import { ArtifactHistoryList } from './ArtifactHistoryList';
import type { ArtifactHistoryEntry } from './useArtifactHistoryStack';
import { useWorkbenchArtifacts } from './useWorkbenchArtifacts';

export interface ChatWorkbenchArtifactPaneProps {
  onClose: () => void;
}

function ArtifactPaneHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string | null;
  onClose: () => void;
}): React.ReactElement {
  return (
    <header className="flex items-center gap-3 border-b border-border-semantic px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text-semantic-primary">{title}</div>
        {subtitle && <div className="truncate text-xs text-text-semantic-tertiary">{subtitle}</div>}
      </div>
      <button
        type="button"
        className="rounded border border-border-semantic bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
        onClick={onClose}
        data-testid="chat-workbench-artifact-close"
      >
        Close
      </button>
    </header>
  );
}

function EmptyArtifactState(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-semantic-secondary">
      Open a file reference or diff from chat to inspect it here.
    </div>
  );
}

function DiffArtifactContent(): React.ReactElement {
  const {
    state,
    canRollback,
    acceptHunk,
    rejectHunk,
    acceptAllFile,
    rejectAllFile,
    acceptAll,
    rejectAll,
    rollback,
    closeReview,
    confirmStaleOp,
    dismissStaleOp,
  } = useDiffReview();

  if (!state) return <EmptyArtifactState />;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <DiffReviewPanel
        state={state}
        canRollback={canRollback}
        enhancedEnabled={true}
        onAcceptHunk={acceptHunk}
        onRejectHunk={rejectHunk}
        onAcceptAllFile={acceptAllFile}
        onRejectAllFile={rejectAllFile}
        onAcceptAll={acceptAll}
        onRejectAll={rejectAll}
        onRollback={rollback}
        onClose={closeReview}
        onConfirmStaleOp={confirmStaleOp}
        onDismissStaleOp={dismissStaleOp}
      />
    </div>
  );
}

function FileArtifactContent(): React.ReactElement {
  const {
    openFiles,
    activeIndex,
    setActive,
    closeFile,
    pinTab,
    unpinTab,
    togglePin,
    closeOthers,
    closeToRight,
    closeAll,
  } = useFileViewerManager();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="h-10 shrink-0 border-b border-border-semantic bg-surface-panel/80">
        <FileViewerTabs
          files={openFiles}
          activeIndex={activeIndex}
          onActivate={setActive}
          onClose={closeFile}
          onPin={pinTab}
          onUnpin={unpinTab}
          onTogglePin={togglePin}
          onCloseOthers={closeOthers}
          onCloseToRight={closeToRight}
          onCloseAll={closeAll}
        />
      </div>
      <div className="flex flex-1 min-h-0">
        <EditorContent />
      </div>
    </div>
  );
}

export function ChatWorkbenchArtifactPane({
  onClose,
}: ChatWorkbenchArtifactPaneProps): React.ReactElement {
  const artifact = useWorkbenchArtifacts();
  const { openFile } = useFileViewerManager();
  const { openReview } = useDiffReview();

  const handleSelectArtifact = React.useCallback(
    (entry: ArtifactHistoryEntry) => {
      artifact.selectArtifact(entry.key);
      if (entry.kind === 'file') {
        void openFile(entry.filePath);
        return;
      }
      openReview(
        entry.review.sessionId,
        entry.review.snapshotHash,
        entry.review.projectRoot,
        entry.review.filePaths,
      );
    },
    [artifact, openFile, openReview],
  );

  return (
    <aside
      className="flex w-[340px] shrink-0 flex-col border-l border-border-semantic bg-surface-panel/95"
      data-testid="chat-workbench-artifact-pane"
    >
      <ArtifactPaneHeader title={artifact.title} subtitle={artifact.subtitle} onClose={onClose} />
      <ArtifactHistoryList
        items={artifact.history}
        activeKey={artifact.activeKey}
        onSelect={handleSelectArtifact}
      />
      {artifact.kind === 'diff' && <DiffArtifactContent />}
      {artifact.kind === 'file' && <FileArtifactContent />}
      {artifact.kind === 'empty' && <EmptyArtifactState />}
    </aside>
  );
}
