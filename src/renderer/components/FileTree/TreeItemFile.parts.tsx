/**
 * TreeItemFile.parts.tsx — utility sub-components for TreeItemFile.
 * Extracted to keep TreeItemFile.tsx under the 300-line ESLint limit.
 */

import React from 'react';

import type { MatchRange } from './FileTreeItem';

export function HighlightedName({
  name,
  ranges,
}: {
  name: string;
  ranges?: MatchRange[];
}): React.ReactElement {
  if (!ranges || ranges.length === 0) return <span>{name}</span>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (cursor < range.start) {
      parts.push(<span key={`p-${cursor}`}>{name.slice(cursor, range.start)}</span>);
    }
    parts.push(
      <span key={`m-${range.start}`} className="text-interactive-accent" style={{ fontWeight: 600 }}>
        {name.slice(range.start, range.end)}
      </span>,
    );
    cursor = range.end;
  }
  if (cursor < name.length) {
    parts.push(<span key="end">{name.slice(cursor)}</span>);
  }
  return <>{parts}</>;
}

export function StatusBadge({ label, color }: { label: string; color?: string }): React.ReactElement {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: '0.625rem',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        color,
        marginLeft: '4px',
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

export function SearchPath({ relativePath }: { relativePath: string }): React.ReactElement | null {
  if (!relativePath.includes('/')) return null;
  return (
    <span
      className="text-text-semantic-faint"
      style={{
        flexShrink: 0,
        fontSize: '0.6875rem',
        marginLeft: '4px',
        maxWidth: '40%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {relativePath.slice(0, relativePath.lastIndexOf('/'))}
    </span>
  );
}

export function HeatDot({ color, glow }: { color: string; glow: boolean }): React.ReactElement {
  return (
    <span
      style={{
        flexShrink: 0,
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: color,
        marginLeft: '4px',
        boxShadow: glow ? `0 0 4px ${color}` : undefined,
      }}
    />
  );
}

export function NestChevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className="text-text-semantic-muted"
      style={{
        flexShrink: 0,
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 120ms ease',
        opacity: 0.6,
      }}
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DIAGNOSTIC_CONFIG: Record<
  string,
  { color: string; shape: 'circle' | 'triangle'; label: string }
> = {
  error: { color: 'var(--status-error)', shape: 'circle', label: 'Error' },
  warning: { color: 'var(--status-warning)', shape: 'triangle', label: 'Warning' },
  info: { color: 'var(--status-info)', shape: 'circle', label: 'Info' },
  hint: { color: 'var(--text-semantic-muted)', shape: 'circle', label: 'Hint' },
};

export function DiagnosticIndicator({
  severity,
}: {
  severity: string;
}): React.ReactElement | null {
  const config = DIAGNOSTIC_CONFIG[severity];
  if (!config) return null;
  if (config.shape === 'triangle') {
    return (
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        style={{ flexShrink: 0, marginLeft: '4px' }}
        aria-hidden="true"
      >
        <title>{config.label}</title>
        <polygon points="4,1 7,7 1,7" fill={config.color} />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      title={config.label}
      style={{
        flexShrink: 0,
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: config.color,
        marginLeft: '4px',
      }}
    />
  );
}

export function DirtyDot(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      title="Unsaved changes"
      style={{
        flexShrink: 0,
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: 'var(--status-warning)',
        marginLeft: '4px',
      }}
    />
  );
}
