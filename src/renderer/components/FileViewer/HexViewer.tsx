import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatBytes } from './ImageViewer.parts';

export interface HexViewerProps {
  content: Uint8Array;
  filePath: string;
}

const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 20;

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--surface-base)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
};

const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 12px',
  borderBottom: '1px solid var(--border-muted)',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
};

const btnStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  lineHeight: '1.5',
};

const searchInputStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-mono)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  backgroundColor: 'var(--surface-base)',
  width: '200px',
};

const headerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  padding: '4px 12px',
  borderBottom: '1px solid var(--border-muted)',
  backgroundColor: 'var(--surface-panel)',
  fontSize: '0.625rem',
  fontFamily: 'var(--font-mono)',
  userSelect: 'none',
};

const scrollContainerStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  position: 'relative',
};

const OFFSET_WIDTH = 80;
const HEX_WIDTH = 430; // 16 bytes * ~25px + group space
const ASCII_WIDTH = 160;

function toHex2(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

function toOffset(offset: number): string {
  return offset.toString(16).toUpperCase().padStart(8, '0');
}

function isPrintable(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

function buildHexRow(data: Uint8Array, offset: number): { hex: string; ascii: string } {
  const end = Math.min(offset + BYTES_PER_ROW, data.length);
  const hexParts: string[] = [];
  const asciiParts: string[] = [];

  for (let i = offset; i < end; i++) {
    const b = data[i];
    hexParts.push(toHex2(b));
    asciiParts.push(isPrintable(b) ? String.fromCharCode(b) : '.');

    // Extra space between groups of 8
    if ((i - offset) === 7) {
      hexParts.push('');
    }
  }

  // Pad remaining columns
  const remaining = BYTES_PER_ROW - (end - offset);
  for (let i = 0; i < remaining; i++) {
    hexParts.push('  ');
    asciiParts.push(' ');
    if ((end - offset + i) === 7) {
      hexParts.push('');
    }
  }

  return {
    hex: hexParts.join(' '),
    ascii: asciiParts.join(''),
  };
}

function parseSearchQuery(query: string): Uint8Array | null {
  if (!query.trim()) return null;

  // Try hex pattern (space-separated hex bytes, e.g. "48 65 6C" or "48656C")
  const hexClean = query.replace(/\s+/g, '');
  if (/^[0-9a-fA-F]+$/.test(hexClean) && hexClean.length % 2 === 0) {
    const bytes: number[] = [];
    for (let i = 0; i < hexClean.length; i += 2) {
      bytes.push(parseInt(hexClean.substring(i, i + 2), 16));
    }
    return new Uint8Array(bytes);
  }

  // Treat as ASCII string
  const encoder = new TextEncoder();
  return encoder.encode(query);
}

function findMatches(data: Uint8Array, pattern: Uint8Array): number[] {
  const matches: number[] = [];
  if (pattern.length === 0 || pattern.length > data.length) return matches;

  for (let i = 0; i <= data.length - pattern.length; i++) {
    let found = true;
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      matches.push(i);
      // Limit to 10000 matches to avoid performance issues
      if (matches.length >= 10000) break;
    }
  }
  return matches;
}

function useHexViewerViewport({
  scrollRef,
  content,
  matchOffsets,
  filePath,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  content: Uint8Array;
  matchOffsets: number[];
  filePath: string;
}): {
  goToMatch: (index: number) => void;
  openExternal: () => void;
  onScroll: () => void;
  totalRows: number;
  startRow: number;
  endRow: number;
} {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(600);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => { for (const entry of entries) setViewHeight(entry.contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);
  const goToMatch = useCallback((index: number) => {
    if (index < 0 || index >= matchOffsets.length) return;
    const row = Math.floor(matchOffsets[index] / BYTES_PER_ROW);
    scrollRef.current?.scrollTo({ top: Math.max(0, row * ROW_HEIGHT - viewHeight / 3), behavior: 'smooth' });
  }, [matchOffsets, scrollRef, viewHeight]);
  const openExternal = useCallback(() => { window.electronAPI.app.openExternal(`file:///${filePath.replace(/\\/g, '/').replace(/^\//, '')}`); }, [filePath]);
  const onScroll = useCallback(() => { if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop); }, [scrollRef]);
  return { goToMatch, openExternal, onScroll, totalRows: Math.ceil(content.length / BYTES_PER_ROW), startRow: Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2), endRow: Math.min(Math.ceil(content.length / BYTES_PER_ROW), Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + 2) };
}

function useHexViewerState(content: Uint8Array, filePath: string) {
  const [searchQuery, setSearchQuery] = useState('');
  const [matchOffsets, setMatchOffsets] = useState<number[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pattern = parseSearchQuery(searchQuery);
    if (!pattern) { setMatchOffsets([]); setActiveMatchIndex(-1); return; }
    const matches = findMatches(content, pattern);
    setMatchOffsets(matches);
    setActiveMatchIndex(matches.length > 0 ? 0 : -1);
  }, [content, searchQuery]);
  const matchedRows = useMemo(() => {
    const rows = new Set<number>();
    const pattern = parseSearchQuery(searchQuery);
    if (!pattern) return rows;
    for (const offset of matchOffsets) for (let r = Math.floor(offset / BYTES_PER_ROW); r <= Math.floor((offset + pattern.length - 1) / BYTES_PER_ROW); r++) rows.add(r);
    return rows;
  }, [matchOffsets, searchQuery]);
  const viewport = useHexViewerViewport({ scrollRef, content, matchOffsets, filePath });
  return { searchQuery, setSearchQuery, matchOffsets, activeMatchIndex, matchedRows, ...viewport, scrollRef };
}

function HexViewerToolbar({
  searchQuery,
  setSearchQuery,
  matchOffsets,
  activeMatchIndex,
  goToMatch,
  openExternal,
  contentLength,
}: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  matchOffsets: number[];
  activeMatchIndex: number;
  goToMatch: (index: number) => void;
  openExternal: () => void;
  contentLength: number;
}): React.ReactElement {
  return <div className="text-text-semantic-muted" style={toolbarStyle}>
    <span style={{ fontWeight: 600 }}>Hex</span>
    <span>{formatBytes(contentLength)}</span>
    <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-semantic)', margin: '0 4px' }} />
    <input type="text" placeholder="Search hex or ASCII..." className="text-text-semantic-primary" style={searchInputStyle} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
    {matchOffsets.length > 0 ? <><span>{activeMatchIndex + 1} / {matchOffsets.length}</span><button onClick={() => goToMatch(activeMatchIndex - 1)} className="text-text-semantic-muted" style={btnStyle} disabled={activeMatchIndex <= 0}>Prev</button><button onClick={() => goToMatch(activeMatchIndex + 1)} className="text-text-semantic-muted" style={btnStyle} disabled={activeMatchIndex >= matchOffsets.length - 1}>Next</button></> : null}
    {searchQuery && matchOffsets.length === 0 ? <span className="text-status-error">No matches</span> : null}
    <div style={{ flex: 1 }} />
    <button onClick={openExternal} className="text-text-semantic-muted" style={btnStyle} title="Open in external application">Open External</button>
  </div>;
}

function HexViewerRows({
  content,
  startRow,
  endRow,
  matchedRows,
}: {
  content: Uint8Array;
  startRow: number;
  endRow: number;
  matchedRows: Set<number>;
}): React.ReactElement {
  const rows: React.ReactElement[] = [];
  for (let row = startRow; row < endRow; row++) {
    const offset = row * BYTES_PER_ROW;
    const { hex, ascii } = buildHexRow(content, offset);
    rows.push(<div key={row} style={{ position: 'absolute', top: row * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 12px', backgroundColor: matchedRows.has(row) ? 'rgba(255, 200, 0, 0.15)' : undefined }}><span className="text-text-semantic-faint" style={{ width: OFFSET_WIDTH, flexShrink: 0 }}>{toOffset(offset)}</span><span className="text-text-semantic-primary" style={{ width: HEX_WIDTH, flexShrink: 0, whiteSpace: 'pre' }}>{hex}</span><span className="text-interactive-accent" style={{ width: ASCII_WIDTH, flexShrink: 0, whiteSpace: 'pre' }}>{ascii}</span></div>);
  }
  return <div style={{ height: endRow * ROW_HEIGHT, position: 'relative' }}>{rows}</div>;
}

export function HexViewer({ content, filePath }: HexViewerProps): React.ReactElement {
  const state = useHexViewerState(content, filePath);
  return <div style={rootStyle}><HexViewerToolbar searchQuery={state.searchQuery} setSearchQuery={state.setSearchQuery} matchOffsets={state.matchOffsets} activeMatchIndex={state.activeMatchIndex} goToMatch={state.goToMatch} openExternal={state.openExternal} contentLength={content.length} /><div className="text-text-semantic-faint" style={headerStyle}><span style={{ width: OFFSET_WIDTH, flexShrink: 0 }}>Offset</span><span style={{ width: HEX_WIDTH, flexShrink: 0 }}>00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span><span style={{ width: ASCII_WIDTH, flexShrink: 0 }}>ASCII</span></div><div ref={state.scrollRef} style={scrollContainerStyle} onScroll={state.onScroll}><HexViewerRows content={content} startRow={state.startRow} endRow={state.endRow} matchedRows={state.matchedRows} /></div></div>;
}
