import React from 'react';

import { formatBytes } from './ImageViewer.parts';

export const BYTES_PER_ROW = 16;
export const ROW_HEIGHT = 20;
export const OFFSET_WIDTH = 80;
export const HEX_WIDTH = 430;
export const ASCII_WIDTH = 160;

export const btnStyle: React.CSSProperties = {
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

export const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
};

export const searchInputStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-mono)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  backgroundColor: 'var(--surface-base)',
  width: '200px',
};

export function toHex2(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

export function toOffset(offset: number): string {
  return offset.toString(16).toUpperCase().padStart(8, '0');
}

export function isPrintable(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

export function buildHexRow(data: Uint8Array, offset: number): { hex: string; ascii: string } {
  const end = Math.min(offset + BYTES_PER_ROW, data.length);
  const hexParts: string[] = [];
  const asciiParts: string[] = [];
  for (let i = offset; i < end; i++) {
    const b = data[i];
    hexParts.push(toHex2(b));
    asciiParts.push(isPrintable(b) ? String.fromCharCode(b) : '.');
    if (i - offset === 7) hexParts.push('');
  }
  const remaining = BYTES_PER_ROW - (end - offset);
  for (let i = 0; i < remaining; i++) {
    hexParts.push('  ');
    asciiParts.push(' ');
    if (end - offset + i === 7) hexParts.push('');
  }
  return { hex: hexParts.join(' '), ascii: asciiParts.join('') };
}

export function parseSearchQuery(query: string): Uint8Array | null {
  if (!query.trim()) return null;
  const hexClean = query.replace(/\s+/g, '');
  if (/^[0-9a-fA-F]+$/.test(hexClean) && hexClean.length % 2 === 0) {
    const bytes: number[] = [];
    for (let i = 0; i < hexClean.length; i += 2)
      bytes.push(parseInt(hexClean.substring(i, i + 2), 16));
    return new Uint8Array(bytes);
  }
  return new TextEncoder().encode(query);
}

export function findMatches(data: Uint8Array, pattern: Uint8Array): number[] {
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
      if (matches.length >= 10000) break;
    }
  }
  return matches;
}

function HexToolbarSearch({
  searchQuery,
  setSearchQuery,
  matchOffsets,
  activeMatchIndex,
  goToMatch,
}: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  matchOffsets: number[];
  activeMatchIndex: number;
  goToMatch: (index: number) => void;
}): React.ReactElement {
  return (
    <>
      <input
        type="text"
        placeholder="Search hex or ASCII..."
        className="text-text-semantic-primary"
        style={searchInputStyle}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {matchOffsets.length > 0 ? (
        <>
          <span>
            {activeMatchIndex + 1} / {matchOffsets.length}
          </span>
          <button
            onClick={() => goToMatch(activeMatchIndex - 1)}
            className="text-text-semantic-muted"
            style={btnStyle}
            disabled={activeMatchIndex <= 0}
          >
            Prev
          </button>
          <button
            onClick={() => goToMatch(activeMatchIndex + 1)}
            className="text-text-semantic-muted"
            style={btnStyle}
            disabled={activeMatchIndex >= matchOffsets.length - 1}
          >
            Next
          </button>
        </>
      ) : null}
      {searchQuery && matchOffsets.length === 0 ? (
        <span className="text-status-error">No matches</span>
      ) : null}
    </>
  );
}

export function HexViewerToolbar({
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
  return (
    <div className="text-text-semantic-muted" style={toolbarStyle}>
      <span style={{ fontWeight: 600 }}>Hex</span>
      <span>{formatBytes(contentLength)}</span>
      <div
        style={{ width: 1, height: 16, backgroundColor: 'var(--border-semantic)', margin: '0 4px' }}
      />
      <HexToolbarSearch
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        matchOffsets={matchOffsets}
        activeMatchIndex={activeMatchIndex}
        goToMatch={goToMatch}
      />
      <div style={{ flex: 1 }} />
      <button
        onClick={openExternal}
        className="text-text-semantic-muted"
        style={btnStyle}
        title="Open in external application"
      >
        Open External
      </button>
    </div>
  );
}

export function HexViewerRows({
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
    rows.push(
      <div
        key={row}
        style={{
          position: 'absolute',
          top: row * ROW_HEIGHT,
          left: 0,
          right: 0,
          height: ROW_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          backgroundColor: matchedRows.has(row) ? 'rgba(255, 200, 0, 0.15)' : undefined,
        }}
      >
        <span className="text-text-semantic-faint" style={{ width: OFFSET_WIDTH, flexShrink: 0 }}>
          {toOffset(offset)}
        </span>
        <span
          className="text-text-semantic-primary"
          style={{ width: HEX_WIDTH, flexShrink: 0, whiteSpace: 'pre' }}
        >
          {hex}
        </span>
        <span
          className="text-interactive-accent"
          style={{ width: ASCII_WIDTH, flexShrink: 0, whiteSpace: 'pre' }}
        >
          {ascii}
        </span>
      </div>,
    );
  }
  return <div style={{ height: endRow * ROW_HEIGHT, position: 'relative' }}>{rows}</div>;
}
