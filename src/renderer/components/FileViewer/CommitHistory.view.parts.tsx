import React, { memo } from 'react';

import type { CommitEntry } from '../../types/electron';

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

export function getPatchTone(line: string): React.CSSProperties {
  if (line.startsWith('+') && !line.startsWith('+++'))
    return { backgroundColor: 'rgba(80, 200, 80, 0.12)', color: 'var(--status-success)' };
  if (line.startsWith('-') && !line.startsWith('---'))
    return { backgroundColor: 'rgba(255, 80, 80, 0.12)', color: 'var(--status-error)' };
  if (line.startsWith('@@'))
    return { backgroundColor: 'rgba(88, 166, 255, 0.08)', color: 'var(--interactive-accent)' };
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ')
  )
    return { backgroundColor: 'transparent', color: 'var(--text-muted)' };
  return { backgroundColor: 'transparent', color: 'var(--text-primary)' };
}

export const AuthorAvatar = memo(function AuthorAvatar({
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

export const DiffLine = memo(function DiffLine({ line }: { line: string }): React.ReactElement {
  return (
    <pre style={{ margin: 0, padding: '0 16px', whiteSpace: 'pre', ...getPatchTone(line) }}>
      {line || ' '}
    </pre>
  );
});

const patchHeaderStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  fontSize: '0.6875rem',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const backButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.6875rem',
  padding: '2px 8px',
};

export const PatchHeader = memo(function PatchHeader({
  onBack,
}: {
  onBack: () => void;
}): React.ReactElement {
  return (
    <div className="text-text-semantic-faint" style={patchHeaderStyle}>
      <span className="text-text-semantic-muted" style={{ fontSize: '0.75rem' }}>
        Commit diff
      </span>
      <button
        onClick={onBack}
        title="Back to commit list"
        className="text-text-semantic-muted"
        style={backButtonStyle}
      >
        Back
      </button>
    </div>
  );
});

export const CommitSummary = memo(function CommitSummary({
  commit,
}: {
  commit: CommitEntry;
}): React.ReactElement {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span
        className="text-text-semantic-primary"
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 500,
        }}
      >
        {commit.message}
      </span>
      <span className="text-text-semantic-faint" style={{ fontSize: '0.6875rem' }}>
        {commit.author} &middot; {commit.date}
      </span>
    </div>
  );
});

export const StatusMessage = memo(function StatusMessage({
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
