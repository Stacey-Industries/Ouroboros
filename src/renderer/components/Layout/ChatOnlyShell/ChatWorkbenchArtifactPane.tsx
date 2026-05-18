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

// Wave 94 — uniform header mirroring ChatWorkbenchUtilityDrawer's chrome so
// the overlay is identifiable + dismissible regardless of which content kind
// (file / diff / empty) is mounted. Pre-Wave-89 the artifact pane was a
// fixed-flex sibling where the parent dock provided implicit context; in
// overlay mode that's gone, so each surface needs its own affordance.
function ArtifactHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}): React.ReactElement {
  return (
    <header className="flex items-center gap-2 border-b border-border-semantic px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
          {title}
        </div>
      </div>
      <button
        type="button"
        className="rounded border border-border-semantic bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
        onClick={onClose}
        data-testid="chat-workbench-artifact-close"
        aria-label="Close artifact pane"
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

function titleForKind(kind: 'diff' | 'file' | 'empty'): string {
  if (kind === 'diff') return 'Diff Review';
  if (kind === 'file') return 'File Viewer';
  return 'Artifacts';
}

export function ChatWorkbenchArtifactPane({
  onClose,
}: ChatWorkbenchArtifactPaneProps): React.ReactElement {
  const artifact = useWorkbenchArtifacts();
  return (
    <aside
      className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-border-semantic bg-surface-overlay"
      data-testid="chat-workbench-artifact-pane"
    >
      <ArtifactHeader title={titleForKind(artifact.kind)} onClose={onClose} />
      {artifact.kind === 'diff' && <DiffArtifactContent />}
      {artifact.kind === 'file' && <FileArtifactContent />}
      {artifact.kind === 'empty' && <EmptyArtifactState />}
    </aside>
  );
}
