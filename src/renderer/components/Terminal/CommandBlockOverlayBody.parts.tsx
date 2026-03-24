/**
 * CommandBlockOverlayBody.parts.tsx — icon and sub-component helpers for the overlay.
 * Extracted to keep CommandBlockOverlayBody.tsx under 300 lines.
 */

import React, { useEffect, useState } from 'react';

import { CommandBlockActions } from './CommandBlockActions';
import {
  actionsContainerStyle,
  collapsedOverlayStyle,
  commandLabelStyle,
  formatDuration,
  formatRelativeTime,
  gutterStyle,
  separatorLineStyle,
  timestampStyle,
  truncateCommand,
} from './CommandBlockOverlayBody.styles';
import type { CommandBlock } from './useCommandBlocks';

// ── Gutter Icons ─────────────────────────────────────────────────────────────

export function SpinnerIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      style={{ animation: 'agent-ide-spin 1s linear infinite' }}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="var(--interactive-accent)"
        strokeWidth="2"
        strokeDasharray="20 18"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SuccessIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--status-success)" strokeWidth="1.5" opacity="0.8" />
      <path
        d="M5 8l2 2 4-4"
        stroke="var(--status-success)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ErrorIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--status-error)" strokeWidth="1.5" opacity="0.8" />
      <path
        d="M5.5 5.5l5 5M10.5 5.5l-5 5"
        stroke="var(--status-error)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GutterIcon({ block }: { block: CommandBlock }): React.ReactElement {
  if (!block.complete) return <SpinnerIcon />;
  if (block.exitCode === 0 || block.exitCode === undefined) return <SuccessIcon />;
  return <ErrorIcon />;
}

// ── Sub-components ────────────────────────────────────────────────────────────

export const OutputBorder = ({
  color,
  active,
}: {
  color: string;
  active: boolean;
}): React.ReactElement => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: 2,
      height: '100%',
      background: color,
      opacity: active ? 0.9 : 0.4,
      transition: 'opacity 0.15s ease',
    }}
  />
);

export const CommandLabel = ({
  command,
  cellHeight,
}: {
  command: string;
  cellHeight: number;
}): React.ReactElement => (
  <div
    className="text-interactive-accent"
    style={{ ...commandLabelStyle, top: (cellHeight - 14) / 2, height: 14 }}
    title={command}
  >
    {truncateCommand(command)}
  </div>
);

export function RelativeTimestamp({ timestamp }: { timestamp: number }): React.ReactElement {
  const [text, setText] = useState(() => formatRelativeTime(timestamp));
  useEffect(() => {
    const id = setInterval(() => setText(formatRelativeTime(timestamp)), 5000);
    return () => clearInterval(id);
  }, [timestamp]);
  return <span>{text}</span>;
}

export const TimestampRow = ({
  timestamp,
  duration,
  cellHeight,
}: {
  timestamp: number;
  duration?: number;
  cellHeight: number;
}): React.ReactElement => (
  <div
    className="text-text-semantic-muted"
    style={{ ...timestampStyle, top: (cellHeight - 12) / 2, height: 12, lineHeight: '12px' }}
  >
    <RelativeTimestamp timestamp={timestamp} />
    {duration !== undefined && duration > 500 && (
      <span
        style={{ marginLeft: 6, color: duration > 10000 ? 'var(--warning, #f0a030)' : undefined }}
      >
        {formatDuration(duration)}
      </span>
    )}
  </div>
);

export const ActionBar = ({
  hovered,
  cellHeight,
  block,
  sessionId,
  onToggleCollapse,
  onCopyOutput,
  onCopyCommand,
  onExplainError,
}: {
  hovered: boolean;
  cellHeight: number;
  block: CommandBlock;
  sessionId: string;
  onToggleCollapse: (blockId: string) => void;
  onCopyOutput: (block: CommandBlock) => void;
  onCopyCommand: (block: CommandBlock) => void;
  onExplainError: (block: CommandBlock) => void;
}): React.ReactElement => (
  <div
    style={{
      ...actionsContainerStyle,
      top: (cellHeight - 18) / 2,
      opacity: hovered ? 1 : 0,
      pointerEvents: hovered ? 'auto' : 'none',
    }}
  >
    <CommandBlockActions
      block={block}
      sessionId={sessionId}
      onCopyOutput={onCopyOutput}
      onCopyCommand={onCopyCommand}
      onToggleCollapse={onToggleCollapse}
      onExplainError={onExplainError}
    />
  </div>
);

export const CollapsedOverlay = ({
  block,
  cellHeight,
  borderColor,
  collapsedLines,
  onToggleCollapse,
}: {
  block: CommandBlock;
  cellHeight: number;
  borderColor: string;
  collapsedLines: number;
  onToggleCollapse: (blockId: string) => void;
}): React.ReactElement => (
  <div
    className="bg-surface-panel text-text-semantic-muted border-l-2"
    style={{
      ...collapsedOverlayStyle,
      top: cellHeight,
      height: '100%',
      borderLeftColor: borderColor,
    }}
    onClick={() => onToggleCollapse(block.id)}
    title="Click to expand"
  >
    {collapsedLines} line{collapsedLines !== 1 ? 's' : ''} collapsed - click to expand
  </div>
);

// ── Decoration Header ─────────────────────────────────────────────────────────

interface DecorationHeaderProps {
  block: CommandBlock;
  cellHeight: number;
  borderColor: string;
  isActive: boolean;
  hovered: boolean;
  sessionId: string;
  onToggleCollapse: (blockId: string) => void;
  onCopyOutput: (block: CommandBlock) => void;
  onCopyCommand: (block: CommandBlock) => void;
  onExplainError: (block: CommandBlock) => void;
}

export function CommandBlockDecorationHeader({
  block,
  cellHeight,
  borderColor,
  isActive,
  hovered,
  sessionId,
  onToggleCollapse,
  onCopyOutput,
  onCopyCommand,
  onExplainError,
}: DecorationHeaderProps): React.ReactElement {
  return (
    <>
      <div className="bg-border-semantic" style={{ ...separatorLineStyle, top: 0 }} />
      <OutputBorder color={borderColor} active={isActive} />
      <div style={{ ...gutterStyle, top: (cellHeight - 20) / 2 }}>
        <GutterIcon block={block} />
      </div>
      {block.command && <CommandLabel command={block.command} cellHeight={cellHeight} />}
      <TimestampRow timestamp={block.timestamp} duration={block.duration} cellHeight={cellHeight} />
      <ActionBar
        hovered={hovered}
        cellHeight={cellHeight}
        block={block}
        sessionId={sessionId}
        onToggleCollapse={onToggleCollapse}
        onCopyOutput={onCopyOutput}
        onCopyCommand={onCopyCommand}
        onExplainError={onExplainError}
      />
    </>
  );
}
