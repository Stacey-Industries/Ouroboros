/**
 * StickyScrollOverlay — pinned command header at the top of the terminal
 * viewport when scrolling through a command's output.
 *
 * Shows: command text, exit code indicator, duration, click-to-scroll-back.
 * Hides when the viewport naturally shows the command's prompt row.
 */

import type { Terminal } from '@xterm/xterm';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CommandBlock } from './useCommandBlocks';

export interface StickyScrollOverlayProps {
  blocks: CommandBlock[];
  terminal: Terminal | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCellHeight(term: Terminal): number {
  try {
    const core = (term as unknown as Record<string, unknown>)._core as
      | Record<string, unknown>
      | undefined;
    const renderService = core?._renderService as Record<string, unknown> | undefined;
    const dimensions = renderService?.dimensions as
      | { css?: { cell?: { height?: number } } }
      | undefined;
    if (dimensions?.css?.cell?.height) return dimensions.css.cell.height;
  } catch {
    /* fall through */
  }
  return term.element ? term.element.clientHeight / term.rows : 17;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function truncateCommand(cmd: string, max: number = 50): string {
  if (cmd.length <= max) return cmd;
  return cmd.slice(0, max - 1) + '\u2026';
}

/**
 * Find the command whose prompt row is above viewport top and whose output
 * extends into the viewport (i.e., the command the user is scrolling through).
 */
function findStickyCommand(blocks: CommandBlock[], viewportTop: number): CommandBlock | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    // Prompt is above viewport, and the block extends into the viewport
    if (block.startLine < viewportTop && block.endLine >= viewportTop) {
      return block;
    }
  }
  return null;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const stickyContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '2px 8px 2px 6px',
  backdropFilter: 'blur(4px)',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
  cursor: 'pointer',
  userSelect: 'none',
  pointerEvents: 'auto',
  transition: 'opacity 0.15s ease',
};

function ExitDot({ exitCode }: { exitCode?: number }): React.ReactElement {
  const isRunning = exitCode === undefined;
  const isSuccess = exitCode === 0;
  const color = isRunning
    ? 'var(--interactive-accent)'
    : isSuccess
      ? 'var(--status-success)'
      : 'var(--status-error)';

  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : undefined,
      }}
    />
  );
}

// Inject pulse keyframe once
let pulseInjected = false;
function ensurePulseKeyframe(): void {
  if (pulseInjected) return;
  pulseInjected = true;
  const style = document.createElement('style');
  style.textContent = '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }';
  document.head.appendChild(style);
}

function useStickyViewportY(terminal: Terminal | null): number {
  const [viewportY, setViewportY] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!terminal) return;
    setViewportY(terminal.buffer.active.viewportY);
    const updateViewport = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => setViewportY(terminal.buffer.active.viewportY));
    };
    const scrollD = terminal.onScroll(updateViewport);
    const writeD = terminal.onWriteParsed(() => {
      const buf = terminal.buffer.active;
      if (buf.viewportY >= buf.baseY) updateViewport();
    });
    return () => {
      scrollD.dispose();
      writeD.dispose();
      cancelAnimationFrame(rafRef.current);
    };
  }, [terminal]);

  return viewportY;
}

// ── Live Duration ────────────────────────────────────────────────────────────

function LiveDuration({ block }: { block: CommandBlock }): React.ReactElement | null {
  const [elapsed, setElapsed] = useState(() =>
    block.complete ? block.duration : Date.now() - block.timestamp,
  );

  useEffect(() => {
    if (block.complete) {
      setElapsed(block.duration);
      return;
    }
    const id = setInterval(() => setElapsed(Date.now() - block.timestamp), 200);
    return () => clearInterval(id);
  }, [block.complete, block.duration, block.timestamp]);

  if (elapsed === undefined || elapsed < 500) return null;
  return (
    <span
      className="text-text-semantic-muted"
      style={{
        fontSize: 10,
        marginLeft: 'auto',
        flexShrink: 0,
      }}
    >
      {formatDuration(elapsed)}
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

function ExitCodeBadge({ exitCode }: { exitCode: number }): React.ReactElement {
  return (
    <span
      className="text-status-error"
      style={{ fontSize: 10, padding: '0 3px', borderRadius: 2, background: 'rgba(229,57,53,0.1)' }}
    >
      exit {exitCode}
    </span>
  );
}

function StickyScrollContent({ block }: { block: CommandBlock }): React.ReactElement {
  return (
    <>
      <ExitDot exitCode={block.complete ? (block.exitCode ?? 0) : undefined} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {block.command ? truncateCommand(block.command) : '(command)'}
      </span>
      {block.exitCode !== undefined && block.exitCode !== 0 && (
        <ExitCodeBadge exitCode={block.exitCode} />
      )}
      <LiveDuration block={block} />
      <span className="text-text-semantic-muted" style={{ fontSize: 9, flexShrink: 0 }}>
        {'\u2191'} scroll to prompt
      </span>
    </>
  );
}

function useStickyState(
  blocks: CommandBlock[],
  terminal: Terminal | null,
): { stickyBlock: CommandBlock | null; handleClick: () => void } {
  const viewportY = useStickyViewportY(terminal);
  const stickyBlock = useMemo(() => findStickyCommand(blocks, viewportY), [blocks, viewportY]);
  const handleClick = useCallback(() => {
    if (!terminal || !stickyBlock) return;
    terminal.scrollToLine(Math.max(0, stickyBlock.startLine - 1));
  }, [terminal, stickyBlock]);
  return { stickyBlock, handleClick };
}

export function StickyScrollOverlay({
  blocks,
  terminal,
}: StickyScrollOverlayProps): React.ReactElement | null {
  ensurePulseKeyframe();
  const { stickyBlock, handleClick } = useStickyState(blocks, terminal);
  if (!stickyBlock || !terminal) return null;
  return (
    <div
      className="bg-surface-panel text-text-semantic-primary border-b border-border-semantic"
      style={{ ...stickyContainerStyle, height: getCellHeight(terminal) }}
      onClick={handleClick}
      title="Click to scroll to command"
    >
      <StickyScrollContent block={stickyBlock} />
    </div>
  );
}
