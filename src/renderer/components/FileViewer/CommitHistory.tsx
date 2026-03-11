import React, { useState, useEffect, useCallback, memo } from 'react';
import type { CommitEntry } from '../../types/electron';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface CommitHistoryProps {
  /** Absolute path to the file being inspected */
  filePath: string;
  /** Project root used for git operations */
  projectRoot: string;
}

// ─── Author avatar ────────────────────────────────────────────────────────────

function AuthorAvatar({ name, email }: { name: string; email: string }): React.ReactElement {
  // Derive initials from the name (up to 2 chars)
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  // Stable hue from email string
  let hue = 0;
  for (let i = 0; i < email.length; i++) {
    hue = (hue * 31 + email.charCodeAt(i)) % 360;
  }

  return (
    <div
      aria-hidden="true"
      title={name}
      style={{
        flexShrink: 0,
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        backgroundColor: `hsl(${hue}, 55%, 45%)`,
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
      {initials || '?'}
    </div>
  );
}

// ─── Commit patch view ────────────────────────────────────────────────────────

interface CommitPatchProps {
  patch: string;
  onClose: () => void;
}

function CommitPatch({ patch, onClose }: CommitPatchProps): React.ReactElement {
  const lines = patch.split('\n');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px',
          borderBottom: '1px solid var(--border-muted)',
          backgroundColor: 'var(--bg-secondary)',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Commit diff</span>
        <button
          onClick={onClose}
          title="Back to commit list"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.6875rem',
            padding: '2px 8px',
            fontFamily: 'var(--font-ui)',
          }}
        >
          Back
        </button>
      </div>

      {/* Diff lines */}
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
          {lines.map((line, i) => {
            let bg = 'transparent';
            let color = 'var(--text)';

            if (line.startsWith('+') && !line.startsWith('+++')) {
              bg = 'rgba(80, 200, 80, 0.12)';
              color = 'var(--success, #4CAF50)';
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              bg = 'rgba(255, 80, 80, 0.12)';
              color = 'var(--error, #f85149)';
            } else if (line.startsWith('@@')) {
              bg = 'rgba(88, 166, 255, 0.08)';
              color = 'var(--accent)';
            } else if (
              line.startsWith('diff ') ||
              line.startsWith('index ') ||
              line.startsWith('--- ') ||
              line.startsWith('+++ ')
            ) {
              color = 'var(--text-muted)';
            }

            return (
              <pre
                key={i}
                style={{
                  margin: 0,
                  padding: '0 16px',
                  backgroundColor: bg,
                  color,
                  whiteSpace: 'pre',
                }}
              >
                {line || ' '}
              </pre>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Commit row ───────────────────────────────────────────────────────────────

interface CommitRowProps {
  commit: CommitEntry;
  onSelect: (hash: string) => void;
}

const CommitRow = memo(function CommitRow({ commit, onSelect }: CommitRowProps): React.ReactElement {
  const shortHash = commit.hash.slice(0, 7);

  return (
    <button
      onClick={() => onSelect(commit.hash)}
      title={`Show diff for ${shortHash}: ${commit.message}`}
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
        color: 'var(--text)',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
      }}
    >
      {/* Short hash */}
      <span
        style={{
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'var(--accent)',
          width: '52px',
        }}
      >
        {shortHash}
      </span>

      {/* Avatar */}
      <AuthorAvatar name={commit.author} email={commit.email} />

      {/* Message + meta */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--text)',
            fontWeight: 500,
          }}
        >
          {commit.message}
        </span>
        <span style={{ fontSize: '0.6875rem', color: 'var(--text-faint)' }}>
          {commit.author} &middot; {commit.date}
        </span>
      </div>
    </button>
  );
});

// ─── CommitHistory ─────────────────────────────────────────────────────────────

/**
 * CommitHistory — scrollable list of commits that touched the current file.
 * Clicking a commit shows its raw diff patch.
 */
export const CommitHistory = memo(function CommitHistory({
  filePath,
  projectRoot,
}: CommitHistoryProps): React.ReactElement {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The commit currently being viewed (null = list mode)
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [patch, setPatch] = useState<string | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);

  const loadCommits = useCallback(
    async (offset: number): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await window.electronAPI.git.log(projectRoot, filePath, offset);
        if (!result.success) {
          setError(result.error ?? 'Failed to load commit history');
          return;
        }
        const incoming = result.commits ?? [];
        setCommits((prev) => (offset === 0 ? incoming : [...prev, ...incoming]));
        setHasMore(incoming.length === 50);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [projectRoot, filePath],
  );

  // Reset and fetch on file change
  useEffect(() => {
    setCommits([]);
    setSelectedHash(null);
    setPatch(null);
    setPatchError(null);
    setHasMore(true);
    void loadCommits(0);
  }, [loadCommits]);

  const handleSelectCommit = useCallback(
    async (hash: string): Promise<void> => {
      setSelectedHash(hash);
      setPatch(null);
      setPatchError(null);
      setPatchLoading(true);
      try {
        const result = await window.electronAPI.git.show(projectRoot, hash, filePath);
        if (!result.success) {
          setPatchError(result.error ?? 'Failed to load diff');
        } else {
          setPatch(result.patch ?? '');
        }
      } catch (err) {
        setPatchError(err instanceof Error ? err.message : String(err));
      } finally {
        setPatchLoading(false);
      }
    },
    [projectRoot, filePath],
  );

  const handleBack = useCallback(() => {
    setSelectedHash(null);
    setPatch(null);
    setPatchError(null);
  }, []);

  // ── Patch view ──
  if (selectedHash !== null) {
    if (patchLoading) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
            fontSize: '0.8125rem',
          }}
        >
          Loading diff…
        </div>
      );
    }
    if (patchError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '8px',
          }}
        >
          <span style={{ color: 'var(--error)', fontSize: '0.8125rem' }}>{patchError}</span>
          <button
            onClick={handleBack}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              padding: '3px 10px',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Back
          </button>
        </div>
      );
    }
    if (patch !== null) {
      return <CommitPatch patch={patch} onClose={handleBack} />;
    }
  }

  // ── List view ──
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: '4px 12px',
          borderBottom: '1px solid var(--border-muted)',
          backgroundColor: 'var(--bg-secondary)',
          fontSize: '0.6875rem',
          color: 'var(--text-faint)',
          userSelect: 'none',
        }}
      >
        File history — click a commit to view its diff
      </div>

      {/* Commit list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {commits.length === 0 && !isLoading && !error && (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-faint)',
              fontSize: '0.8125rem',
            }}
          >
            No commits found for this file.
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--error)',
              fontSize: '0.8125rem',
            }}
          >
            {error}
          </div>
        )}

        {commits.map((commit) => (
          <CommitRow key={commit.hash} commit={commit} onSelect={handleSelectCommit} />
        ))}

        {/* Load more */}
        {hasMore && !isLoading && commits.length > 0 && (
          <div style={{ padding: '8px 12px', textAlign: 'center' }}>
            <button
              onClick={() => void loadCommits(commits.length)}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                padding: '4px 12px',
                fontFamily: 'var(--font-ui)',
              }}
            >
              Load more
            </button>
          </div>
        )}

        {isLoading && (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: 'var(--text-faint)',
              fontSize: '0.8125rem',
            }}
          >
            Loading…
          </div>
        )}
      </div>
    </div>
  );
});
