import React, { useMemo, memo } from 'react';

// ─── Diff algorithm ──────────────────────────────────────────────────────────

export type DiffLineType = 'unchanged' | 'added' | 'removed';

export interface DiffLine {
  type: DiffLineType;
  /** Line number in the old file (null for added lines) */
  oldLineNo: number | null;
  /** Line number in the new file (null for removed lines) */
  newLineNo: number | null;
  /** The text content of the line */
  text: string;
}

/**
 * Compute the longest common subsequence (LCS) table for two arrays of lines.
 * Returns a 2D array where lcs[i][j] = length of LCS of oldLines[0..i-1] and newLines[0..j-1].
 */
function computeLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;

  // Use two rows instead of full matrix for memory efficiency
  const table: number[][] = [];
  for (let i = 0; i <= m; i++) {
    table[i] = new Array(n + 1).fill(0);
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  return table;
}

/**
 * Compute a unified diff from two strings using LCS-based diffing.
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const table = computeLcsTable(oldLines, newLines);
  const result: DiffLine[] = [];

  // Backtrack through the LCS table to build the diff
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({
        type: 'unchanged',
        oldLineNo: i,
        newLineNo: j,
        text: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      result.push({
        type: 'added',
        oldLineNo: null,
        newLineNo: j,
        text: newLines[j - 1],
      });
      j--;
    } else {
      result.push({
        type: 'removed',
        oldLineNo: i,
        newLineNo: null,
        text: oldLines[i - 1],
      });
      i--;
    }
  }

  result.reverse();
  return result;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface DiffViewProps {
  /** Original file content (before changes) */
  originalContent: string;
  /** Current file content (after changes) */
  currentContent: string;
}

/**
 * DiffView — inline diff viewer that shows added, removed, and unchanged lines
 * with color-coded backgrounds and dual line-number gutters.
 */
export const DiffView = memo(function DiffView({
  originalContent,
  currentContent,
}: DiffViewProps): React.ReactElement {
  const diffLines = useMemo(
    () => computeDiff(originalContent, currentContent),
    [originalContent, currentContent],
  );

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.type === 'added') added++;
      else if (line.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  // Calculate gutter widths based on max line numbers
  const maxOldLine = diffLines.reduce((max, l) => Math.max(max, l.oldLineNo ?? 0), 0);
  const maxNewLine = diffLines.reduce((max, l) => Math.max(max, l.newLineNo ?? 0), 0);
  const oldGutterWidth = Math.max(3, String(maxOldLine).length) * 9 + 12;
  const newGutterWidth = Math.max(3, String(maxNewLine).length) * 9 + 12;

  const hasChanges = stats.added > 0 || stats.removed > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg)',
      }}
    >
      {/* Diff stats header */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border-muted)',
          backgroundColor: 'var(--bg-secondary)',
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
          userSelect: 'none',
        }}
      >
        {hasChanges ? (
          <>
            <span style={{ color: 'var(--success, #4CAF50)' }}>+{stats.added}</span>
            <span style={{ color: 'var(--error, #f85149)' }}>-{stats.removed}</span>
            <span>{diffLines.length} lines</span>
          </>
        ) : (
          <span>No changes detected</span>
        )}
      </div>

      {/* Diff content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          lineHeight: '1.6',
        }}
      >
        <div style={{ minWidth: 'max-content' }}>
          {diffLines.map((line, index) => (
            <DiffLineRow
              key={index}
              line={line}
              oldGutterWidth={oldGutterWidth}
              newGutterWidth={newGutterWidth}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

// ─── Diff line row ───────────────────────────────────────────────────────────

interface DiffLineRowProps {
  line: DiffLine;
  oldGutterWidth: number;
  newGutterWidth: number;
}

function lineBackground(type: DiffLineType): string {
  switch (type) {
    case 'added':
      return 'rgba(80, 200, 80, 0.12)';
    case 'removed':
      return 'rgba(255, 80, 80, 0.12)';
    default:
      return 'transparent';
  }
}

function gutterMarkerColor(type: DiffLineType): string {
  switch (type) {
    case 'added':
      return 'var(--success, #4CAF50)';
    case 'removed':
      return 'var(--error, #f85149)';
    default:
      return 'var(--text-faint)';
  }
}

function gutterBackground(type: DiffLineType): string {
  switch (type) {
    case 'added':
      return 'rgba(80, 200, 80, 0.18)';
    case 'removed':
      return 'rgba(255, 80, 80, 0.18)';
    default:
      return 'var(--bg)';
  }
}

function lineMarker(type: DiffLineType): string {
  switch (type) {
    case 'added':
      return '+';
    case 'removed':
      return '-';
    default:
      return ' ';
  }
}

const DiffLineRow = memo(function DiffLineRow({
  line,
  oldGutterWidth,
  newGutterWidth,
}: DiffLineRowProps): React.ReactElement {
  const bg = lineBackground(line.type);
  const gutterBg = gutterBackground(line.type);
  const markerColor = gutterMarkerColor(line.type);

  return (
    <div
      style={{
        display: 'flex',
        backgroundColor: bg,
        minHeight: '1.6em',
      }}
    >
      {/* Old line number gutter */}
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: `${oldGutterWidth}px`,
          textAlign: 'right',
          paddingRight: '4px',
          color: markerColor,
          backgroundColor: gutterBg,
          userSelect: 'none',
          opacity: line.oldLineNo !== null ? 1 : 0.3,
        }}
      >
        {line.oldLineNo ?? ''}
      </div>

      {/* New line number gutter */}
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: `${newGutterWidth}px`,
          textAlign: 'right',
          paddingRight: '4px',
          color: markerColor,
          backgroundColor: gutterBg,
          userSelect: 'none',
          opacity: line.newLineNo !== null ? 1 : 0.3,
        }}
      >
        {line.newLineNo ?? ''}
      </div>

      {/* Change marker (+/-/space) */}
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: '20px',
          textAlign: 'center',
          color: markerColor,
          backgroundColor: gutterBg,
          userSelect: 'none',
          fontWeight: 600,
          borderRight: '1px solid var(--border-muted)',
        }}
      >
        {lineMarker(line.type)}
      </div>

      {/* Line content */}
      <pre
        style={{
          flex: 1,
          margin: 0,
          padding: '0 12px',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          whiteSpace: 'pre',
          color: 'var(--text)',
          overflowX: 'visible',
        }}
      >
        {line.text}
      </pre>
    </div>
  );
});
