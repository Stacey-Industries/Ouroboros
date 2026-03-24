/**
 * CommandBlockOverlayBody - visual command separators, gutter icons, labels,
 * timestamps, action bars, and collapse overlays.
 */

import type { Terminal } from '@xterm/xterm';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  EXPLAIN_TERMINAL_ERROR_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
} from '../../hooks/appEventNames';
import { CommandBlockActions } from './CommandBlockActions';
import {
  actionsContainerStyle,
  collapsedOverlayStyle,
  commandLabelStyle,
  formatDuration,
  formatRelativeTime,
  getCellHeight,
  gutterStyle,
  overlayContainerStyle,
  readTerminalLines,
  separatorLineStyle,
  timestampStyle,
  truncateCommand,
} from './CommandBlockOverlayBody.styles';
import type { CommandBlock } from './useCommandBlocks';

export interface CommandBlockOverlayProps {
  blocks: CommandBlock[];
  terminal: Terminal | null;
  onToggleCollapse: (blockId: string) => void;
  onCopyOutput: (block: CommandBlock) => void;
  onCopyCommand: (block: CommandBlock) => void;
  activeBlockIndex: number;
  sessionId: string;
}

type VisibleBlock = { block: CommandBlock; index: number };

// ── Gutter Icons ─────────────────────────────────────────────────────────────

function SpinnerIcon(): React.ReactElement {
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

function SuccessIcon(): React.ReactElement {
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

function ErrorIcon(): React.ReactElement {
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

function GutterIcon({ block }: { block: CommandBlock }): React.ReactElement {
  if (!block.complete) return <SpinnerIcon />;
  if (block.exitCode === 0 || block.exitCode === undefined) return <SuccessIcon />;
  return <ErrorIcon />;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const OutputBorder = ({
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

const CommandLabel = ({
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

function RelativeTimestamp({ timestamp }: { timestamp: number }): React.ReactElement {
  const [text, setText] = useState(() => formatRelativeTime(timestamp));
  useEffect(() => {
    const id = setInterval(() => setText(formatRelativeTime(timestamp)), 5000);
    return () => clearInterval(id);
  }, [timestamp]);
  return <span>{text}</span>;
}

const TimestampRow = ({
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

const ActionBar = ({
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

const CollapsedOverlay = ({
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

// ── Decoration View ───────────────────────────────────────────────────────────

interface CommandBlockDecorationViewProps {
  block: CommandBlock;
  cellHeight: number;
  separatorY: number;
  outputHeight: number;
  borderColor: string;
  isActive: boolean;
  hovered: boolean;
  setHovered: React.Dispatch<React.SetStateAction<boolean>>;
  onToggleCollapse: (blockId: string) => void;
  onCopyOutput: (block: CommandBlock) => void;
  onCopyCommand: (block: CommandBlock) => void;
  onExplainError: (block: CommandBlock) => void;
  sessionId: string;
}

function CommandBlockDecorationHeader({
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
}: Omit<
  CommandBlockDecorationViewProps,
  'separatorY' | 'outputHeight' | 'setHovered'
>): React.ReactElement {
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

function CommandBlockDecorationView({
  block,
  cellHeight,
  separatorY,
  outputHeight,
  borderColor,
  isActive,
  hovered,
  setHovered,
  onToggleCollapse,
  onCopyOutput,
  onCopyCommand,
  onExplainError,
  sessionId,
}: CommandBlockDecorationViewProps): React.ReactElement {
  const collapsedLines = block.collapsed ? block.endLine - block.outputStartLine : 0;
  return (
    <div
      style={{
        position: 'absolute',
        top: separatorY,
        left: 0,
        right: 0,
        height: outputHeight,
        pointerEvents: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CommandBlockDecorationHeader
        block={block}
        cellHeight={cellHeight}
        borderColor={borderColor}
        isActive={isActive}
        hovered={hovered}
        sessionId={sessionId}
        onToggleCollapse={onToggleCollapse}
        onCopyOutput={onCopyOutput}
        onCopyCommand={onCopyCommand}
        onExplainError={onExplainError}
      />
      {block.collapsed && collapsedLines > 0 && (
        <CollapsedOverlay
          block={block}
          cellHeight={cellHeight}
          borderColor={borderColor}
          collapsedLines={collapsedLines}
          onToggleCollapse={onToggleCollapse}
        />
      )}
    </div>
  );
}

// ── Decoration (state container) ──────────────────────────────────────────────

interface CommandBlockDecorationProps {
  block: CommandBlock;
  index: number;
  cellHeight: number;
  viewportY: number;
  activeBlockIndex: number;
  onToggleCollapse: (blockId: string) => void;
  onCopyOutput: (block: CommandBlock) => void;
  onCopyCommand: (block: CommandBlock) => void;
  onExplainError: (block: CommandBlock) => void;
  sessionId: string;
}

function resolveBorderColor(block: CommandBlock): string {
  if (block.exitCode !== undefined && block.exitCode !== 0) return 'var(--status-error)';
  if (!block.complete) return 'var(--interactive-accent)';
  return 'var(--status-success)';
}

function CommandBlockDecoration({
  block,
  index,
  cellHeight,
  viewportY,
  activeBlockIndex,
  onToggleCollapse,
  onCopyOutput,
  onCopyCommand,
  onExplainError,
  sessionId,
}: CommandBlockDecorationProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const separatorY = (block.startLine - viewportY) * cellHeight;
  const outputHeight = block.collapsed
    ? cellHeight
    : (block.endLine - block.startLine + 1) * cellHeight;
  return (
    <CommandBlockDecorationView
      block={block}
      cellHeight={cellHeight}
      separatorY={separatorY}
      outputHeight={outputHeight}
      borderColor={resolveBorderColor(block)}
      isActive={index === activeBlockIndex}
      hovered={hovered}
      setHovered={setHovered}
      onToggleCollapse={onToggleCollapse}
      onCopyOutput={onCopyOutput}
      onCopyCommand={onCopyCommand}
      onExplainError={onExplainError}
      sessionId={sessionId}
    />
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useVisibleBlocks(blocks: CommandBlock[], terminal: Terminal | null): VisibleBlock[] {
  return useMemo(() => {
    if (!terminal || blocks.length === 0) return [];
    const viewportTop = terminal.buffer.active.viewportY;
    const viewportBottom = viewportTop + terminal.rows;
    return blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.endLine >= viewportTop && block.startLine <= viewportBottom);
  }, [blocks, terminal]);
}

function useScrollViewportY(terminal: Terminal | null): number {
  const [viewportY, setViewportY] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!terminal || !terminal.element) return;
    const core = (terminal as unknown as { _core?: { _isDisposed?: boolean } })._core;
    if (core?._isDisposed) return;
    let scrollD: { dispose(): void } | null = null;
    let writeD: { dispose(): void } | null = null;
    try {
      setViewportY(terminal.buffer.active.viewportY);
      scrollD = terminal.onScroll(() => {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() =>
          setViewportY(terminal.buffer.active.viewportY),
        );
      });
      writeD = terminal.onWriteParsed(() => {
        const buf = terminal.buffer.active;
        if (buf.viewportY >= buf.baseY) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() =>
            setViewportY(terminal.buffer.active.viewportY),
          );
        }
      });
    } catch {
      /* ignore */
    }
    return () => {
      scrollD?.dispose();
      writeD?.dispose();
      cancelAnimationFrame(rafRef.current);
    };
  }, [terminal]);

  return viewportY;
}

function useExplainErrorHandler(terminal: Terminal | null): (block: CommandBlock) => void {
  return useCallback(
    (block: CommandBlock) => {
      if (!terminal) return;
      const output = readTerminalLines(terminal, block.outputStartLine, block.endLine);
      const cmd = block.command || '(unknown command)';
      const prompt = `Explain this terminal error:\n\`\`\`\n$ ${cmd}\n${output}\n\`\`\`\nExit code: ${block.exitCode}`;
      window.dispatchEvent(new CustomEvent(OPEN_AGENT_CHAT_PANEL_EVENT));
      window.dispatchEvent(new CustomEvent(EXPLAIN_TERMINAL_ERROR_EVENT, { detail: { prompt } }));
    },
    [terminal],
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function CommandBlockOverlayBody({
  activeBlockIndex,
  blocks,
  onCopyOutput,
  onCopyCommand,
  onToggleCollapse,
  terminal,
  sessionId,
}: CommandBlockOverlayProps): React.ReactElement | null {
  const visibleBlocks = useVisibleBlocks(blocks, terminal);
  const viewportY = useScrollViewportY(terminal);
  const handleExplainError = useExplainErrorHandler(terminal);

  if (!terminal || visibleBlocks.length === 0) return null;
  const cellHeight = getCellHeight(terminal);

  return (
    <div style={overlayContainerStyle}>
      {visibleBlocks.map(({ block, index }) => (
        <CommandBlockDecoration
          key={block.id}
          block={block}
          index={index}
          cellHeight={cellHeight}
          viewportY={viewportY}
          activeBlockIndex={activeBlockIndex}
          onToggleCollapse={onToggleCollapse}
          onCopyOutput={onCopyOutput}
          onCopyCommand={onCopyCommand}
          onExplainError={handleExplainError}
          sessionId={sessionId}
        />
      ))}
    </div>
  );
}
