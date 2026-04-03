/**
 * SearchPanel.results — FileGroup and ResultLine sub-components.
 */

import React, { useEffect, useRef, useState } from 'react';

import type { SearchResultItem } from '../../types/electron-runtime-apis';

// ── FileGroup ─────────────────────────────────────────────────────────────────

interface FileGroupProps {
  filePath: string;
  displayPath: string;
  matchCount: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const FILE_GROUP_HEADER_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  padding: '3px 8px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  cursor: 'pointer',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
};

const FILE_PATH_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const CHEVRON_BASE: React.CSSProperties = {
  transition: 'transform 120ms',
  display: 'inline-block',
  flexShrink: 0,
  fontSize: '0.5625rem',
};

export function FileGroup({ displayPath, matchCount, collapsed, onToggle, children }: FileGroupProps): React.ReactElement {
  return (
    <div className="flex flex-col">
      <button
        className="bg-surface-panel hover:bg-surface-raised text-text-semantic-secondary"
        style={FILE_GROUP_HEADER_STYLE}
        onClick={onToggle}
        title={displayPath}
        aria-expanded={!collapsed}
      >
        <span style={{ ...CHEVRON_BASE, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
        <span style={FILE_PATH_STYLE}>{displayPath}</span>
        <span className="text-text-semantic-faint" style={{ flexShrink: 0, fontSize: '0.625rem' }}>
          {matchCount}
        </span>
      </button>
      {!collapsed && children}
    </div>
  );
}

// ── ResultLine ────────────────────────────────────────────────────────────────

export interface ResultLineProps {
  item: SearchResultItem;
  onClick: (item: SearchResultItem) => void;
}

function highlightMatch(lineContent: string, column: number, matchLength: number): React.ReactNode {
  const before = lineContent.slice(0, column);
  const match = lineContent.slice(column, column + matchLength);
  const after = lineContent.slice(column + matchLength);
  return (
    <>
      <span>{before}</span>
      <span className="bg-search-match-bg">{match}</span>
      <span>{after}</span>
    </>
  );
}

const RESULT_LINE_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-mono)',
  padding: '1px 8px 1px 20px',
  display: 'flex',
  alignItems: 'baseline',
  gap: '6px',
  cursor: 'pointer',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
};

export function ResultLine({ item, onClick }: ResultLineProps): React.ReactElement {
  const trimmedContent = item.lineContent.trimStart();
  const trimOffset = item.lineContent.length - trimmedContent.length;
  const adjustedCol = Math.max(0, item.column - trimOffset);

  return (
    <button
      className="hover:bg-surface-raised text-text-semantic-primary"
      style={RESULT_LINE_STYLE}
      onClick={() => onClick(item)}
      title={`Line ${item.line + 1}: ${item.lineContent.trim()}`}
    >
      <span
        className="text-text-semantic-faint"
        style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '0.625rem', minWidth: '24px', textAlign: 'right' }}
      >
        {item.line + 1}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {highlightMatch(trimmedContent, adjustedCol, item.matchLength)}
      </span>
    </button>
  );
}

// ── Virtualized results ─────────────────────────────────────────────────────

export type FlatSearchItem =
  | { kind: 'header'; filePath: string; displayPath: string; matchCount: number; collapsed: boolean }
  | { kind: 'result'; item: SearchResultItem };

const ROW_HEIGHT = 22;
const V_OVERSCAN = 10;

const VIRTUAL_CONTAINER_STYLE: React.CSSProperties = {
  flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, position: 'relative',
};

export function flattenSearchResults(
  grouped: Map<string, SearchResultItem[]>,
  collapsed: Set<string>,
  toDisplay: (fp: string) => string,
): FlatSearchItem[] {
  const flat: FlatSearchItem[] = [];
  for (const [fp, items] of grouped) {
    const isColl = collapsed.has(fp);
    flat.push({ kind: 'header', filePath: fp, displayPath: toDisplay(fp), matchCount: items.length, collapsed: isColl });
    if (!isColl) for (const item of items) flat.push({ kind: 'result', item });
  }
  return flat;
}

function useScrollState(ref: React.RefObject<HTMLDivElement | null>): { scrollTop: number; viewHeight: number } {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(400);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = (): void => { setScrollTop(el.scrollTop); };
    const ro = new ResizeObserver(() => { setViewHeight(el.clientHeight); setScrollTop(el.scrollTop); });
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    setViewHeight(el.clientHeight);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [ref]);
  return { scrollTop, viewHeight };
}

function computeVisibleRange(total: number, scrollTop: number, viewH: number): [number, number] {
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - V_OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + viewH) / ROW_HEIGHT) + V_OVERSCAN);
  return [start, end];
}

function FileGroupHeader({ displayPath, matchCount, collapsed, onToggle }: {
  displayPath: string; matchCount: number; collapsed: boolean; onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      className="bg-surface-panel hover:bg-surface-raised text-text-semantic-secondary"
      style={{ ...FILE_GROUP_HEADER_STYLE, height: ROW_HEIGHT, boxSizing: 'border-box' }}
      onClick={onToggle} title={displayPath} aria-expanded={!collapsed}
    >
      <span style={{ ...CHEVRON_BASE, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
      <span style={FILE_PATH_STYLE}>{displayPath}</span>
      <span className="text-text-semantic-faint" style={{ flexShrink: 0, fontSize: '0.625rem' }}>{matchCount}</span>
    </button>
  );
}

function renderFlatItem(
  item: FlatSearchItem, idx: number, onToggle: (fp: string) => void, onClick: (i: SearchResultItem) => void,
): React.ReactElement {
  const key = item.kind === 'header' ? `h:${item.filePath}` : `r:${idx}`;
  const style: React.CSSProperties = { position: 'absolute', top: idx * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT, overflow: 'hidden' };
  return (
    <div key={key} style={style}>
      {item.kind === 'header'
        ? <FileGroupHeader displayPath={item.displayPath} matchCount={item.matchCount} collapsed={item.collapsed} onToggle={() => onToggle(item.filePath)} />
        : <ResultLine item={item.item} onClick={onClick} />}
    </div>
  );
}

export interface VirtualResultsAreaProps {
  flatItems: FlatSearchItem[];
  onToggle: (filePath: string) => void;
  onClick: (item: SearchResultItem) => void;
}

export function VirtualResultsArea({ flatItems, onToggle, onClick }: VirtualResultsAreaProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollTop, viewHeight } = useScrollState(ref);
  const [start, end] = computeVisibleRange(flatItems.length, scrollTop, viewHeight);
  return (
    <div ref={ref} style={VIRTUAL_CONTAINER_STYLE}>
      <div style={{ height: flatItems.length * ROW_HEIGHT, position: 'relative' }}>
        {flatItems.slice(start, end).map((item, i) => renderFlatItem(item, start + i, onToggle, onClick))}
      </div>
    </div>
  );
}
