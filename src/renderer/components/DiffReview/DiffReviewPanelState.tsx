import React from 'react';
import type { DiffReviewState, ReviewFile } from './types';

export interface DiffReviewStats {
  added: number;
  removed: number;
  totalHunks: number;
  decidedHunks: number;
  acceptedHunks: number;
  rejectedHunks: number;
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  fontSize: '0.875rem',
  fontFamily: 'var(--font-ui)',
};

export function getDiffReviewStats(files: ReviewFile[]): DiffReviewStats {
  const stats: DiffReviewStats = {
    added: 0,
    removed: 0,
    totalHunks: 0,
    decidedHunks: 0,
    acceptedHunks: 0,
    rejectedHunks: 0,
  };

  for (const file of files) {
    for (const hunk of file.hunks) {
      stats.totalHunks += 1;
      updateDecisionStats(stats, hunk.decision);
      updateLineStats(stats, hunk.lines);
    }
  }

  return stats;
}

export function getDiffReviewStateView(
  state: DiffReviewState,
  onClose: () => void,
): React.ReactElement | null {
  if (state.loading) return <CenteredMessage color="var(--text-muted)">Loading diff…</CenteredMessage>;
  if (state.error) return <DiffReviewError error={state.error} />;
  if (state.files.length === 0) return <DiffReviewEmptyState onClose={onClose} />;
  return null;
}

function updateDecisionStats(stats: DiffReviewStats, decision: ReviewFile['hunks'][number]['decision']): void {
  if (decision !== 'pending') stats.decidedHunks += 1;
  if (decision === 'accepted') stats.acceptedHunks += 1;
  if (decision === 'rejected') stats.rejectedHunks += 1;
}

function updateLineStats(stats: DiffReviewStats, lines: string[]): void {
  for (const line of lines) {
    if (line.startsWith('+')) stats.added += 1;
    if (line.startsWith('-')) stats.removed += 1;
  }
}

function CenteredMessage({
  children,
  color,
  extraStyle,
}: {
  children: React.ReactNode;
  color: string;
  extraStyle?: React.CSSProperties;
}): React.ReactElement {
  return <div style={{ ...centerStyle, color, ...extraStyle }}>{children}</div>;
}

function DiffReviewError({ error }: { error: string }): React.ReactElement {
  return (
    <CenteredMessage
      color="var(--status-error, #f85149)"
      extraStyle={{ padding: '20px', textAlign: 'center' }}
    >
      <div>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>Failed to load diff</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{error}</div>
      </div>
    </CenteredMessage>
  );
}

function DiffReviewEmptyState({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <CenteredMessage
      color="var(--text-muted)"
      extraStyle={{ flexDirection: 'column', gap: '8px' }}
    >
      <span>No changes detected since session started.</span>
      <button
        onClick={onClose}
        style={{
          padding: '4px 12px',
          fontSize: '0.75rem',
          border: '1px solid var(--border-default)',
          borderRadius: '4px',
          background: 'transparent',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        Close
      </button>
    </CenteredMessage>
  );
}
