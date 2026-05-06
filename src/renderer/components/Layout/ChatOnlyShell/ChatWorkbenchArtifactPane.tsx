import React from 'react';

import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { DiffReviewPanel } from '../../DiffReview/DiffReviewPanel';
import { useFileViewerManager } from '../../FileViewer/FileViewerManager';
import { FileViewerTabs } from '../../FileViewer/FileViewerTabs';
import { EditorContent } from '../EditorContent';
import { useWorkbenchArtifacts } from './useWorkbenchArtifacts';

export interface ChatWorkbenchArtifactPaneProps {
  onClose: () => void;
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

  // Wave 82 (post-smoke): top strip + Recent section both removed per Cole.
  // Both were redundant with the FileViewerTabs row immediately below.
  // EmptyArtifactState shows its own close affordance when the pane is empty.
  return (
    <aside
      className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-border-semantic bg-surface-panel/95"
      data-testid="chat-workbench-artifact-pane"
    >
      {artifact.kind === 'diff' && <DiffArtifactContent />}
      {artifact.kind === 'file' && <FileArtifactContent />}
      {artifact.kind === 'empty' && <EmptyArtifactStateWithClose onClose={onClose} />}
    </aside>
  );
}

function EmptyArtifactStateWithClose({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-end border-b border-border-semantic-subtle px-3 py-1">
        <button
          type="button"
          className="text-xs text-text-semantic-muted hover:text-text-semantic-primary transition-colors"
          onClick={onClose}
          data-testid="chat-workbench-artifact-close"
          aria-label="Close artifact pane"
        >
          ✕
        </button>
      </div>
      <EmptyArtifactState />
    </div>
  );
}
