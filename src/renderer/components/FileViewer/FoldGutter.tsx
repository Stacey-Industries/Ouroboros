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

const FOLD_GUTTER_LINE_STYLE: React.CSSProperties = {
  height: '1.6em',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const FOLD_PLACEHOLDER_STYLE: React.CSSProperties = { height: '1.6em' };

const FOLD_BUTTON_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  fontSize: '0.625rem',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  borderRadius: '2px',
};

function getFoldGutterStyle(
  foldGutterWidth: number,
  gutterWidth: number
): React.CSSProperties {
  return {
    flexShrink: 0,
    width: `${foldGutterWidth}px`,
    paddingTop: '16px',
    paddingBottom: '16px',
    backgroundColor: 'var(--surface-base)',
    position: 'sticky',
    left: `${gutterWidth}px`,
    zIndex: 2,
    userSelect: 'none',
  };
}

function handleFoldButtonMouseOver(
  event: React.MouseEvent<HTMLButtonElement>
): void {
  event.currentTarget.style.backgroundColor = 'var(--border-muted)';
}

function handleFoldButtonMouseOut(
  event: React.MouseEvent<HTMLButtonElement>
): void {
  event.currentTarget.style.backgroundColor = 'transparent';
}

interface FoldGutterRowContext {
  collapsedFolds: Set<number>;
  foldableLines: Map<number, FoldRange>;
  gutterHover: boolean;
  toggleFold: (startLine: number) => void;
}

function renderFoldGutterRow(
  row: CodeRow,
  context: FoldGutterRowContext
): React.ReactElement {
  if (row.type === 'fold-placeholder') {
    return <div key={`fg-fp-${row.startLine}`} style={FOLD_PLACEHOLDER_STYLE} />;
  }

  return (
    <FoldGutterLine
      key={`fg-${row.index}`}
      index={row.index}
      foldableLines={context.foldableLines}
      collapsedFolds={context.collapsedFolds}
      gutterHover={context.gutterHover}
      toggleFold={context.toggleFold}
    />
  );
}

export const FoldGutter = memo(function FoldGutter({
  rows,
  gutterWidth,
  foldGutterWidth,
  foldableLines,
  collapsedFolds,
  toggleFold,
}: FoldGutterProps): React.ReactElement {
  const [hover, setHover] = useState(false);
  const rowContext = {
    collapsedFolds,
    foldableLines,
    gutterHover: hover,
    toggleFold,
  };

  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={getFoldGutterStyle(foldGutterWidth, gutterWidth)}
    >
      {rows.map((row) => renderFoldGutterRow(row, rowContext))}
    </div>
  );
});

interface FoldGutterLineProps {
  index: number;
  foldableLines: Map<number, FoldRange>;
  collapsedFolds: Set<number>;
  gutterHover: boolean;
  toggleFold: (startLine: number) => void;
}

interface FoldToggleButtonProps {
  index: number;
  isCollapsed: boolean;
  toggleFold: (startLine: number) => void;
}

function FoldToggleButton({
  index,
  isCollapsed,
  toggleFold,
}: FoldToggleButtonProps): React.ReactElement {
  return (
    <button
      onClick={() => toggleFold(index)}
      title={isCollapsed ? 'Expand' : 'Collapse'}
      style={{
        ...FOLD_BUTTON_STYLE,
        color: isCollapsed ? 'var(--text-muted)' : 'var(--text-faint)',
      }}
      onMouseOver={handleFoldButtonMouseOver}
      onMouseOut={handleFoldButtonMouseOut}
    >
      {isCollapsed ? '\u25B6' : '\u25BC'}
    </button>
  );
}

function FoldGutterLine({
  index,
  foldableLines,
  collapsedFolds,
  gutterHover,
  toggleFold,
}: FoldGutterLineProps): React.ReactElement {
  const isCollapsed = collapsedFolds.has(index);
  const showIndicator = foldableLines.has(index) && (isCollapsed || gutterHover);

  return (
    <div style={FOLD_GUTTER_LINE_STYLE}>
      {showIndicator ? (
        <FoldToggleButton
          index={index}
          isCollapsed={isCollapsed}
          toggleFold={toggleFold}
        />
      ) : null}
    </div>
  );
}
