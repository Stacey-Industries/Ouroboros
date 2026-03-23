import React from 'react';

import type { Command } from './types';

export interface BreadcrumbBarProps {
  stack: Command[];
  onBack: () => void;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '0 14px',
  height: '32px',
  borderBottom: '1px solid var(--border-default)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  flexShrink: 0,
  overflow: 'hidden',
};

const backBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  padding: '2px 4px',
  borderRadius: '3px',
  flexShrink: 0,
};

export function BreadcrumbBar({ stack, onBack }: BreadcrumbBarProps): React.ReactElement {
  return (
    <div
      className="bg-surface-raised text-text-semantic-muted border-b border-border-semantic"
      style={containerStyle}
    >
      <button
        onClick={onBack}
        aria-label="Go back"
        title="Escape to go back"
        className="text-text-semantic-muted"
        style={backBtnStyle}
      >
        &larr;
      </button>
      <span className="text-text-semantic-faint" style={{ flexShrink: 0 }}>
        Command Palette
      </span>
      {stack.map((cmd, i) => (
        <BreadcrumbSegment key={cmd.id} label={cmd.label} isLast={i === stack.length - 1} />
      ))}
    </div>
  );
}

function BreadcrumbSegment({
  label,
  isLast,
}: {
  label: string;
  isLast: boolean;
}): React.ReactElement {
  return (
    <>
      <span style={{ opacity: 0.4, flexShrink: 0 }}>&rsaquo;</span>
      <span
        style={{
          color: isLast ? 'var(--text-secondary)' : 'var(--text-faint)',
          flexShrink: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </>
  );
}
