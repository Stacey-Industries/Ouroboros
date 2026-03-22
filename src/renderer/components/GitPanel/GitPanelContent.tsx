import React from 'react';
import { BranchSelector } from './BranchSelector';
import { GitFileRow } from './GitFileRow';
import type { GitPanelModel } from './useGitPanelModel';
interface GitPanelContentProps extends GitPanelModel {
  projectRoot: string | null;
}
interface EmptyStateProps {
  message: string;
  centered?: boolean;
}
interface ErrorBannerProps {
  error: string;
  onDismiss: () => void;
}
interface SectionHeaderProps {
  count: number;
  title: string;
  toggleAllLabel?: string;
  onToggleAll?: () => Promise<void>;
}
interface ChangeSectionProps {
  count: number;
  emptyLabel: string;
  files: Array<[string, string]>;
  isStaged: boolean;
  title: string;
  onDiscard?: (filePath: string) => Promise<void>;
  onToggle: (filePath: string) => Promise<void>;
  onToggleAll?: () => Promise<void>;
  toggleAllLabel?: string;
}
interface CommitSectionProps {
  canCommit: boolean;
  commitMessage: string;
  isCommitting: boolean;
  stagedCount: number;
  onCommit: () => Promise<void>;
  onCommitMessageChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

interface CommitMessageInputProps {
  commitMessage: string;
  onCommitMessageChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

interface CommitButtonProps {
  canCommit: boolean;
  isCommitting: boolean;
  stagedCount: number;
  title: string;
  onCommit: () => Promise<void>;
}

function EmptyState({ message, centered = false }: EmptyStateProps): React.ReactElement {
  return (
    <div className={`p-4 ${centered ? 'flex h-full items-center justify-center' : ''}`}>
      <span
        className={`text-xs text-text-semantic-muted ${centered ? 'text-center' : ''}`}
      >
        {message}
      </span>
    </div>
  );
}

function ErrorBanner({ error, onDismiss }: ErrorBannerProps): React.ReactElement {
  return (
    <div
      className="flex-shrink-0 border-b border-border-semantic px-2 py-1 text-xs text-status-error"
      style={{
        backgroundColor: 'rgba(248, 81, 73, 0.1)',
      }}
    >
      {error}
      <button
        onClick={onDismiss}
        className="ml-2 underline text-status-error"
      >
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
}: SectionHeaderProps): React.ReactElement {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between bg-surface-panel px-2 py-1.5">
      <span
        className="text-xs font-semibold uppercase tracking-wider text-text-semantic-muted"
      >
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

function ChangeSection({
  count,
  emptyLabel,
  files,
  isStaged,
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
        <div className="px-2 py-2 text-xs text-text-semantic-muted">
          {emptyLabel}
        </div>
      ) : (
        files.map(([filePath, status]) => (
          <GitFileRow
            key={`${isStaged ? 'staged' : 'unstaged'}-${filePath}`}
            filePath={filePath}
            isStaged={isStaged}
            onDiscard={onDiscard}
            onToggle={onToggle}
            status={status}
          />
        ))
      )}
    </div>
  );
}

function getCommitTitle(stagedCount: number, commitMessage: string): string {
  if (stagedCount === 0) {
    return 'No staged changes';
  }

  return commitMessage.trim()
    ? 'Commit (Ctrl+Enter)'
    : 'Enter a commit message';
}

function getCommitButtonLabel(isCommitting: boolean, stagedCount: number): string {
  if (isCommitting) {
    return 'Committing...';
  }

  if (stagedCount === 0) {
    return 'Commit';
  }

  return `Commit (${stagedCount} file${stagedCount !== 1 ? 's' : ''})`;
}

function CommitMessageInput({
  commitMessage,
  onCommitMessageChange,
  onKeyDown,
}: CommitMessageInputProps): React.ReactElement {
  return (
    <textarea
      value={commitMessage}
      onChange={(event) => onCommitMessageChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder="Commit message..."
      rows={3}
      className="
        w-full resize-none rounded border border-border-semantic bg-surface-base px-2 py-1.5 text-xs
        text-text-semantic-primary placeholder:text-text-semantic-muted
        transition-colors duration-100 focus:border-interactive-accent focus:outline-none
      "
      style={{ fontFamily: 'var(--font-mono, monospace)' }}
    />
  );
}

function CommitButton({
  canCommit,
  isCommitting,
  stagedCount,
  title,
  onCommit,
}: CommitButtonProps): React.ReactElement {
  return (
    <button
      onClick={() => void onCommit()}
      disabled={!canCommit}
      className="
        mt-1.5 w-full rounded px-3 py-1.5 text-xs font-medium transition-colors duration-100
        disabled:cursor-not-allowed disabled:opacity-40
      "
      style={{
        backgroundColor: canCommit ? 'var(--accent)' : 'var(--bg-tertiary)',
        color: canCommit ? 'var(--text-on-accent)' : 'var(--text-muted)',
      }}
      title={title}
    >
      {getCommitButtonLabel(isCommitting, stagedCount)}
    </button>
  );
}

function CommitSection(props: CommitSectionProps): React.ReactElement {
  const title = getCommitTitle(props.stagedCount, props.commitMessage);

  return (
    <div className="flex-shrink-0 border-t border-border-semantic p-2">
      <CommitMessageInput
        commitMessage={props.commitMessage}
        onCommitMessageChange={props.onCommitMessageChange}
        onKeyDown={props.onKeyDown}
      />
      <CommitButton
        canCommit={props.canCommit}
        isCommitting={props.isCommitting}
        stagedCount={props.stagedCount}
        title={title}
        onCommit={props.onCommit}
      />
    </div>
  );
}

function getEmptyStateMessage(projectRoot: string | null, isRepo: boolean | null): string | null {
  if (!projectRoot) {
    return 'No project open';
  }

  if (isRepo === false) {
    return 'Not a git repository';
  }

  if (isRepo === null) {
    return 'Loading...';
  }

  return null;
}

function ReviewChangesBar({ hasChanges }: { hasChanges: boolean }): React.ReactElement | null {
  if (!hasChanges) return null;
  return (
    <div className="flex-shrink-0 border-b border-border-semantic px-2 py-1.5 flex items-center gap-1.5">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('agent-ide:review-all-changes'))}
        className="flex-1 rounded px-2 py-1 text-xs transition-colors duration-75 hover:bg-surface-raised text-text-semantic-muted border border-border-semantic"
        title="Review all uncommitted changes (staged + unstaged) with hunk-level accept/reject"
      >
        Review All
      </button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('agent-ide:review-unstaged-changes'))}
        className="flex-1 rounded px-2 py-1 text-xs transition-colors duration-75 hover:bg-surface-raised text-text-semantic-muted border border-border-semantic"
        title="Review only unstaged changes with hunk-level accept/reject"
      >
        Review Unstaged
      </button>
    </div>
  );
}

function ChangeSections(props: GitPanelContentProps): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ChangeSection
        count={props.stagedCount}
        emptyLabel="No staged changes"
        files={props.stagedFiles}
        isStaged={true}
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
  return emptyStateMessage ? <EmptyState centered message={emptyStateMessage} /> : <RepoContent {...props} />;
}
