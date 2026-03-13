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
        className={`text-xs ${centered ? 'text-center' : ''}`}
        style={{ color: 'var(--text-muted)' }}
      >
        {message}
      </span>
    </div>
  );
}

function ErrorBanner({ error, onDismiss }: ErrorBannerProps): React.ReactElement {
  return (
    <div
      className="flex-shrink-0 border-b border-[var(--border)] px-2 py-1 text-xs"
      style={{
        backgroundColor: 'rgba(248, 81, 73, 0.1)',
        color: 'var(--error, #f85149)',
      }}
    >
      {error}
      <button
        onClick={onDismiss}
        className="ml-2 underline"
        style={{ color: 'var(--error, #f85149)' }}
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
    <div className="sticky top-0 z-10 flex items-center justify-between bg-[var(--bg-secondary)] px-2 py-1.5">
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {title} ({count})
      </span>
      {count > 0 && toggleAllLabel && onToggleAll ? (
        <button
          onClick={() => void onToggleAll()}
          className="rounded px-1.5 py-0.5 text-xs transition-colors duration-75 hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
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
    <div className={isStaged ? 'border-b border-[var(--border)]' : ''}>
      <SectionHeader
        count={count}
        title={title}
        onToggleAll={onToggleAll}
        toggleAllLabel={toggleAllLabel}
      />
      {count === 0 ? (
        <div className="px-2 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
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
        w-full resize-none rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs
        text-[var(--text)] placeholder:text-[var(--text-muted)]
        transition-colors duration-100 focus:border-[var(--accent)] focus:outline-none
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
        color: canCommit ? 'var(--bg)' : 'var(--text-muted)',
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
    <div className="flex-shrink-0 border-t border-[var(--border)] p-2">
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
      <div className="flex-shrink-0 border-b border-[var(--border)] px-2 py-2">
        <BranchSelector
          currentBranch={props.currentBranch}
          branches={props.branches}
          onCheckout={props.handleCheckout}
        />
      </div>

      {props.error ? <ErrorBanner error={props.error} onDismiss={props.clearError} /> : null}

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
