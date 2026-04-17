/**
 * HunkView.tsx - Renders a single diff hunk with accept/reject controls.
 *
 * Shows context lines, added lines (green), removed lines (red), with
 * dual line-number gutters and action buttons per hunk.
 */

import React, { type CSSProperties, memo, useState } from 'react';

import {
  acceptedBadgeStyle,
  actionBarStyle,
  buildDisplayLines,
  diffLinesStyle,
  type DiffLineType,
  type DisplayLine,
  gutterBg,
  hunkHeaderStyle,
  lineBg,
  lineContentStyle,
  markerColor,
  rejectedBadgeStyle,
} from './hunkViewHelpers';
import type { HunkDecision, ReviewHunk } from './types';

interface HunkViewProps {
  hunk: ReviewHunk;
  isFocused?: boolean;
  onAccept: () => void;
  onReject: () => void;
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

function decisionBorder(decision: HunkDecision): string {
  switch (decision) {
    case 'accepted': return '3px solid var(--status-success)';
    case 'rejected': return '3px solid var(--status-error)';
    default: return '3px solid transparent';
  }
}

function containerStyle(decision: HunkDecision, isFocused?: boolean): CSSProperties {
  return {
    borderLeft: decisionBorder(decision),
    marginBottom: '2px',
    transition: 'border-color 0.15s, outline 0.1s',
    outline: isFocused ? '2px solid var(--border-accent)' : 'none',
    outlineOffset: '-2px',
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
        color="var(--status-success)"
        disabled={decided}
        onClick={onAccept}
      />
      <ActionBtn
        label={decision === 'rejected' ? 'Rejected' : 'Reject'}
        color="var(--status-error)"
        disabled={decided}
        onClick={onReject}
      />
    </div>
  );
}

export const HunkView = memo(function HunkView({ hunk, isFocused, onAccept, onReject }: HunkViewProps): React.ReactElement {
  const lines = buildDisplayLines(hunk);

  return (
    <div style={containerStyle(hunk.decision, isFocused)}>
      <HunkHeader decision={hunk.decision} header={hunk.header} />
      <HunkLines lines={lines} />
      <HunkActions decision={hunk.decision} onAccept={onAccept} onReject={onReject} />
    </div>
  );
});
