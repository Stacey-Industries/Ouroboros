import React, { memo, useMemo, useState } from 'react';

import type { BlameLine } from '../../types/electron';

export interface BlameGutterProps {
  blameLines: BlameLine[];
  /** The row descriptors from FileViewer (line or fold-placeholder) */
  rows: Array<
    | { type: 'line'; index: number }
    | { type: 'fold-placeholder'; startLine: number; count: number }
  >;
}

type BlameGutterRow = BlameGutterProps['rows'][number];

interface TooltipInfo {
  blame: BlameLine;
  top: number;
  left: number;
}

interface BlameRowProps {
  row: BlameGutterRow;
  blameMap: Map<number, BlameLine>;
  firstInGroup: Set<number>;
  onClick: (event: React.MouseEvent, blame: BlameLine) => void;
}

interface BlameAnnotationRowProps {
  blame: BlameLine;
  backgroundColor: string;
  onClick: (event: React.MouseEvent, blame: BlameLine) => void;
}

interface BlameTooltipProps {
  tooltipInfo: TooltipInfo | null;
  onClose: () => void;
}

const GUTTER_STYLE: React.CSSProperties = {
  flexShrink: 0,
  width: '150px',
  paddingTop: '16px',
  paddingBottom: '16px',
  overflow: 'hidden',
  userSelect: 'none',
  borderRight: '1px solid var(--border-muted)',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  lineHeight: '1.6',
};

const EMPTY_ROW_STYLE: React.CSSProperties = {
  height: '1.6em',
};

const BLAME_ROW_STYLE: React.CSSProperties = {
  height: '1.6em',
  paddingLeft: '6px',
  paddingRight: '6px',
};

const BLAME_ANNOTATION_STYLE: React.CSSProperties = {
  ...BLAME_ROW_STYLE,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const BLAME_AUTHOR_STYLE: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const BLAME_DATE_STYLE: React.CSSProperties = {
  flexShrink: 0,
};

const TOOLTIP_BACKDROP_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 999,
};

const TOOLTIP_CARD_STYLE: React.CSSProperties = {
  position: 'fixed',
  zIndex: 1000,
  backgroundColor: 'var(--surface-panel)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '6px',
  padding: '10px 14px',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
  maxWidth: '350px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  lineHeight: '1.5',
};

const TOOLTIP_HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '4px',
};

const TOOLTIP_HASH_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6875rem',
};

const TOOLTIP_AUTHOR_STYLE: React.CSSProperties = {};

const TOOLTIP_DATE_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem',
};

const TOOLTIP_SUMMARY_STYLE: React.CSSProperties = {
  marginTop: '6px',
  fontWeight: 500,
};

function relativeDate(timestamp: number): string {
  if (!timestamp) return '';
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

function shortAuthor(author: string): string {
  if (!author) return '';
  const firstName = author.split(/\s+/)[0];
  return firstName.length > 10 ? firstName.slice(0, 10) : firstName;
}

function commitColor(hash: string): string {
  if (!hash || hash === '0000000000000000000000000000000000000000') {
    return 'transparent';
  }
  const hue = parseInt(hash.slice(0, 6), 16) % 360;
  return `hsla(${hue}, 40%, 50%, 0.06)`;
}

function buildBlameMap(blameLines: BlameLine[]): Map<number, BlameLine> {
  const map = new Map<number, BlameLine>();
  for (const blameLine of blameLines) {
    map.set(blameLine.line, blameLine);
  }
  return map;
}

function buildFirstInGroup(
  rows: BlameGutterRow[],
  blameMap: Map<number, BlameLine>,
): Set<number> {
  const firstInGroup = new Set<number>();
  let previousHash: string | null = null;

  for (const row of rows) {
    if (row.type !== 'line') {
      previousHash = null;
      continue;
    }
    const hash = blameMap.get(row.index + 1)?.hash ?? null;
    if (hash !== previousHash) firstInGroup.add(row.index);
    previousHash = hash;
  }

  return firstInGroup;
}

function getRowKey(row: BlameGutterRow): string {
  return row.type === 'line' ? `blame-${row.index}` : `blame-fp-${row.startLine}`;
}

function getTooltipInfo(event: React.MouseEvent, blame: BlameLine): TooltipInfo {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { blame, top: rect.bottom + 4, left: rect.left };
}

function formatBlameTitle(blame: BlameLine): string {
  return `${blame.author}, ${relativeDate(blame.date)} - ${blame.summary}`;
}

const BlameAnnotationRow = memo(function BlameAnnotationRow({
  blame,
  backgroundColor,
  onClick,
}: BlameAnnotationRowProps): React.ReactElement {
  return (
    <div
      onClick={(event) => onClick(event, blame)}
      className="text-text-semantic-faint"
      style={{ ...BLAME_ANNOTATION_STYLE, backgroundColor }}
      title={formatBlameTitle(blame)}
    >
      <span className="text-text-semantic-muted" style={BLAME_AUTHOR_STYLE}>{shortAuthor(blame.author)}</span>
      <span className="text-text-semantic-faint" style={BLAME_DATE_STYLE}>{relativeDate(blame.date)}</span>
    </div>
  );
});

const BlameRow = memo(function BlameRow({
  row,
  blameMap,
  firstInGroup,
  onClick,
}: BlameRowProps): React.ReactElement {
  if (row.type === 'fold-placeholder') {
    return <div style={EMPTY_ROW_STYLE} />;
  }

  const blame = blameMap.get(row.index + 1);
  const backgroundColor = blame ? commitColor(blame.hash) : 'transparent';

  if (!blame || !firstInGroup.has(row.index)) {
    return <div style={{ ...BLAME_ROW_STYLE, backgroundColor }} />;
  }

  return (
    <BlameAnnotationRow
      blame={blame}
      backgroundColor={backgroundColor}
      onClick={onClick}
    />
  );
});

const BlameTooltip = memo(function BlameTooltip({
  tooltipInfo,
  onClose,
}: BlameTooltipProps): React.ReactElement | null {
  if (!tooltipInfo) return null;

  const { blame, top, left } = tooltipInfo;
  return (
    <>
      <div onClick={onClose} style={TOOLTIP_BACKDROP_STYLE} />
      <div className="text-text-semantic-primary" style={{ ...TOOLTIP_CARD_STYLE, top: `${top}px`, left: `${left}px` }}>
        <div style={TOOLTIP_HEADER_STYLE}>
          <span className="text-interactive-accent" style={TOOLTIP_HASH_STYLE}>{blame.hash.slice(0, 8)}</span>
          <span className="text-text-semantic-muted" style={TOOLTIP_AUTHOR_STYLE}>{blame.author}</span>
        </div>
        <div className="text-text-semantic-faint" style={TOOLTIP_DATE_STYLE}>
          {new Date(blame.date * 1000).toLocaleString()}
        </div>
        <div className="text-text-semantic-primary" style={TOOLTIP_SUMMARY_STYLE}>{blame.summary}</div>
      </div>
    </>
  );
});

export const BlameGutter = memo(function BlameGutter({
  blameLines,
  rows,
}: BlameGutterProps): React.ReactElement {
  const [tooltipInfo, setTooltipInfo] = useState<TooltipInfo | null>(null);
  const blameMap = useMemo(() => buildBlameMap(blameLines), [blameLines]);
  const firstInGroup = useMemo(() => buildFirstInGroup(rows, blameMap), [rows, blameMap]);

  return (
    <>
      <div aria-hidden="true" style={GUTTER_STYLE}>
        {rows.map((row) => (
          <BlameRow
            key={getRowKey(row)}
            row={row}
            blameMap={blameMap}
            firstInGroup={firstInGroup}
            onClick={(event, blame) => setTooltipInfo(getTooltipInfo(event, blame))}
          />
        ))}
      </div>
      <BlameTooltip tooltipInfo={tooltipInfo} onClose={() => setTooltipInfo(null)} />
    </>
  );
});
