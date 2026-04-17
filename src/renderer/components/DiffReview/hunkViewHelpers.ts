/**
 * hunkViewHelpers.ts — Style helpers and display-line builder for HunkView.
 *
 * Extracted from HunkView.tsx to keep that file under the 300-line ESLint limit.
 */

import type { CSSProperties } from 'react';

import type { ReviewHunk } from './types';

export type DiffLineType = 'added' | 'removed' | 'context';

export interface DisplayLine {
  id: string;
  leftNo: number | null;
  marker: string;
  rightNo: number | null;
  text: string;
  type: DiffLineType;
}

// --- Style constants ---

export const hunkHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 8px',
  backgroundColor: 'var(--interactive-accent-subtle)',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--interactive-accent)',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  userSelect: 'none',
};

export const diffLinesStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
  lineHeight: '1.6',
};

export const lineContentStyle: CSSProperties = {
  flex: 1,
  margin: 0,
  padding: '0 12px',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  whiteSpace: 'pre',
  color: 'var(--text-primary)',
  overflowX: 'visible',
};

export const actionBarStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '4px 8px',
  background: 'var(--surface-raised)',
  borderTop: '1px solid var(--border-subtle)',
};

export const acceptedBadgeStyle: CSSProperties = {
  color: 'var(--status-success)',
  fontWeight: 600,
  fontSize: '0.75rem',
};

export const rejectedBadgeStyle: CSSProperties = {
  color: 'var(--status-error)',
  fontWeight: 600,
  fontSize: '0.75rem',
};

// --- Helper functions ---

export function lineTypeFromPrefix(line: string): DiffLineType {
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

export function lineBg(type: DiffLineType): string {
  switch (type) {
    case 'added': return 'var(--diff-add-bg)';
    case 'removed': return 'var(--diff-del-bg)';
    default: return 'transparent';
  }
}

export function gutterBg(type: DiffLineType): string {
  switch (type) {
    case 'added': return 'var(--diff-add-bg)';
    case 'removed': return 'var(--diff-del-bg)';
    default: return 'var(--surface-base)';
  }
}

export function markerColor(type: DiffLineType): string {
  switch (type) {
    case 'added': return 'var(--status-success)';
    case 'removed': return 'var(--status-error)';
    default: return 'var(--text-faint)';
  }
}

export function buildDisplayLines(hunk: ReviewHunk): DisplayLine[] {
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;

  return hunk.lines.map((line, index) => {
    const type = lineTypeFromPrefix(line);
    return {
      id: `${hunk.id}-${index}`,
      leftNo: type === 'added' ? null : oldLine++,
      marker: line[0] === ' ' ? ' ' : line[0],
      rightNo: type === 'removed' ? null : newLine++,
      text: line.slice(1),
      type,
    };
  });
}
