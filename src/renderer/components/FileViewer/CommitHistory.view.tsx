import React, { memo } from 'react';
import type { CommitEntry } from '../../types/electron';
import type { CommitHistoryViewModel } from './CommitHistory.model';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 12px',
  borderBottom: '1px solid var(--border-muted)',
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

function getCommitHue(email: string): number {
  let hue = 0;
  for (let index = 0; index < email.length; index += 1) {
    hue = (hue * 31 + email.charCodeAt(index)) % 360;
  }
  return hue;
}

function getCommitInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getPatchTone(line: string): React.CSSProperties {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return { backgroundColor: 'rgba(80, 200, 80, 0.12)', color: 'var(--success, #4CAF50)' };
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return { backgroundColor: 'rgba(255, 80, 80, 0.12)', color: 'var(--error, #f85149)' };
  }
  if (line.startsWith('@@')) {
    return { backgroundColor: 'rgba(88, 166, 255, 0.08)', color: 'var(--interactive-accent)' };
  }
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
    return { backgroundColor: 'transparent', color: 'var(--text-muted)' };
  }
  return { backgroundColor: 'transparent', color: 'var(--text)' };
}

const AuthorAvatar = memo(function AuthorAvatar({
  email,
  name,
}: {
  email: string;
  name: string;
}): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      title={name}
      style={{
        flexShrink: 0,
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        backgroundColor: `hsl(${getCommitHue(email)}, 55%, 45%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.625rem',
        fontWeight: 700,
        color: '#fff',
        userSelect: 'none',
        letterSpacing: '-0.5px',
      }}
    >
      {getCommitInitials(name) || '?'}
    </div>
  );
});

const DiffLine = memo(function DiffLine({ line }: { line: string }): React.ReactElement {
  return (
    <pre
      style={{
        margin: 0,
        padding: '0 16px',
        whiteSpace: 'pre',
        ...getPatchTone(line),
      }}
    >
      {line || ' '}
    </pre>
  );
});

const PatchHeader = memo(function PatchHeader({ onBack }: { onBack: () => void }): React.ReactElement {
  return (
    <div className="text-text-semantic-faint" style={{ ...headerStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span className="text-text-semantic-muted" style={{ fontSize: '0.75rem' }}>Commit diff</span>
      <button onClick={onBack} title="Back to commit list" className="text-text-semantic-muted" style={{ ...buttonStyle, fontSize: '0.6875rem', padding: '2px 8px' }}>
        Back
      </button>
    </div>
  );
});

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
      <div style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', lineHeight: '1.6' }}>
        <div style={{ minWidth: 'max-content' }}>
          {patch.split('\n').map((line, index) => (
            <DiffLine key={`${index}-${line}`} line={line} />
          ))}
        </div>
      </div>
    </div>
  );
});

const StatusMessage = memo(function StatusMessage({
  action,
  message,
  tone,
}: {
  action?: React.ReactNode;
  message: string;
  tone?: string;
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        height: '100%',
        color: tone ?? 'var(--text-muted)',
        fontSize: '0.8125rem',
      }}
    >
      <span>{message}</span>
      {action}
    </div>
  );
});

const CommitSummary = memo(function CommitSummary({ commit }: { commit: CommitEntry }): React.ReactElement {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span className="text-text-semantic-primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
        {commit.message}
      </span>
      <span className="text-text-semantic-faint" style={{ fontSize: '0.6875rem' }}>
        {commit.author} &middot; {commit.date}
      </span>
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '6px 12px',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid var(--border-muted)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
      }}
      onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = 'var(--surface-panel)'; }}
      onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span className="text-interactive-accent" style={{ flexShrink: 0, width: '52px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
        {shortHash}
      </span>
      <AuthorAvatar name={commit.author} email={commit.email} />
      <CommitSummary commit={commit} />
    </button>
  );
});

const CommitListPanel = memo(function CommitListPanel({
  commits,
  error,
  hasMore,
  isLoading,
  loadMore,
  onSelectCommit,
}: Omit<CommitHistoryViewModel, 'onBack' | 'patch' | 'patchError' | 'patchLoading' | 'selectedHash'>): React.ReactElement {
  return (
    <div style={containerStyle}>
      <div className="text-text-semantic-faint" style={headerStyle}>File history - click a commit to view its diff</div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {commits.length === 0 && !isLoading && !error ? <div className="text-text-semantic-faint" style={{ padding: '24px', textAlign: 'center', fontSize: '0.8125rem' }}>No commits found for this file.</div> : null}
        {error ? <div className="text-status-error" style={{ padding: '24px', textAlign: 'center', fontSize: '0.8125rem' }}>{error}</div> : null}
        {commits.map((commit) => <CommitRow key={commit.hash} commit={commit} onSelect={onSelectCommit} />)}
        {hasMore && !isLoading && commits.length > 0 ? (
          <div style={{ padding: '8px 12px', textAlign: 'center' }}>
            <button onClick={() => void loadMore()} className="text-text-semantic-muted" style={{ ...buttonStyle, fontSize: '0.75rem', padding: '4px 12px' }}>Load more</button>
          </div>
        ) : null}
        {isLoading ? <div className="text-text-semantic-faint" style={{ padding: '16px', textAlign: 'center', fontSize: '0.8125rem' }}>Loading...</div> : null}
      </div>
    </div>
  );
});

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
  if (selectedHash !== null && patchLoading) {
    return <StatusMessage message="Loading diff..." />;
  }
  if (selectedHash !== null && patchError) {
    return <StatusMessage action={<button onClick={onBack} className="text-text-semantic-muted" style={{ ...buttonStyle, fontSize: '0.75rem', padding: '3px 10px' }}>Back</button>} message={patchError} tone="var(--error)" />;
  }
  if (selectedHash !== null && patch !== null) {
    return <CommitPatchPanel onBack={onBack} patch={patch} />;
  }
  return <CommitListPanel commits={commits} error={error} hasMore={hasMore} isLoading={isLoading} loadMore={loadMore} onSelectCommit={onSelectCommit} />;
});
