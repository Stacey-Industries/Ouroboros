import React, { useState, useMemo, memo } from 'react';
import type { BlameLine } from '../../types/electron';

export interface BlameGutterProps {
  blameLines: BlameLine[];
  /** The row descriptors from FileViewer (line or fold-placeholder) */
  rows: Array<
    | { type: 'line'; index: number }
    | { type: 'fold-placeholder'; startLine: number; count: number }
  >;
}

/**
 * Format a Unix timestamp as a relative date string.
 */
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

/**
 * Get a short author name (first name or first 10 chars).
 */
function shortAuthor(author: string): string {
  if (!author) return '';
  const firstName = author.split(/\s+/)[0];
  return firstName.length > 10 ? firstName.slice(0, 10) : firstName;
}

/**
 * Generate subtle alternating background colors based on commit hash.
 * Returns a color with very low opacity for visual grouping.
 */
function commitColor(hash: string): string {
  if (!hash || hash === '0000000000000000000000000000000000000000') {
    return 'transparent';
  }
  // Use first 6 chars of hash to derive a hue
  const hue = parseInt(hash.slice(0, 6), 16) % 360;
  return `hsla(${hue}, 40%, 50%, 0.06)`;
}

/**
 * BlameGutter — renders inline git blame annotations alongside code lines.
 *
 * Groups consecutive lines with the same commit and only shows the
 * annotation on the first line of each group.
 */
export const BlameGutter = memo(function BlameGutter({
  blameLines,
  rows,
}: BlameGutterProps): React.ReactElement {
  const [tooltipInfo, setTooltipInfo] = useState<{
    blame: BlameLine;
    top: number;
    left: number;
  } | null>(null);

  // Build a map from 1-based line number to blame info
  const blameMap = useMemo(() => {
    const map = new Map<number, BlameLine>();
    for (const bl of blameLines) {
      map.set(bl.line, bl);
    }
    return map;
  }, [blameLines]);

  // Determine which rows are the "first" in a group of same-commit lines
  const firstInGroup = useMemo(() => {
    const set = new Set<number>();
    let prevHash: string | null = null;

    for (const row of rows) {
      if (row.type !== 'line') {
        prevHash = null;
        continue;
      }
      const blame = blameMap.get(row.index + 1); // blame uses 1-based lines
      const hash = blame?.hash ?? null;
      if (hash !== prevHash) {
        set.add(row.index);
      }
      prevHash = hash;
    }
    return set;
  }, [rows, blameMap]);

  const handleClick = (
    e: React.MouseEvent,
    blame: BlameLine
  ) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipInfo({
      blame,
      top: rect.bottom + 4,
      left: rect.left,
    });
  };

  const handleCloseTooltip = () => {
    setTooltipInfo(null);
  };

  return (
    <>
      <div
        aria-hidden="true"
        style={{
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
        }}
      >
        {rows.map((row) => {
          if (row.type === 'fold-placeholder') {
            return (
              <div
                key={`blame-fp-${row.startLine}`}
                style={{ height: '1.6em' }}
              />
            );
          }

          const blame = blameMap.get(row.index + 1);
          const isFirst = firstInGroup.has(row.index);
          const bgColor = blame ? commitColor(blame.hash) : 'transparent';

          if (!blame || !isFirst) {
            return (
              <div
                key={`blame-${row.index}`}
                style={{
                  height: '1.6em',
                  backgroundColor: bgColor,
                  paddingLeft: '6px',
                  paddingRight: '6px',
                }}
              />
            );
          }

          return (
            <div
              key={`blame-${row.index}`}
              onClick={(e) => handleClick(e, blame)}
              style={{
                height: '1.6em',
                backgroundColor: bgColor,
                paddingLeft: '6px',
                paddingRight: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: 'var(--text-faint)',
              }}
              title={`${blame.author}, ${relativeDate(blame.date)} — ${blame.summary}`}
            >
              <span
                style={{
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {shortAuthor(blame.author)}
              </span>
              <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
                {relativeDate(blame.date)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Tooltip overlay */}
      {tooltipInfo && (
        <>
          {/* Backdrop to close tooltip */}
          <div
            onClick={handleCloseTooltip}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: `${tooltipInfo.top}px`,
              left: `${tooltipInfo.left}px`,
              zIndex: 1000,
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-ui)',
              color: 'var(--text)',
              maxWidth: '350px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              lineHeight: '1.5',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent)',
                  fontSize: '0.6875rem',
                }}
              >
                {tooltipInfo.blame.hash.slice(0, 8)}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {tooltipInfo.blame.author}
              </span>
            </div>
            <div style={{ color: 'var(--text-faint)', fontSize: '0.6875rem' }}>
              {new Date(tooltipInfo.blame.date * 1000).toLocaleString()}
            </div>
            <div
              style={{
                marginTop: '6px',
                color: 'var(--text)',
                fontWeight: 500,
              }}
            >
              {tooltipInfo.blame.summary}
            </div>
          </div>
        </>
      )}
    </>
  );
});
