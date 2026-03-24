import React from 'react';

export const overlayContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: 5,
  overflow: 'hidden',
};

export const separatorLineStyle: React.CSSProperties = {
  position: 'absolute',
  left: 28,
  right: 0,
  height: 1,
  opacity: 0.5,
};

export const gutterStyle: React.CSSProperties = {
  position: 'absolute',
  left: 4,
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 7,
};

export const commandLabelStyle: React.CSSProperties = {
  position: 'absolute',
  left: 32,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 10,
  fontFamily: 'var(--font-mono, monospace)',
  opacity: 0.85,
  userSelect: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '50%',
};

export const timestampStyle: React.CSSProperties = {
  position: 'absolute',
  right: 6,
  fontSize: 9,
  fontFamily: 'var(--font-mono, monospace)',
  opacity: 0.7,
  userSelect: 'none',
};

export const actionsContainerStyle: React.CSSProperties = {
  position: 'absolute',
  right: 80,
  display: 'flex',
  alignItems: 'center',
  opacity: 0,
  transition: 'opacity 0.15s ease',
};

export const collapsedOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  left: 28,
  right: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backdropFilter: 'blur(2px)',
  fontSize: 11,
  fontFamily: 'var(--font-mono, monospace)',
  cursor: 'pointer',
  pointerEvents: 'auto',
  userSelect: 'none',
};

export function formatRelativeTime(timestamp: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function truncateCommand(cmd: string, max: number = 60): string {
  return cmd.length <= max ? cmd : `${cmd.slice(0, max - 1)}\u2026`;
}

export function readTerminalLines(
  term: import('@xterm/xterm').Terminal,
  startLine: number,
  endLine: number,
  maxLines: number = 50,
): string {
  const buf = term.buffer.active;
  const from = Math.max(startLine, endLine - maxLines + 1);
  const lines: string[] = [];
  for (let i = from; i <= endLine; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  return lines.join('\n').trimEnd();
}

export function getCellHeight(term: import('@xterm/xterm').Terminal): number {
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
    /* ignore */
  }
  return term.element ? term.element.clientHeight / term.rows : 17;
}
