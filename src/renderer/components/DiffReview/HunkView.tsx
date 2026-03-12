/**
 * HunkView.tsx — Renders a single diff hunk with accept/reject controls.
 *
 * Shows context lines, added lines (green), removed lines (red), with
 * dual line-number gutters and action buttons per hunk.
 */

import React, { useState, memo } from 'react';
import type { ReviewHunk, HunkDecision } from './types';

interface HunkViewProps {
  hunk: ReviewHunk;
  onAccept: () => void;
  onReject: () => void;
}

function lineTypeFromPrefix(line: string): 'added' | 'removed' | 'context' {
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

function lineBg(type: 'added' | 'removed' | 'context'): string {
  switch (type) {
    case 'added': return 'rgba(80, 200, 80, 0.12)';
    case 'removed': return 'rgba(255, 80, 80, 0.12)';
    default: return 'transparent';
  }
}

function gutterBg(type: 'added' | 'removed' | 'context'): string {
  switch (type) {
    case 'added': return 'rgba(80, 200, 80, 0.18)';
    case 'removed': return 'rgba(255, 80, 80, 0.18)';
    default: return 'var(--bg)';
  }
}

function markerColor(type: 'added' | 'removed' | 'context'): string {
  switch (type) {
    case 'added': return 'var(--success, #4CAF50)';
    case 'removed': return 'var(--error, #f85149)';
    default: return 'var(--text-faint)';
  }
}

function decisionBorder(decision: HunkDecision): string {
  switch (decision) {
    case 'accepted': return '3px solid var(--success, #4CAF50)';
    case 'rejected': return '3px solid var(--error, #f85149)';
    default: return '3px solid transparent';
  }
}

function decisionBadge(decision: HunkDecision): React.ReactNode {
  if (decision === 'accepted') {
    return (
      <span style={{ color: 'var(--success, #4CAF50)', fontWeight: 600, fontSize: '0.75rem' }}>
        ACCEPTED
      </span>
    );
  }
  if (decision === 'rejected') {
    return (
      <span style={{ color: 'var(--error, #f85149)', fontWeight: 600, fontSize: '0.75rem' }}>
        REJECTED
      </span>
    );
  }
  return null;
}

interface ActionBtnProps {
  label: string;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}

function ActionBtn({ label, color, disabled, onClick }: ActionBtnProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '2px 10px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        fontWeight: 500,
        border: `1px solid ${color}`,
        borderRadius: '4px',
        background: hovered && !disabled ? color : 'transparent',
        color: hovered && !disabled ? 'var(--bg)' : color,
        cursor: disabled ? 'default' : 'pointer',
        lineHeight: '1.5',
        transition: 'background 0.1s, color 0.1s',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

export const HunkView = memo(function HunkView({ hunk, onAccept, onReject }: HunkViewProps): React.ReactElement {
  const decided = hunk.decision !== 'pending';

  // Compute line numbers
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;

  return (
    <div
      style={{
        borderLeft: decisionBorder(hunk.decision),
        marginBottom: '2px',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Hunk header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 8px',
          backgroundColor: 'rgba(88, 166, 255, 0.08)',
          borderBottom: '1px solid var(--border-muted)',
          color: 'var(--accent)',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          userSelect: 'none',
        }}
      >
        <span>{hunk.header}</span>
        {decisionBadge(hunk.decision)}
      </div>

      {/* Diff lines */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', lineHeight: '1.6' }}>
        {hunk.lines.map((line, idx) => {
          const type = lineTypeFromPrefix(line);
          const text = line.slice(1); // Remove the +/-/space prefix

          let leftNo: number | null = null;
          let rightNo: number | null = null;

          if (type === 'context') {
            leftNo = oldLine++;
            rightNo = newLine++;
          } else if (type === 'removed') {
            leftNo = oldLine++;
          } else {
            rightNo = newLine++;
          }

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                backgroundColor: lineBg(type),
                minHeight: '1.6em',
              }}
            >
              {/* Old line gutter */}
              <div
                style={{
                  flexShrink: 0,
                  width: '40px',
                  textAlign: 'right',
                  paddingRight: '4px',
                  color: markerColor(type),
                  backgroundColor: gutterBg(type),
                  userSelect: 'none',
                  opacity: leftNo !== null ? 1 : 0.3,
                }}
              >
                {leftNo ?? ''}
              </div>

              {/* New line gutter */}
              <div
                style={{
                  flexShrink: 0,
                  width: '40px',
                  textAlign: 'right',
                  paddingRight: '4px',
                  color: markerColor(type),
                  backgroundColor: gutterBg(type),
                  userSelect: 'none',
                  opacity: rightNo !== null ? 1 : 0.3,
                }}
              >
                {rightNo ?? ''}
              </div>

              {/* +/- marker */}
              <div
                style={{
                  flexShrink: 0,
                  width: '20px',
                  textAlign: 'center',
                  color: markerColor(type),
                  backgroundColor: gutterBg(type),
                  userSelect: 'none',
                  fontWeight: 600,
                  borderRight: '1px solid var(--border-muted)',
                }}
              >
                {line[0] === ' ' ? ' ' : line[0]}
              </div>

              {/* Line content */}
              <pre
                style={{
                  flex: 1,
                  margin: 0,
                  padding: '0 12px',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  lineHeight: 'inherit',
                  whiteSpace: 'pre',
                  color: 'var(--text)',
                  overflowX: 'visible',
                }}
              >
                {text}
              </pre>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          padding: '4px 8px',
          background: 'var(--bg-tertiary, var(--bg-secondary))',
          borderTop: '1px solid var(--border-muted)',
        }}
      >
        <ActionBtn
          label={hunk.decision === 'accepted' ? 'Accepted' : 'Accept'}
          color="var(--success, #4CAF50)"
          disabled={decided}
          onClick={onAccept}
        />
        <ActionBtn
          label={hunk.decision === 'rejected' ? 'Rejected' : 'Reject'}
          color="var(--error, #f85149)"
          disabled={decided}
          onClick={onReject}
        />
      </div>
    </div>
  );
});
