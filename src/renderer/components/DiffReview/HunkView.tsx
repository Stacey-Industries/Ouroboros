/**
 * HunkView.tsx - Renders a single diff hunk with accept/reject controls.
 *
 * Shows context lines, added lines (green), removed lines (red), with
 * dual line-number gutters and action buttons per hunk.
 */

import React, { type CSSProperties,memo, useState } from 'react';

import type { HunkDecision, ReviewHunk } from './types';

interface HunkViewProps {
  hunk: ReviewHunk;
  onAccept: () => void;
  onReject: () => void;
}

type DiffLineType = ReturnType<typeof lineTypeFromPrefix>;

interface DisplayLine {
  id: string;
  leftNo: number | null;
  marker: string;
  rightNo: number | null;
  text: string;
  type: DiffLineType;
}

interface HunkHeaderProps {
  decision: HunkDecision;
  header: string;
}

interface HunkActionsProps {
  decision: HunkDecision;
  onAccept: () => void;
  onReject: () => void;
}

interface HunkLinesProps {
  lines: DisplayLine[];
}

interface HunkLineRowProps {
  line: DisplayLine;
}

interface DecisionBadgeProps {
  decision: HunkDecision;
}

interface ActionBtnProps {
  color: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

const hunkHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 8px',
  backgroundColor: 'rgba(88, 166, 255, 0.08)',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--interactive-accent)',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  userSelect: 'none',
};

const diffLinesStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
  lineHeight: '1.6',
};

const lineContentStyle: CSSProperties = {
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

const actionBarStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '4px 8px',
  background: 'var(--surface-raised)',
  borderTop: '1px solid var(--border-subtle)',
};

const acceptedBadgeStyle: CSSProperties = {
  color: 'var(--status-success, #4CAF50)',
  fontWeight: 600,
  fontSize: '0.75rem',
};

const rejectedBadgeStyle: CSSProperties = {
  color: 'var(--status-error, #f85149)',
  fontWeight: 600,
  fontSize: '0.75rem',
};

function lineTypeFromPrefix(line: string): 'added' | 'removed' | 'context' {
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

function lineBg(type: DiffLineType): string {
  switch (type) {
    case 'added': return 'rgba(80, 200, 80, 0.12)';
    case 'removed': return 'rgba(255, 80, 80, 0.12)';
    default: return 'transparent';
  }
}

function gutterBg(type: DiffLineType): string {
  switch (type) {
    case 'added': return 'rgba(80, 200, 80, 0.18)';
    case 'removed': return 'rgba(255, 80, 80, 0.18)';
    default: return 'var(--surface-base)';
  }
}

function markerColor(type: DiffLineType): string {
  switch (type) {
    case 'added': return 'var(--status-success, #4CAF50)';
    case 'removed': return 'var(--status-error, #f85149)';
    default: return 'var(--text-faint)';
  }
}

function decisionBorder(decision: HunkDecision): string {
  switch (decision) {
    case 'accepted': return '3px solid var(--status-success, #4CAF50)';
    case 'rejected': return '3px solid var(--status-error, #f85149)';
    default: return '3px solid transparent';
  }
}

function containerStyle(decision: HunkDecision): CSSProperties {
  return {
    borderLeft: decisionBorder(decision),
    marginBottom: '2px',
    transition: 'border-color 0.15s',
  };
}

function lineRowStyle(type: DiffLineType): CSSProperties {
  return {
    display: 'flex',
    backgroundColor: lineBg(type),
    minHeight: '1.6em',
  };
}

function lineNumberStyle(type: DiffLineType, visible: boolean): CSSProperties {
  return {
    flexShrink: 0,
    width: '40px',
    textAlign: 'right',
    paddingRight: '4px',
    color: markerColor(type),
    backgroundColor: gutterBg(type),
    userSelect: 'none',
    opacity: visible ? 1 : 0.3,
  };
}

function markerStyle(type: DiffLineType): CSSProperties {
  return {
    flexShrink: 0,
    width: '20px',
    textAlign: 'center',
    color: markerColor(type),
    backgroundColor: gutterBg(type),
    userSelect: 'none',
    fontWeight: 600,
    borderRight: '1px solid var(--border-subtle)',
  };
}

function buttonStyle(color: string, hovered: boolean, disabled?: boolean): CSSProperties {
  return {
    padding: '2px 10px',
    fontSize: '0.6875rem',
    fontFamily: 'var(--font-ui)',
    fontWeight: 500,
    border: `1px solid ${color}`,
    borderRadius: '4px',
    background: hovered && !disabled ? color : 'transparent',
    color: hovered && !disabled ? 'var(--text-on-accent)' : color,
    cursor: disabled ? 'default' : 'pointer',
    lineHeight: '1.5',
    transition: 'background 0.1s, color 0.1s',
    opacity: disabled ? 0.4 : 1,
  };
}

function buildDisplayLines(hunk: ReviewHunk): DisplayLine[] {
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

function DecisionBadge({ decision }: DecisionBadgeProps): React.ReactElement | null {
  if (decision === 'pending') return null;
  return (
    <span style={decision === 'accepted' ? acceptedBadgeStyle : rejectedBadgeStyle}>
      {decision === 'accepted' ? 'ACCEPTED' : 'REJECTED'}
    </span>
  );
}

function HunkHeader({ decision, header }: HunkHeaderProps): React.ReactElement {
  return (
    <div style={hunkHeaderStyle}>
      <span>{header}</span>
      <DecisionBadge decision={decision} />
    </div>
  );
}

function HunkLineRow({ line }: HunkLineRowProps): React.ReactElement {
  return (
    <div style={lineRowStyle(line.type)}>
      <div style={lineNumberStyle(line.type, line.leftNo !== null)}>{line.leftNo ?? ''}</div>
      <div style={lineNumberStyle(line.type, line.rightNo !== null)}>{line.rightNo ?? ''}</div>
      <div style={markerStyle(line.type)}>{line.marker}</div>
      <pre style={lineContentStyle}>{line.text}</pre>
    </div>
  );
}

function HunkLines({ lines }: HunkLinesProps): React.ReactElement {
  return (
    <div style={diffLinesStyle}>
      {lines.map((line) => <HunkLineRow key={line.id} line={line} />)}
    </div>
  );
}

function ActionBtn({ color, disabled, label, onClick }: ActionBtnProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={buttonStyle(color, hovered, disabled)}
    >
      {label}
    </button>
  );
}

function HunkActions({ decision, onAccept, onReject }: HunkActionsProps): React.ReactElement {
  const decided = decision !== 'pending';

  return (
    <div style={actionBarStyle}>
      <ActionBtn
        label={decision === 'accepted' ? 'Accepted' : 'Accept'}
        color="var(--status-success, #4CAF50)"
        disabled={decided}
        onClick={onAccept}
      />
      <ActionBtn
        label={decision === 'rejected' ? 'Rejected' : 'Reject'}
        color="var(--status-error, #f85149)"
        disabled={decided}
        onClick={onReject}
      />
    </div>
  );
}

export const HunkView = memo(function HunkView({ hunk, onAccept, onReject }: HunkViewProps): React.ReactElement {
  const lines = buildDisplayLines(hunk);

  return (
    <div style={containerStyle(hunk.decision)}>
      <HunkHeader decision={hunk.decision} header={hunk.header} />
      <HunkLines lines={lines} />
      <HunkActions decision={hunk.decision} onAccept={onAccept} onReject={onReject} />
    </div>
  );
});
