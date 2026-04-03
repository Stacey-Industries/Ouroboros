import React, { memo } from 'react';

import type { CodeRow } from './codeViewTypes';

export interface CodeContentProps {
  rows: CodeRow[];
  lines: string[];
  shikiLines: string[] | null;
  wordWrap: boolean;
  showMinimap: boolean;
  lineCount: number;
  toggleFold: (startLine: number) => void;
  codeRef: React.RefObject<HTMLDivElement | null>;
}

interface CodeTextLayout {
  whiteSpace: string;
  wordBreak: 'break-all' | undefined;
}

/**
 * Code content area â€” renders syntax-highlighted or plain-text lines.
 */
export const CodeContent = memo(function CodeContent({
  rows,
  lines,
  shikiLines,
  wordWrap,
  showMinimap,
  lineCount,
  toggleFold,
  codeRef,
}: CodeContentProps): React.ReactElement {
  return (
    <div
      ref={codeRef as React.RefObject<HTMLDivElement | null>}
      className="selectable"
      style={getCodeContentStyle(showMinimap, lineCount)}
    >
      <CodeRows
        rows={rows}
        lines={lines}
        shikiLines={shikiLines}
        textLayout={getCodeTextLayout(wordWrap)}
        toggleFold={toggleFold}
      />
    </div>
  );
});

interface CodeRowsProps {
  rows: CodeRow[];
  lines: string[];
  shikiLines: string[] | null;
  textLayout: CodeTextLayout;
  toggleFold: (startLine: number) => void;
}

function CodeRows({
  rows,
  lines,
  shikiLines,
  textLayout,
  toggleFold,
}: CodeRowsProps): React.ReactElement {
  return (
    <>
      {rows.map((row) =>
        renderCodeRow({ row, lines, shikiLines, textLayout, toggleFold })
      )}
    </>
  );
}

function renderCodeRow({
  row,
  lines,
  shikiLines,
  textLayout,
  toggleFold,
}: Omit<CodeRowsProps, 'rows'> & { row: CodeRow }): React.ReactElement {
  if (row.type === 'fold-placeholder') {
    return (
      <FoldPlaceholder
        key={`code-fp-${row.startLine}`}
        startLine={row.startLine}
        count={row.count}
        toggleFold={toggleFold}
      />
    );
  }

  return (
    <CodeLine
      key={`code-${row.index}`}
      index={row.index}
      lineHtml={shikiLines ? (shikiLines[row.index] ?? '') : null}
      plainText={lines[row.index]}
      whiteSpace={textLayout.whiteSpace}
      wordBreak={textLayout.wordBreak}
    />
  );
}

function getCodeTextLayout(wordWrap: boolean): CodeTextLayout {
  return {
    whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
    wordBreak: wordWrap ? 'break-all' : undefined,
  };
}

function getCodeContentStyle(
  showMinimap: boolean,
  lineCount: number
): React.CSSProperties {
  return {
    flex: 1,
    padding: '16px 16px 16px 12px',
    paddingRight: showMinimap && lineCount >= 50 ? '86px' : '16px',
    minWidth: 0,
  };
}

interface FoldPlaceholderProps {
  startLine: number;
  count: number;
  toggleFold: (startLine: number) => void;
}

function FoldPlaceholder({
  startLine,
  count,
  toggleFold,
}: FoldPlaceholderProps): React.ReactElement {
  return (
    <div style={{ height: '1.6em', lineHeight: '1.6em', userSelect: 'none' }}>
      <span
        className="text-text-semantic-faint"
        style={{
          fontStyle: 'italic',
          backgroundColor: 'var(--surface-panel)',
          borderRadius: '3px',
          paddingLeft: '8px',
          paddingRight: '8px',
          cursor: 'pointer',
          fontSize: '0.75rem',
        }}
        onClick={() => toggleFold(startLine)}
        title={`Click to expand ${count} lines`}
      >
        {'\u22EF'} {count} lines folded
      </span>
    </div>
  );
}

interface CodeLineProps {
  index: number;
  lineHtml: string | null;
  plainText: string;
  whiteSpace: string;
  wordBreak: 'break-all' | undefined;
}

function CodeLine({
  index,
  lineHtml,
  plainText,
  whiteSpace,
  wordBreak,
}: CodeLineProps): React.ReactElement {
  const style: React.CSSProperties = {
    minHeight: '1.6em',
    whiteSpace: whiteSpace as React.CSSProperties['whiteSpace'],
    wordBreak,
  };

  if (lineHtml !== null) {
    return (
      <div
        className="code-line"
        data-line={index}
        style={style}
        dangerouslySetInnerHTML={{ __html: lineHtml }}
      />
    );
  }

  return (
    <div
      className="code-line text-text-semantic-primary"
      data-line={index}
      style={style}
    >
      {plainText}
    </div>
  );
}
