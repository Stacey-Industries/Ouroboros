import React, { memo, useCallback } from 'react';
import type { RefObject } from 'react';
import { SearchBar } from './SearchBar';
import { GoToLine } from './GoToLine';
import { Minimap } from './Minimap';
import { SemanticScrollbar } from './SemanticScrollbar';
import { BlameGutter } from './BlameGutter';
import { LineNumberGutter } from './LineNumberGutter';
import { FoldGutter } from './FoldGutter';
import { DiffGutter } from './DiffGutter';
import { CodeContent } from './CodeContent';
import type { FoldRange } from './useFoldRanges';
import type { DiffLineInfo } from '../../types/electron';
import type { CodeRow } from './codeViewTypes';
import type { ScrollMetrics } from './useScrollMetrics';

export interface CodeViewProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  codeRef: RefObject<HTMLDivElement | null>;
  lines: string[];
  lineCount: number;
  rows: CodeRow[];
  shikiLines: string[] | null;
  wordWrap: boolean;
  showMinimap: boolean;
  showSearch: boolean;
  setShowSearch: (v: boolean) => void;
  showGoToLine: boolean;
  setShowGoToLine: (v: boolean) => void;
  searchMatchLines: number[];
  setSearchMatchLines: (lines: number[]) => void;
  scrollMetrics: ScrollMetrics;
  diffLines: DiffLineInfo[];
  diffMap: Map<number, DiffLineInfo['kind']>;
  collapsedFolds: Set<number>;
  foldableLines: Map<number, FoldRange>;
  toggleFold: (startLine: number) => void;
  showBlame: boolean;
  blameLines: Array<{ line: number; hash: string; author: string; date: string; summary: string }>;
  gutterWidth: number;
  foldGutterWidth: number;
  diffGutterWidth: number;
}

const scrollContainerStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  position: 'relative',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
  lineHeight: '1.6',
};

/**
 * The main code view area with gutters, overlays, and syntax-highlighted content.
 */
export const CodeView = memo(function CodeView(props: CodeViewProps): React.ReactElement {
  const lineHeight = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  ) * 1.6;

  const handleScrollToLine = useCallback(
    (line: number) => {
      const el = props.scrollRef.current;
      if (!el) return;
      const targetY = (line - 1) * lineHeight + 16;
      el.scrollTo({ top: targetY - el.clientHeight / 2, behavior: 'smooth' });
    },
    [props.scrollRef, lineHeight]
  );

  return (
    <div ref={props.scrollRef} style={scrollContainerStyle}>
      <SearchBar
        codeContainer={props.codeRef.current}
        scrollContainer={props.scrollRef.current}
        visible={props.showSearch}
        onClose={() => props.setShowSearch(false)}
        onMatchLinesChange={props.setSearchMatchLines}
      />
      <GoToLine
        lineCount={props.lineCount}
        scrollContainer={props.scrollRef.current}
        codeContainer={props.codeRef.current}
        visible={props.showGoToLine}
        onClose={() => props.setShowGoToLine(false)}
      />
      {props.lineCount >= 50 && (
        <Minimap
          lines={props.lines}
          scrollContainer={props.scrollRef.current}
          visible={props.showMinimap}
        />
      )}
      <SemanticScrollbar
        totalLines={props.lineCount}
        scrollTop={props.scrollMetrics.scrollTop}
        containerHeight={props.scrollMetrics.containerHeight}
        scrollHeight={props.scrollMetrics.scrollHeight}
        lineHeight={lineHeight}
        searchMatchLines={props.searchMatchLines}
        diffLines={props.diffLines}
        foldedLines={[...props.collapsedFolds]}
        onScrollToLine={handleScrollToLine}
      />
      <div style={{ display: 'flex', minWidth: props.wordWrap ? undefined : 'max-content' }}>
        <LineNumberGutter rows={props.rows} gutterWidth={props.gutterWidth} />
        <FoldGutter
          rows={props.rows}
          gutterWidth={props.gutterWidth}
          foldGutterWidth={props.foldGutterWidth}
          foldableLines={props.foldableLines}
          collapsedFolds={props.collapsedFolds}
          toggleFold={props.toggleFold}
        />
        <DiffGutter
          rows={props.rows}
          diffMap={props.diffMap}
          gutterWidth={props.gutterWidth}
          foldGutterWidth={props.foldGutterWidth}
          diffGutterWidth={props.diffGutterWidth}
        />
        {props.showBlame && props.blameLines.length > 0 && (
          <BlameGutter blameLines={props.blameLines} rows={props.rows} />
        )}
        <CodeContent
          rows={props.rows}
          lines={props.lines}
          shikiLines={props.shikiLines}
          wordWrap={props.wordWrap}
          showMinimap={props.showMinimap}
          lineCount={props.lineCount}
          toggleFold={props.toggleFold}
          codeRef={props.codeRef}
        />
      </div>
    </div>
  );
});
