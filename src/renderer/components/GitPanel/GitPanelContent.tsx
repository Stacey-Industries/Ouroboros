import React from 'react';

import { BranchSelector } from './BranchSelector';
import { GitFileRow } from './GitFileRow';
import { CommitSection, ReviewChangesBar } from './GitPanelContentParts';
import type { GitPanelModel } from './useGitPanelModel';

export interface GitPanelContentProps extends GitPanelModel {
  projectRoot: string | null;
}

function EmptyState({
  message,
  centered = false,
}: {
  message: string;
  centered?: boolean;
}): React.ReactElement {
  return (
    <div className={`p-4 ${centered ? 'flex h-full items-center justify-center' : ''}`}>
      <span className={`text-xs text-text-semantic-muted ${centered ? 'text-center' : ''}`}>
        {message}
      </span>
    </div>
  );
}

function ErrorBanner({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <div
      className="flex-shrink-0 border-b border-border-semantic px-2 py-1 text-xs text-status-error"
      style={{ backgroundColor: 'rgba(248, 81, 73, 0.1)' }}
    >
      {error}
      <button onClick={onDismiss} className="ml-2 underline text-status-error">
        dismiss
      </button>
    </div>
  );
}

function SectionHeader({
  count,
  title,
  toggleAllLabel,
  onToggleAll,
}: {
  count: number;
  title: string;
  toggleAllLabel?: string;
  onToggleAll?: () => Promise<void>;
}): React.ReactElement {
  return (
    <div
      className="sticky top-0 z-10 flex items-center justify-between bg-surface-panel px-2 py-1.5"
      style={{
        backdropFilter: 'blur(16px) saturate(130%)',
        WebkitBackdropFilter: 'blur(16px) saturate(130%)',
      }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-text-semantic-muted">
        {title} ({count})
      </span>
      {count > 0 && toggleAllLabel && onToggleAll ? (
        <button
          onClick={() => void onToggleAll()}
          className="rounded px-1.5 py-0.5 text-xs transition-colors duration-75 hover:bg-surface-raised text-text-semantic-muted"
          title={toggleAllLabel}
        >
          {toggleAllLabel}
        </button>
      ) : null}
    </div>
  );
}

interface ChangeSectionProps {
  count: number;
  emptyLabel: string;
  files: Array<[string, string]>;
  isStaged: boolean;
  projectRoot?: string | null;
  title: string;
  onDiscard?: (filePath: string) => Promise<void>;
  onToggle: (filePath: string) => Promise<void>;
  onToggleAll?: () => Promise<void>;
  toggleAllLabel?: string;
}

function ChangeSection({
  count,
  emptyLabel,
  files,
  isStaged,
  projectRoot,
  title,
  onDiscard,
  onToggle,
  onToggleAll,
  toggleAllLabel,
}: ChangeSectionProps): React.ReactElement {
  return (
    <div className={isStaged ? 'border-b border-border-semantic' : ''}>
      <SectionHeader
        count={count}
        title={title}
        onToggleAll={onToggleAll}
        toggleAllLabel={toggleAllLabel}
      />
      {count === 0 ? (
        <div className="px-2 py-2 text-xs text-text-semantic-muted">{emptyLabel}</div>
      ) : (
        files.map(([filePath, status]) => (
          <GitFileRow
            key={`${isStaged ? 'staged' : 'unstaged'}-${filePath}`}
            filePath={filePath}
            isStaged={isStaged}
            onDiscard={onDiscard}
            onToggle={onToggle}
            projectRoot={projectRoot}
            status={status}
          />
        ))
      )}
    </div>
  );
}

function getEmptyStateMessage(projectRoot: string | null, isRepo: boolean | null): string | null {
  if (!projectRoot) return 'No project open';
  if (isRepo === false) return 'Not a git repository';
  if (isRepo === null) return 'Loading...';
  return null;
}

function ChangeSections(props: GitPanelContentProps): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ChangeSection
        count={props.stagedCount}
        emptyLabel="No staged changes"
        files={props.stagedFiles}
        isStaged={true}
        projectRoot={props.projectRoot}
        title="Staged"
        onToggle={props.handleUnstageFile}
        onToggleAll={props.handleUnstageAll}
        toggleAllLabel="Unstage All"
      />
      <ChangeSection
        count={props.unstagedCount}
        emptyLabel="No changes"
        files={props.unstagedFiles}
        isStaged={false}
        projectRoot={props.projectRoot}
        title="Changes"
        onDiscard={props.handleDiscardFile}
        onToggle={props.handleStageFile}
        onToggleAll={props.handleStageAll}
        toggleAllLabel="Stage All"
      />
    </div>
  );
}

function RepoContent(props: GitPanelContentProps): React.ReactElement {
  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ fontSize: '12px' }}>
      <div className="flex-shrink-0 border-b border-border-semantic px-2 py-2">
        <BranchSelector
          currentBranch={props.currentBranch}
          branches={props.branches}
          onCheckout={props.handleCheckout}
        />
      </div>

      {props.error ? <ErrorBanner error={props.error} onDismiss={props.clearError} /> : null}

      <ReviewChangesBar hasChanges={props.stagedCount + props.unstagedCount > 0} />

      <ChangeSections {...props} />

      <CommitSection
        canCommit={props.canCommit}
        commitMessage={props.commitMessage}
        isCommitting={props.isCommitting}
        stagedCount={props.stagedCount}
        onCommit={props.handleCommit}
        onCommitMessageChange={props.handleCommitMessageChange}
        onKeyDown={props.handleKeyDown}
      />
    </div>
  );
}

export function GitPanelContent(props: GitPanelContentProps): React.ReactElement {
  const emptyStateMessage = getEmptyStateMessage(props.projectRoot, props.isRepo);
  return emptyStateMessage ? (
    <EmptyState centered message={emptyStateMessage} />
  ) : (
    <RepoContent {...props} />
  );
}
