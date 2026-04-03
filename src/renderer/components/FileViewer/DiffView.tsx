import React, { memo, useMemo } from 'react';

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

export interface DiffViewProps {
  /** Original file content (before changes) */
  originalContent: string;
  /** Current file content (after changes) */
  currentContent: string;
}

interface DiffStats {
  added: number;
  removed: number;
  hasChanges: boolean;
}

interface DiffGutterWidths {
  oldLineWidth: number;
  newLineWidth: number;
}

interface DiffStatsHeaderProps {
  stats: DiffStats;
  lineCount: number;
}

interface DiffLinesListProps {
  diffLines: DiffLine[];
  gutterWidths: DiffGutterWidths;
}

interface DiffVisuals {
  backgroundColor: string;
  gutterBackground: string;
  marker: string;
  markerColor: string;
}

interface DiffLineRowProps {
  line: DiffLine;
  oldGutterWidth: number;
  newGutterWidth: number;
}

interface DiffLineNumberCellProps {
  width: number;
  value: number | null;
  visuals: DiffVisuals;
}

interface DiffMarkerCellProps {
  marker: string;
  visuals: DiffVisuals;
}

const DIFF_VIEW_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--surface-base)',
};

const DIFF_HEADER_STYLE: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '6px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  fontSize: '0.8125rem',
  userSelect: 'none',
};

const DIFF_CONTENT_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
  lineHeight: '1.6',
};

const DIFF_LIST_STYLE: React.CSSProperties = {
  minWidth: 'max-content',
};

const DIFF_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  minHeight: '1.6em',
};

const DIFF_LINE_NUMBER_STYLE: React.CSSProperties = {
  flexShrink: 0,
  textAlign: 'right',
  paddingRight: '4px',
  userSelect: 'none',
};

const DIFF_MARKER_STYLE: React.CSSProperties = {
  flexShrink: 0,
  width: '20px',
  textAlign: 'center',
  userSelect: 'none',
  fontWeight: 600,
  borderRight: '1px solid var(--border-subtle)',
};

const DIFF_CONTENT_CELL_STYLE: React.CSSProperties = {
  flex: 1,
  margin: 0,
  padding: '0 12px',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  whiteSpace: 'pre',
  overflowX: 'visible',
};

function computeLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
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

export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const table = computeLcsTable(oldLines, newLines);
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'unchanged', oldLineNo: i, newLineNo: j, text: oldLines[i - 1] });
      i--;
      j--;
      continue;
    }
    if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      result.push({ type: 'added', oldLineNo: null, newLineNo: j, text: newLines[j - 1] });
      j--;
      continue;
    }
    result.push({ type: 'removed', oldLineNo: i, newLineNo: null, text: oldLines[i - 1] });
    i--;
  }

  result.reverse();
  return result;
}

function summarizeDiff(diffLines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const line of diffLines) {
    if (line.type === 'added') added++;
    if (line.type === 'removed') removed++;
  }
  return { added, removed, hasChanges: added > 0 || removed > 0 };
}

function measureDiffGutters(diffLines: DiffLine[]): DiffGutterWidths {
  const maxOldLine = diffLines.reduce((max, line) => Math.max(max, line.oldLineNo ?? 0), 0);
  const maxNewLine = diffLines.reduce((max, line) => Math.max(max, line.newLineNo ?? 0), 0);
  return {
    oldLineWidth: Math.max(3, String(maxOldLine).length) * 9 + 12,
    newLineWidth: Math.max(3, String(maxNewLine).length) * 9 + 12,
  };
}

function getDiffVisuals(type: DiffLineType): DiffVisuals {
  if (type === 'added') {
    return {
      backgroundColor: 'rgba(80, 200, 80, 0.12)',
      gutterBackground: 'rgba(80, 200, 80, 0.18)',
      marker: '+',
      markerColor: 'var(--success, #4CAF50)',
    };
  }
  if (type === 'removed') {
    return {
      backgroundColor: 'rgba(255, 80, 80, 0.12)',
      gutterBackground: 'rgba(255, 80, 80, 0.18)',
      marker: '-',
      markerColor: 'var(--status-error)',
    };
  }
  return {
    backgroundColor: 'transparent',
    gutterBackground: 'var(--surface-base)',
    marker: ' ',
    markerColor: 'var(--text-faint)',
  };
}

function DiffStatsHeader({ stats, lineCount }: DiffStatsHeaderProps): React.ReactElement {
  if (!stats.hasChanges) {
    return (
      <div className="text-text-semantic-muted" style={DIFF_HEADER_STYLE}>
        <span>No changes detected</span>
      </div>
    );
  }

  return (
    <div className="text-text-semantic-muted" style={DIFF_HEADER_STYLE}>
      <span className="text-status-success">+{stats.added}</span>
      <span className="text-status-error">-{stats.removed}</span>
      <span>{lineCount} lines</span>
    </div>
  );
}

function DiffLinesList({ diffLines, gutterWidths }: DiffLinesListProps): React.ReactElement {
  return (
    <div style={DIFF_CONTENT_STYLE}>
      <div style={DIFF_LIST_STYLE}>
        {diffLines.map((line, index) => (
          <DiffLineRow
            key={index}
            line={line}
            oldGutterWidth={gutterWidths.oldLineWidth}
            newGutterWidth={gutterWidths.newLineWidth}
          />
        ))}
      </div>
    </div>
  );
}

function DiffLineNumberCell({
  width,
  value,
  visuals,
}: DiffLineNumberCellProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        ...DIFF_LINE_NUMBER_STYLE,
        width: `${width}px`,
        color: visuals.markerColor,
        backgroundColor: visuals.gutterBackground,
        opacity: value !== null ? 1 : 0.3,
      }}
    >
      {value ?? ''}
    </div>
  );
}

function DiffMarkerCell({ marker, visuals }: DiffMarkerCellProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        ...DIFF_MARKER_STYLE,
        color: visuals.markerColor,
        backgroundColor: visuals.gutterBackground,
      }}
    >
      {marker}
    </div>
  );
}

function DiffContentCell({ text }: Pick<DiffLine, 'text'>): React.ReactElement {
  return (
    <pre className="text-text-semantic-primary" style={DIFF_CONTENT_CELL_STYLE}>
      {text}
    </pre>
  );
}

const DiffLineRow = memo(function DiffLineRow({
  line,
  oldGutterWidth,
  newGutterWidth,
}: DiffLineRowProps): React.ReactElement {
  const visuals = getDiffVisuals(line.type);
  return (
    <div style={{ ...DIFF_ROW_STYLE, backgroundColor: visuals.backgroundColor }}>
      <DiffLineNumberCell width={oldGutterWidth} value={line.oldLineNo} visuals={visuals} />
      <DiffLineNumberCell width={newGutterWidth} value={line.newLineNo} visuals={visuals} />
      <DiffMarkerCell marker={visuals.marker} visuals={visuals} />
      <DiffContentCell text={line.text} />
    </div>
  );
});

export const DiffView = memo(function DiffView({
  originalContent,
  currentContent,
}: DiffViewProps): React.ReactElement {
  const diffLines = useMemo(
    () => computeDiff(originalContent, currentContent),
    [originalContent, currentContent],
  );
  const stats = useMemo(() => summarizeDiff(diffLines), [diffLines]);
  const gutterWidths = useMemo(() => measureDiffGutters(diffLines), [diffLines]);

  return (
    <div style={DIFF_VIEW_STYLE}>
      <DiffStatsHeader stats={stats} lineCount={diffLines.length} />
      <DiffLinesList diffLines={diffLines} gutterWidths={gutterWidths} />
    </div>
  );
});
