import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ASCII_WIDTH,
  BYTES_PER_ROW,
  findMatches,
  HEX_WIDTH,
  HexViewerRows,
  HexViewerToolbar,
  OFFSET_WIDTH,
  parseSearchQuery,
  ROW_HEIGHT,
} from './HexViewer.parts';

export interface HexViewerProps {
  content: Uint8Array;
  filePath: string;
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--surface-base)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
};

const headerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  padding: '4px 12px',
  borderBottom: '1px solid var(--border-subtle)',
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

function useHexViewerViewportSize(scrollRef: React.RefObject<HTMLDivElement | null>): {
  viewHeight: number;
  scrollTop: number;
  onScroll: () => void;
} {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(600);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setViewHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);
  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, [scrollRef]);
  return { viewHeight, scrollTop, onScroll };
}

function useHexViewerNavigation(
  matchOffsets: number[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
  viewHeight: number,
  filePath: string,
): { goToMatch: (index: number) => void; openExternal: () => void } {
  const goToMatch = useCallback(
    (index: number) => {
      if (index < 0 || index >= matchOffsets.length) return;
      const row = Math.floor(matchOffsets[index] / BYTES_PER_ROW);
      scrollRef.current?.scrollTo({
        top: Math.max(0, row * ROW_HEIGHT - viewHeight / 3),
        behavior: 'smooth',
      });
    },
    [matchOffsets, scrollRef, viewHeight],
  );
  const openExternal = useCallback(() => {
    window.electronAPI.app.openExternal(
      `file:///${filePath.replace(/\\/g, '/').replace(/^\//, '')}`,
    );
  }, [filePath]);
  return { goToMatch, openExternal };
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
  const { viewHeight, scrollTop, onScroll } = useHexViewerViewportSize(scrollRef);
  const { goToMatch, openExternal } = useHexViewerNavigation(
    matchOffsets,
    scrollRef,
    viewHeight,
    filePath,
  );
  const totalRows = Math.ceil(content.length / BYTES_PER_ROW);
  return {
    goToMatch,
    openExternal,
    onScroll,
    totalRows,
    startRow: Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2),
    endRow: Math.min(totalRows, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + 2),
  };
}

function useHexViewerState(content: Uint8Array, filePath: string) {
  const [searchQuery, setSearchQuery] = useState('');
  const [matchOffsets, setMatchOffsets] = useState<number[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pattern = parseSearchQuery(searchQuery);
    if (!pattern) {
      setMatchOffsets([]);
      setActiveMatchIndex(-1);
      return;
    }
    const matches = findMatches(content, pattern);
    setMatchOffsets(matches);
    setActiveMatchIndex(matches.length > 0 ? 0 : -1);
  }, [content, searchQuery]);
  const matchedRows = useMemo(() => {
    const rows = new Set<number>();
    const pattern = parseSearchQuery(searchQuery);
    if (!pattern) return rows;
    for (const offset of matchOffsets)
      for (
        let r = Math.floor(offset / BYTES_PER_ROW);
        r <= Math.floor((offset + pattern.length - 1) / BYTES_PER_ROW);
        r++
      )
        rows.add(r);
    return rows;
  }, [matchOffsets, searchQuery]);
  const viewport = useHexViewerViewport({ scrollRef, content, matchOffsets, filePath });
  return {
    searchQuery,
    setSearchQuery,
    matchOffsets,
    activeMatchIndex,
    matchedRows,
    ...viewport,
    scrollRef,
  };
}

export function HexViewer({ content, filePath }: HexViewerProps): React.ReactElement<any> {
  const state = useHexViewerState(content, filePath);
  return (
    <div style={rootStyle}>
      <HexViewerToolbar
        searchQuery={state.searchQuery}
        setSearchQuery={state.setSearchQuery}
        matchOffsets={state.matchOffsets}
        activeMatchIndex={state.activeMatchIndex}
        goToMatch={state.goToMatch}
        openExternal={state.openExternal}
        contentLength={content.length}
      />
      <div className="text-text-semantic-faint" style={headerStyle}>
        <span style={{ width: OFFSET_WIDTH, flexShrink: 0 }}>Offset</span>
        <span style={{ width: HEX_WIDTH, flexShrink: 0 }}>
          00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F
        </span>
        <span style={{ width: ASCII_WIDTH, flexShrink: 0 }}>ASCII</span>
      </div>
      <div ref={state.scrollRef} style={scrollContainerStyle} onScroll={state.onScroll}>
        <HexViewerRows
          content={content}
          startRow={state.startRow}
          endRow={state.endRow}
          matchedRows={state.matchedRows}
        />
      </div>
    </div>
  );
}
