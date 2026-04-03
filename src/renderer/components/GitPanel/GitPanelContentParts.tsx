import React from 'react';

export function getCommitTitle(stagedCount: number, commitMessage: string): string {
  if (stagedCount === 0) return 'No staged changes';
  return commitMessage.trim() ? 'Commit (Ctrl+Enter)' : 'Enter a commit message';
}

function getCommitButtonLabel(isCommitting: boolean, stagedCount: number): string {
  if (isCommitting) return 'Committing...';
  if (stagedCount === 0) return 'Commit';
  return `Commit (${stagedCount} file${stagedCount !== 1 ? 's' : ''})`;
}

export function CommitMessageInput({
  commitMessage,
  onCommitMessageChange,
  onKeyDown,
}: {
  commitMessage: string;
  onCommitMessageChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}): React.ReactElement {
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
        transition-colors duration-100 focus:border-interactive-accent focus:outline-hidden
      "
      style={{ fontFamily: 'var(--font-mono, monospace)' }}
    />
  );
}

export function CommitButton({
  canCommit,
  isCommitting,
  stagedCount,
  title,
  onCommit,
}: {
  canCommit: boolean;
  isCommitting: boolean;
  stagedCount: number;
  title: string;
  onCommit: () => Promise<void>;
}): React.ReactElement {
  return (
    <button
      onClick={() => void onCommit()}
      disabled={!canCommit}
      className="
        mt-1.5 w-full rounded px-3 py-1.5 text-xs font-medium transition-colors duration-100
        disabled:cursor-not-allowed disabled:opacity-40
      "
      style={{
        backgroundColor: canCommit ? 'var(--interactive-accent)' : 'var(--surface-raised)',
        color: canCommit ? 'var(--text-on-accent)' : 'var(--text-muted)',
      }}
      title={title}
    >
      {getCommitButtonLabel(isCommitting, stagedCount)}
    </button>
  );
}

function GenerateButton({
  disabled,
  isGenerating,
  onClick,
}: {
  disabled: boolean;
  isGenerating: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isGenerating}
      className="shrink-0 rounded px-1.5 py-1 text-xs transition-colors duration-75 hover:bg-surface-raised text-text-semantic-muted disabled:opacity-40 disabled:cursor-not-allowed"
      title={disabled ? 'Stage changes first' : 'Generate commit message with AI'}
    >
      {isGenerating ? '...' : '✦ AI'}
    </button>
  );
}

export function CommitSection(props: {
  canCommit: boolean;
  commitMessage: string;
  isCommitting: boolean;
  isGenerating?: boolean;
  stagedCount: number;
  onCommit: () => Promise<void>;
  onCommitMessageChange: (value: string) => void;
  onGenerateCommitMessage?: () => Promise<void>;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}): React.ReactElement {
  const title = getCommitTitle(props.stagedCount, props.commitMessage);

  return (
    <div className="flex-shrink-0 border-t border-border-semantic p-2">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <CommitMessageInput
            commitMessage={props.isGenerating ? 'Generating...' : props.commitMessage}
            onCommitMessageChange={props.onCommitMessageChange}
            onKeyDown={props.onKeyDown}
          />
        </div>
        {props.onGenerateCommitMessage && (
          <GenerateButton
            disabled={props.stagedCount === 0}
            isGenerating={props.isGenerating ?? false}
            onClick={() => void props.onGenerateCommitMessage!()}
          />
        )}
      </div>
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

export function ReviewChangesBar({ hasChanges }: { hasChanges: boolean }): React.ReactElement | null {
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
