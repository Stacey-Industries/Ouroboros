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
import { CollapsedOverlay, CommandBlockDecorationHeader } from './CommandBlockOverlayBody.parts';
import {
  getCellHeight,
  overlayContainerStyle,
  readTerminalLines,
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

const DECORATION_WRAPPER: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  pointerEvents: 'none',
};

function DecorationHeader(p: CommandBlockDecorationViewProps): React.ReactElement {
  return (
    <CommandBlockDecorationHeader
      block={p.block}
      cellHeight={p.cellHeight}
      borderColor={p.borderColor}
      isActive={p.isActive}
      hovered={p.hovered}
      sessionId={p.sessionId}
      onToggleCollapse={p.onToggleCollapse}
      onCopyOutput={p.onCopyOutput}
      onCopyCommand={p.onCopyCommand}
      onExplainError={p.onExplainError}
    />
  );
}

function CommandBlockDecorationView(props: CommandBlockDecorationViewProps): React.ReactElement {
  const { block, cellHeight, separatorY, outputHeight, borderColor, setHovered, onToggleCollapse } =
    props;
  const collapsedLines = block.collapsed ? block.endLine - block.outputStartLine : 0;
  return (
    <div
      style={{ ...DECORATION_WRAPPER, top: separatorY, height: outputHeight }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <DecorationHeader {...props} />
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
