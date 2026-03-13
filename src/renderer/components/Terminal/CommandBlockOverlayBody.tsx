import React, { useMemo } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { CommandBlock } from './useCommandBlocks';

export interface CommandBlockOverlayProps {
  blocks: CommandBlock[];
  terminal: Terminal | null;
  onToggleCollapse: (blockId: string) => void;
  onCopyOutput: (block: CommandBlock) => void;
  activeBlockIndex: number;
}

type VisibleBlock = { block: CommandBlock; index: number };
type BlockActionProps = Pick<CommandBlockOverlayProps, 'onCopyOutput' | 'onToggleCollapse'> & { block: CommandBlock };
type BlockHeaderProps = BlockActionProps & { cellHeight: number };
type DecorationProps = BlockHeaderProps & { activeBlockIndex: number; index: number; viewportY: number };
type HeaderTextProps = { children: React.ReactNode; color?: string; style?: React.CSSProperties };

const overlayContainerStyle: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden',
};
const overlayButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-muted, #666)', cursor: 'pointer', padding: '1px 3px',
  fontSize: 11, lineHeight: 1, borderRadius: 2, opacity: 0.6, display: 'flex', alignItems: 'center',
};
const headerTextStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--text-muted, #666)', fontFamily: 'var(--font-mono, monospace)', userSelect: 'none', opacity: 0.7,
};
const exitCodeStyle: React.CSSProperties = {
  ...headerTextStyle, color: 'var(--error, #e53935)', padding: '0 3px', borderRadius: 2, background: 'rgba(229,57,53,0.1)', opacity: 1,
};
const commandPreviewBaseStyle: React.CSSProperties = {
  position: 'absolute', top: 0, left: 8, display: 'flex', alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono, monospace)',
  color: 'var(--accent, #58a6ff)', opacity: 0.8, userSelect: 'none', pointerEvents: 'none', maxWidth: '60%', overflow: 'hidden',
  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

function getCellHeight(term: Terminal): number {
  try {
    const core = (term as unknown as Record<string, unknown>)._core as Record<string, unknown> | undefined;
    const renderService = core?._renderService as Record<string, unknown> | undefined;
    const dimensions = renderService?.dimensions as { css?: { cell?: { height?: number } } } | undefined;
    if (dimensions?.css?.cell?.height) {
      return dimensions.css.cell.height;
    }
  } catch {
    // Fall back to a height estimate when internals are unavailable.
  }
  return term.element ? term.element.clientHeight / term.rows : 17;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function getDuration(block: CommandBlock): number | undefined {
  return block.duration !== undefined && block.duration > 500 ? block.duration : undefined;
}

function getExitCode(block: CommandBlock): number | undefined {
  return block.exitCode !== undefined && block.exitCode !== 0 ? block.exitCode : undefined;
}

function canCollapseBlock(block: CommandBlock): boolean {
  return block.complete && block.endLine - block.startLine > 1;
}

function getHeaderStyle(cellHeight: number): React.CSSProperties {
  return { position: 'absolute', top: 0, right: 4, display: 'flex', alignItems: 'center', gap: 4, height: cellHeight, pointerEvents: 'auto', zIndex: 6 };
}

function getDecorationStyle(block: CommandBlock, cellHeight: number, isActive: boolean, viewportY: number): React.CSSProperties {
  const height = block.collapsed ? cellHeight : (block.endLine - block.startLine + 1) * cellHeight;
  const borderColor = getExitCode(block) !== undefined ? 'var(--error, #e53935)' : isActive ? 'var(--accent, #58a6ff)' : 'var(--border, #444)';
  return {
    position: 'absolute', top: (block.startLine - viewportY) * cellHeight, left: 0, right: 0, height, borderLeft: `2px solid ${borderColor}`,
    background: isActive ? 'rgba(88,166,255,0.04)' : 'transparent', transition: 'background 0.15s ease', pointerEvents: 'none',
  };
}

function useVisibleBlocks(blocks: CommandBlock[], terminal: Terminal | null): VisibleBlock[] {
  return useMemo(() => {
    if (!terminal || blocks.length === 0) return [];
    const viewportTop = terminal.buffer.active.viewportY;
    const viewportBottom = viewportTop + terminal.rows;
    return blocks.map((block, index) => ({ block, index })).filter(({ block }) => block.endLine >= viewportTop && block.startLine <= viewportBottom);
  }, [blocks, terminal]);
}

function OverlayButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }): React.ReactElement {
  return (
    <button
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      title={title}
      style={overlayButtonStyle}
      onMouseEnter={(event) => { event.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(event) => { event.currentTarget.style.opacity = '0.6'; }}
    >
      {children}
    </button>
  );
}

function HeaderText({ children, color, style }: HeaderTextProps): React.ReactElement {
  return <span style={{ ...headerTextStyle, color: color ?? headerTextStyle.color, ...style }}>{children}</span>;
}

function CopyOutputButton({ block, onCopyOutput }: BlockActionProps): React.ReactElement {
  return (
    <OverlayButton onClick={() => onCopyOutput(block)} title="Copy command output">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="5" width="9" height="9" rx="1" />
        <path d="M3 11V3a1 1 0 011-1h8" />
      </svg>
    </OverlayButton>
  );
}

function CollapseButton({ block, onToggleCollapse }: BlockActionProps): React.ReactElement {
  return (
    <OverlayButton onClick={() => onToggleCollapse(block.id)} title={block.collapsed ? 'Expand block' : 'Collapse block'}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        style={{ transform: block.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
      >
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </OverlayButton>
  );
}

function CommandPreview({ block, cellHeight }: { block: CommandBlock; cellHeight: number }): React.ReactElement | null {
  if (!block.collapsed || !block.command) return null;
  return <div style={{ ...commandPreviewBaseStyle, height: cellHeight }}>{block.command}</div>;
}

function BlockHeader({ block, cellHeight, onCopyOutput, onToggleCollapse }: BlockHeaderProps): React.ReactElement {
  const duration = getDuration(block);
  const exitCode = getExitCode(block);
  return (
    <div style={getHeaderStyle(cellHeight)}>
      <HeaderText>{formatTimestamp(block.timestamp)}</HeaderText>
      {duration !== undefined && <HeaderText color={duration > 10000 ? 'var(--warning, #f0a030)' : undefined}>{formatDuration(duration)}</HeaderText>}
      {exitCode !== undefined && <span style={exitCodeStyle}>exit {exitCode}</span>}
      {block.complete && <CopyOutputButton block={block} onCopyOutput={onCopyOutput} onToggleCollapse={onToggleCollapse} />}
      {canCollapseBlock(block) && <CollapseButton block={block} onCopyOutput={onCopyOutput} onToggleCollapse={onToggleCollapse} />}
    </div>
  );
}

function CommandBlockDecoration({
  activeBlockIndex, block, cellHeight, index, onCopyOutput, onToggleCollapse, viewportY,
}: DecorationProps): React.ReactElement {
  const isActive = index === activeBlockIndex;
  return (
    <div style={getDecorationStyle(block, cellHeight, isActive, viewportY)}>
      <BlockHeader block={block} cellHeight={cellHeight} onCopyOutput={onCopyOutput} onToggleCollapse={onToggleCollapse} />
      <CommandPreview block={block} cellHeight={cellHeight} />
    </div>
  );
}

export function CommandBlockOverlayBody({
  activeBlockIndex, blocks, onCopyOutput, onToggleCollapse, terminal,
}: CommandBlockOverlayProps): React.ReactElement | null {
  const visibleBlocks = useVisibleBlocks(blocks, terminal);
  if (!terminal || visibleBlocks.length === 0) return null;
  const cellHeight = getCellHeight(terminal);
  const viewportY = terminal.buffer.active.viewportY;
  return (
    <div style={overlayContainerStyle}>
      {visibleBlocks.map(({ block, index }) => (
        <CommandBlockDecoration
          key={block.id}
          activeBlockIndex={activeBlockIndex}
          block={block}
          cellHeight={cellHeight}
          index={index}
          onCopyOutput={onCopyOutput}
          onToggleCollapse={onToggleCollapse}
          viewportY={viewportY}
        />
      ))}
    </div>
  );
}
