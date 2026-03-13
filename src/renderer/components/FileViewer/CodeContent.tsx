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

/**
 * Code content area — renders syntax-highlighted or plain-text lines.
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
  const whiteSpace = wordWrap ? 'pre-wrap' : 'pre';
  const wordBreak = wordWrap ? 'break-all' as const : undefined;
  const paddingRight = showMinimap && lineCount >= 50 ? '86px' : '16px';

  return (
    <div
      ref={codeRef}
      className="selectable"
      style={{
        flex: 1,
        padding: '16px 16px 16px 12px',
        paddingRight,
        minWidth: 0,
      }}
    >
      {rows.map((row) => {
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
            whiteSpace={whiteSpace}
            wordBreak={wordBreak}
          />
        );
      })}
    </div>
  );
});

// ── Fold placeholder ──

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
        style={{
          color: 'var(--text-faint)',
          fontStyle: 'italic',
          backgroundColor: 'var(--bg-secondary)',
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

// ── Single code line ──

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
      className="code-line"
      data-line={index}
      style={{ ...style, color: 'var(--text)' }}
    >
      {plainText}
    </div>
  );
}
