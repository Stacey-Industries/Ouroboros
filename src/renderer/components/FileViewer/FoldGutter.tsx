import React, { memo, useState } from 'react';
import type { FoldRange } from './useFoldRanges';
import type { CodeRow } from './codeViewTypes';

export interface FoldGutterProps {
  rows: CodeRow[];
  gutterWidth: number;
  foldGutterWidth: number;
  foldableLines: Map<number, FoldRange>;
  collapsedFolds: Set<number>;
  toggleFold: (startLine: number) => void;
}

/**
 * Fold gutter — shows collapse/expand indicators for foldable regions.
 */
export const FoldGutter = memo(function FoldGutter({
  rows,
  gutterWidth,
  foldGutterWidth,
  foldableLines,
  collapsedFolds,
  toggleFold,
}: FoldGutterProps): React.ReactElement {
  const [hover, setHover] = useState(false);

  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        width: `${foldGutterWidth}px`,
        paddingTop: '16px',
        paddingBottom: '16px',
        backgroundColor: 'var(--bg)',
        position: 'sticky',
        left: `${gutterWidth}px`,
        zIndex: 2,
        userSelect: 'none',
      }}
    >
      {rows.map((row) => {
        if (row.type === 'fold-placeholder') {
          return <div key={`fg-fp-${row.startLine}`} style={{ height: '1.6em' }} />;
        }
        return (
          <FoldGutterLine
            key={`fg-${row.index}`}
            index={row.index}
            foldableLines={foldableLines}
            collapsedFolds={collapsedFolds}
            gutterHover={hover}
            toggleFold={toggleFold}
          />
        );
      })}
    </div>
  );
});

// ── Individual fold gutter line ──

interface FoldGutterLineProps {
  index: number;
  foldableLines: Map<number, FoldRange>;
  collapsedFolds: Set<number>;
  gutterHover: boolean;
  toggleFold: (startLine: number) => void;
}

function FoldGutterLine({
  index,
  foldableLines,
  collapsedFolds,
  gutterHover,
  toggleFold,
}: FoldGutterLineProps): React.ReactElement {
  const foldRange = foldableLines.get(index);
  const isCollapsed = collapsedFolds.has(index);
  const showIndicator = !!foldRange && (isCollapsed || gutterHover);

  return (
    <div
      style={{
        height: '1.6em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {showIndicator && (
        <button
          onClick={() => toggleFold(index)}
          title={isCollapsed ? 'Expand' : 'Collapse'}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            color: isCollapsed ? 'var(--text-muted)' : 'var(--text-faint)',
            fontSize: '0.625rem',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '2px',
          }}
          onMouseOver={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--border-muted)';
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'transparent';
          }}
        >
          {isCollapsed ? '\u25B6' : '\u25BC'}
        </button>
      )}
    </div>
  );
}
