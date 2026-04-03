import React, { memo } from 'react';

import type { CommitEntry } from '../../types/electron';
import type { CommitHistoryViewModel } from './CommitHistory.model';
import {
  AuthorAvatar,
  CommitSummary,
  DiffLine,
  PatchHeader,
  StatusMessage,
} from './CommitHistory.view.parts';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  fontSize: '0.6875rem',
  userSelect: 'none',
};

const buttonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
};

const commitRowButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '6px 12px',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

const commitHashStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '52px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
};

const listTextStyle: React.CSSProperties = {
  padding: '24px',
  textAlign: 'center',
  fontSize: '0.8125rem',
};

const CommitPatchPanel = memo(function CommitPatchPanel({
  onBack,
  patch,
}: {
  onBack: () => void;
  patch: string;
}): React.ReactElement {
  return (
    <div style={containerStyle}>
      <PatchHeader onBack={onBack} />
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          lineHeight: '1.6',
        }}
      >
        <div style={{ minWidth: 'max-content' }}>
          {patch.split('\n').map((line, index) => (
            <DiffLine key={`${index}-${line}`} line={line} />
          ))}
        </div>
      </div>
    </div>
  );
});

const CommitRow = memo(function CommitRow({
  commit,
  onSelect,
}: {
  commit: CommitEntry;
  onSelect: (hash: string) => void;
}): React.ReactElement {
  const shortHash = commit.hash.slice(0, 7);
  return (
    <button
      onClick={() => onSelect(commit.hash)}
      title={`Show diff for ${shortHash}: ${commit.message}`}
      className="text-text-semantic-primary"
      style={commitRowButtonStyle}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = 'var(--surface-panel)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <span className="text-interactive-accent" style={commitHashStyle}>
        {shortHash}
      </span>
      <AuthorAvatar name={commit.author} email={commit.email} />
      <CommitSummary commit={commit} />
    </button>
  );
});

type ListPanelProps = Omit<
  CommitHistoryViewModel,
  'onBack' | 'patch' | 'patchError' | 'patchLoading' | 'selectedHash'
>;

function LoadMoreButton({ loadMore }: { loadMore: () => Promise<void> }): React.ReactElement {
  return (
    <div style={{ padding: '8px 12px', textAlign: 'center' }}>
      <button
        onClick={() => void loadMore()}
        className="text-text-semantic-muted"
        style={{ ...buttonStyle, fontSize: '0.75rem', padding: '4px 12px' }}
      >
        Load more
      </button>
    </div>
  );
}

function CommitListBody({
  commits,
  error,
  hasMore,
  isLoading,
  loadMore,
  onSelectCommit,
}: ListPanelProps): React.ReactElement {
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {commits.length === 0 && !isLoading && !error ? (
        <div className="text-text-semantic-faint" style={listTextStyle}>
          No commits found for this file.
        </div>
      ) : null}
      {error ? (
        <div className="text-status-error" style={listTextStyle}>
          {error}
        </div>
      ) : null}
      {commits.map((commit) => (
        <CommitRow key={commit.hash} commit={commit} onSelect={onSelectCommit} />
      ))}
      {hasMore && !isLoading && commits.length > 0 ? <LoadMoreButton loadMore={loadMore} /> : null}
      {isLoading ? (
        <div
          className="text-text-semantic-faint"
          style={{ padding: '16px', textAlign: 'center', fontSize: '0.8125rem' }}
        >
          Loading...
        </div>
      ) : null}
    </div>
  );
}

const CommitListPanel = memo(function CommitListPanel(props: ListPanelProps): React.ReactElement {
  return (
    <div style={containerStyle}>
      <div className="text-text-semantic-faint" style={headerStyle}>
        File history - click a commit to view its diff
      </div>
      <CommitListBody {...props} />
    </div>
  );
});

function PatchErrorMessage({
  onBack,
  patchError,
}: {
  onBack: () => void;
  patchError: string;
}): React.ReactElement {
  return (
    <StatusMessage
      action={
        <button
          onClick={onBack}
          className="text-text-semantic-muted"
          style={{ ...buttonStyle, fontSize: '0.75rem', padding: '3px 10px' }}
        >
          Back
        </button>
      }
      message={patchError}
      tone="var(--status-error)"
    />
  );
}

export const CommitHistoryView = memo(function CommitHistoryView({
  commits,
  error,
  hasMore,
  isLoading,
  loadMore,
  onBack,
  onSelectCommit,
  patch,
  patchError,
  patchLoading,
  selectedHash,
}: CommitHistoryViewModel): React.ReactElement {
  if (selectedHash !== null && patchLoading) return <StatusMessage message="Loading diff..." />;
  if (selectedHash !== null && patchError)
    return <PatchErrorMessage onBack={onBack} patchError={patchError} />;
  if (selectedHash !== null && patch !== null)
    return <CommitPatchPanel onBack={onBack} patch={patch} />;
  return (
    <CommitListPanel
      commits={commits}
      error={error}
      hasMore={hasMore}
      isLoading={isLoading}
      loadMore={loadMore}
      onSelectCommit={onSelectCommit}
    />
  );
});
